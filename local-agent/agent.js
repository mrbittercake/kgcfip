#!/usr/bin/env node
'use strict';

/**
 * kgcfip 本地测速 Agent
 * ------------------------------------------------------------------
 * 纯 Node 实现，零第三方依赖（只用 node 内置模块），Node >= 16 即可运行。
 *
 * 背景：浏览器端测速依赖"把 IP 编码进主机名"的泛解析域名，这类域名
 *       随时可能失效，且浏览器 TLS 会校验 SNI 证书、无法直连 IP。
 *       本地 Agent 直接对 IP 建连，用 speed.cloudflare.com 作为
 *       SNI/Host（Cloudflare 官方域名，在任意 CF 边缘节点上都有有效证书），
 *       从而彻底摆脱对泛解析域名的依赖。
 *
 * 运行模式：
 *   serve      常驻本地 HTTP 服务。网页直接连本机端口下发任务、
 *              轮询进度、取回结果，不经任何服务端中转。
 *
 * 安全说明：
 *   服务只监听 127.0.0.1（本机回环），仅供本机网页调用。
 *   网页与本地服务之间的通信无需令牌：localhost / 127.0.0.1 仅本机可达，
 *   不存在跨网络泄露风险。
 */

const fs = require('fs');
const path = require('path');
const net = require('net');
const tls = require('tls');
const os = require('os');
const http = require('http');
const crypto = require('crypto');

const VERSION = '1.1.0';
const SCRIPT_DIR = __dirname;
const CONFIG_PATH = path.join(SCRIPT_DIR, 'config.json');

// ==================================================================
// 默认配置
// ==================================================================
const DEFAULTS = {
  // ---- 本地服务 ----
  listenPort: 15888,        // 起始端口，被占用则依次 +1，最多试 10 个
  listenHost: '127.0.0.1',  // 只监听回环，不对外暴露

  // ---- 测速参数（网页下发时可覆盖）----
  port: 443,
  threads: 32,
  timeoutMs: 2500,
  latencyLimit: 1000,
  sni: 'speed.cloudflare.com',
  httpHost: 'speed.cloudflare.com',
  tracePath: '/cdn-cgi/trace',
};

// ==================================================================
// 终端输出
// ==================================================================
const USE_COLOR = process.stdout.isTTY && process.platform !== 'win32';
const C = {
  reset: USE_COLOR ? '\x1b[0m' : '',
  dim: USE_COLOR ? '\x1b[2m' : '',
  red: USE_COLOR ? '\x1b[31m' : '',
  green: USE_COLOR ? '\x1b[32m' : '',
  yellow: USE_COLOR ? '\x1b[33m' : '',
  cyan: USE_COLOR ? '\x1b[36m' : '',
  bold: USE_COLOR ? '\x1b[1m' : '',
};
const log = (...a) => console.log(...a);
const info = (...a) => console.log(`${C.cyan}[info]${C.reset}`, ...a);
const ok = (...a) => console.log(`${C.green}[ ok ]${C.reset}`, ...a);
const warn = (...a) => console.log(`${C.yellow}[warn]${C.reset}`, ...a);
const err = (...a) => console.log(`${C.red}[fail]${C.reset}`, ...a);

const now = () => Number(process.hrtime.bigint() / 1000n) / 1000;
const rint = (v) => Math.round(v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ==================================================================
// 配置加载
// ==================================================================
function loadConfig() {
  let fileCfg = {};

  if (fs.existsSync(CONFIG_PATH)) {
    try {
      fileCfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    } catch (e) {
      warn(`config.json 解析失败，改用默认配置：${e.message}`);
      fileCfg = {};
    }
  }

  const cfg = { ...DEFAULTS, ...fileCfg };

  // 命令行覆盖（--xxx 形式，可与 config 文件混用，命令行优先）
  const ALIASES = {
    timeout: 'timeoutMs',
    limit: 'latencyLimit',
    latency: 'latencyLimit',
    concurrency: 'threads',
    server: 'listenPort',
    listenport: 'listenPort',
  };

  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const [rawKey, inlineVal] = a.slice(2).split('=');
    const camel = rawKey.replace(/-(\w)/g, (_, c) => c.toUpperCase());
    const key = ALIASES[camel] || camel;

    let val = inlineVal;
    if (val === undefined) {
      val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    }
    if (!(key in cfg)) {
      warn(`未知参数 --${rawKey}，已忽略。可用 --help 查看全部参数。`);
      continue;
    }
    if (typeof cfg[key] === 'number') {
      const n = Number(val);
      if (Number.isNaN(n)) warn(`参数 --${rawKey} 需要数字，收到 "${val}"，已忽略。`);
      else cfg[key] = n;
    } else if (typeof cfg[key] === 'boolean') {
      cfg[key] = val !== 'false' && val !== '0';
    } else {
      cfg[key] = val;
    }
  }

  // 首次运行：生成并持久化基础配置（仅端口，其余均用 DEFAULTS 内置值）。
  // 测速参数由网页在前端配置并随 /scan 请求下发，不再写入 config.json。
  if (!fs.existsSync(CONFIG_PATH)) {
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify({ listenPort: cfg.listenPort }, null, 2), 'utf-8');
    } catch (e) {
      warn(`无法写入 config.json（${e.message}）。`);
    }
  }

  return cfg;
}

// ==================================================================
// 极简 HTTP/1.1 客户端（跑在已建立的 TLS socket 上）
// ==================================================================
function httpGet(socket, httpHost, reqPath, timeoutMs, onFirstByte) {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    let headersDone = false;
    let headEnd = -1;
    let settled = false;
    let contentLength = null;
    let status = 0;
    const headers = {};

    const cleanup = () => {
      clearTimeout(timer);
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      socket.removeListener('close', onClose);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      const body = buf.slice(headEnd + 4).toString('latin1');
      resolve({ status, headers, body });
    };

    const onData = (chunk) => {
      if (onFirstByte) { onFirstByte(); onFirstByte = null; }
      buf = Buffer.concat([buf, chunk]);

      if (!headersDone) {
        headEnd = buf.indexOf('\r\n\r\n');
        if (headEnd !== -1) {
          headersDone = true;
          const lines = buf.slice(0, headEnd).toString('latin1').split('\r\n');
          status = parseInt(lines[0].split(' ')[1], 10) || 0;
          for (const line of lines.slice(1)) {
            const idx = line.indexOf(':');
            if (idx > 0) headers[line.slice(0, idx).toLowerCase()] = line.slice(idx + 1).trim();
          }
          if (headers['content-length'] !== undefined) {
            contentLength = parseInt(headers['content-length'], 10);
          }
        }
      }
      if (headersDone) {
        const bodyLen = buf.length - (headEnd + 4);
        if (contentLength !== null && bodyLen >= contentLength) finish();
      }
    };
    const onError = (e) => { if (!settled) { settled = true; cleanup(); reject(e); } };
    const onClose = () => {
      if (headersDone) finish();
      else onError(new Error('connection closed before headers'));
    };
    const timer = setTimeout(() => onError(new Error('http timeout')), timeoutMs);

    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('close', onClose);

    socket.write(
      `GET ${reqPath} HTTP/1.1\r\n` +
      `Host: ${httpHost}\r\n` +
      `User-Agent: kgcfip-agent/${VERSION}\r\n` +
      `Accept: */*\r\n` +
      `Connection: close\r\n\r\n`
    );
  });
}

// ==================================================================
// 核心：单目标延迟测速（TCP -> TLS -> HTTP trace）
// ==================================================================
function measureLatency(host, port, opt) {
  return new Promise((resolve) => {
    const t0 = now();
    const out = {
      ip: host,
      port,
      tcpMs: -1,
      tlsMs: -1,
      httpMs: -1,
      latency: -1,
      colo: '',
      loc: '',
      status: 0,
      ok: false,
      error: '',
      ts: Date.now(),
    };

    let settled = false;
    let tcpSocket = null;
    let tlsSocket = null;
    let timer = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      try { if (tlsSocket) tlsSocket.destroy(); } catch (_) { /* noop */ }
      try { if (tcpSocket) tcpSocket.destroy(); } catch (_) { /* noop */ }
    };
    const done = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error && !out.error) out.error = String(error.message || error);
      // 必须 200 + 收到首字节 + 延迟在阈值内，三者同时满足才算可用
      out.ok = out.status === 200 && out.httpMs > 0 && out.latency > 0 && out.latency <= opt.latencyLimit;
      resolve(out);
    };

    timer = setTimeout(() => done(new Error('timeout')), opt.timeoutMs * 3 + 500);

    const isIPv6 = host.includes(':');
    const connectHost = isIPv6 ? host.replace(/^\[|\]$/g, '') : host;

    tcpSocket = net.connect({ host: connectHost, port, family: isIPv6 ? 6 : 4 });
    tcpSocket.setTimeout(opt.timeoutMs);
    tcpSocket.on('timeout', () => done(new Error('tcp timeout')));
    tcpSocket.on('error', (e) => done(e));

    tcpSocket.on('connect', () => {
      out.tcpMs = rint(now() - t0);
      try {
        tlsSocket = tls.connect({
          socket: tcpSocket,
          servername: opt.sni,
          rejectUnauthorized: false,
          ALPNProtocols: ['http/1.1'],
        });
      } catch (e) {
        return done(e);
      }
      tlsSocket.setTimeout(opt.timeoutMs);
      tlsSocket.on('timeout', () => done(new Error('tls timeout')));
      tlsSocket.on('error', (e) => done(e));

      tlsSocket.on('secureConnect', () => {
        out.tlsMs = rint(now() - t0);
        httpGet(tlsSocket, opt.httpHost, `${opt.tracePath}?_t=${Date.now()}`, opt.timeoutMs, () => {
          out.httpMs = rint(now() - t0);
          out.latency = out.httpMs;
        })
          .then((res) => {
            out.status = res.status;
            if (res.status !== 200) {
              out.error = `HTTP ${res.status}`;
              return done();
            }
            for (const line of res.body.split('\n')) {
              const m = line.match(/^\s*(colo|loc)\s*=\s*(.*?)\s*$/);
              if (m) {
                if (m[1] === 'colo') out.colo = m[2];
                else out.loc = m[2];
              }
            }
            if (res.headers['cf-ray']) {
              const ray = res.headers['cf-ray'];
              if (!out.colo) out.colo = ray.split('-').pop() || '';
            }
            done();
          })
          .catch(done);
      });
    });
  });
}

// ==================================================================
// 并发池（支持中途停止）
// ==================================================================
async function runPool(items, concurrency, worker, shouldStop) {
  let cursor = 0;
  const results = [];
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  const runners = [];

  for (let i = 0; i < n; i++) {
    runners.push((async () => {
      while (true) {
        if (shouldStop && shouldStop()) return;
        const idx = cursor++;
        if (idx >= items.length) return;
        results.push(await worker(items[idx], idx));
      }
    })());
  }
  await Promise.all(runners);
  return results;
}

// ==================================================================
// 模式一：本地 HTTP 服务（网页直连）
// ==================================================================

/** 当前扫描状态 */
const scan = {
  running: false,
  taskId: null,
  stopRequested: false,
  results: [],
  done: 0,
  total: 0,
  startedAt: 0,
  finishedAt: 0,
  config: null,
};

function setCors(req, res) {
  // 回显来源而不是用 '*'：Chrome 本地网络访问（LNA）预检要求明确来源
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'Content-Type, Access-Control-Request-Private-Network');
  // Chrome 本地网络访问（Local Network Access）预检要求
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function sendJson(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      // 防御：拒绝过大的请求体
      if (data.length > 32 * 1024 * 1024) { reject(new Error('payload too large')); req.destroy(); }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function normalizeTargets(payload) {
  const out = [];
  const seen = new Set();

  if (Array.isArray(payload.targets) && payload.targets.length > 0) {
    for (const t of payload.targets) {
      if (typeof t === 'string') {
        out.push({ host: t, ip: t, port: payload.port || 443 });
      } else if (t && t.ip) {
        out.push({
          host: t.host || t.ip,
          ip: t.ip,
          port: Number(t.port) || Number(payload.port) || 443,
        });
      }
    }
  } else if (Array.isArray(payload.ips)) {
    for (const ip of payload.ips) {
      out.push({ host: String(ip), ip: String(ip), port: Number(payload.port) || 443 });
    }
  }

  // 去重
  const uniq = [];
  for (const t of out) {
    const k = `${t.host}|${t.ip}|${t.port}`;
    if (!seen.has(k)) { seen.add(k); uniq.push(t); }
  }
  return uniq;
}

async function startScan(payload, cfg) {
  if (scan.running) return { error: '已有任务正在运行，请先停止或等待完成', code: 409 };

  const targets = normalizeTargets(payload);
  if (targets.length === 0) return { error: '没有可测速的目标', code: 400 };

  const opt = {
    threads: Number(payload.threads) || cfg.threads || 32,
    timeoutMs: Number(payload.timeoutMs) || cfg.timeoutMs || 2500,
    latencyLimit: Number(payload.latencyLimit) || cfg.latencyLimit || 1000,
    sni: payload.sni || cfg.sni,
    httpHost: payload.httpHost || cfg.httpHost,
    tracePath: cfg.tracePath,
  };
  if (opt.threads < 1) opt.threads = 1;
  if (opt.threads > 512) opt.threads = 512;

  scan.running = true;
  scan.stopRequested = false;
  scan.taskId = `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
  scan.results = [];
  scan.done = 0;
  scan.total = targets.length;
  scan.startedAt = Date.now();
  scan.finishedAt = 0;
  scan.config = { ...opt, source: payload.source || '' };

  info(`收到任务 ${scan.taskId}：${targets.length} 个目标，端口按条目指定，并发 ${opt.threads}，延迟上限 ${opt.latencyLimit}ms`);

  // 异步执行，接口立即返回
  const renderProgress = () => {
    const total = scan.total || 0;
    const done = scan.done || 0;
    const pct = total ? done / total : 0;
    const filled = Math.round(30 * pct);
    const bar = '█'.repeat(filled) + '░'.repeat(30 - filled);
    let okCount = 0;
    for (const r of scan.results) if (r.ok) okCount++;
    process.stdout.write(`\r  ${bar} ${done}/${total}  可用 ${okCount}   `);
  };
  const clearProgressLine = () => process.stdout.write('\r' + ' '.repeat(60) + '\r');

  (async () => {
    const progressTimer = setInterval(renderProgress, 200);
    try {
      const results = await runPool(
        targets,
        opt.threads,
        async (t) => {
          const r = await measureLatency(t.ip, t.port, opt);
          // 回显 host：域名源要保留域名，而不是解析出的 IP
          r.host = t.host;
          r.port = t.port;
          scan.results.push(r);
          scan.done = scan.results.length;
          return r;
        },
        () => scan.stopRequested
      );

      scan.running = false;
      scan.finishedAt = Date.now();
      clearInterval(progressTimer);
      clearProgressLine();
      const okCount = scan.results.filter((r) => r.ok).length;
      ok(`任务 ${scan.taskId} 完成：${scan.results.length}/${targets.length} 已测，可用 ${okCount} 个，耗时 ${((scan.finishedAt - scan.startedAt) / 1000).toFixed(1)}s`);
    } catch (e) {
      clearInterval(progressTimer);
      clearProgressLine();
      scan.running = false;
      scan.finishedAt = Date.now();
      err(`任务 ${scan.taskId} 异常：${e && e.stack ? e.stack : e}`);
    }
  })();

  return { started: true, taskId: scan.taskId, total: targets.length };
}

async function runServe(cfg) {
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const route = u.pathname;

    setCors(req, res);

    // CORS 预检
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    // ---- 状态探测：供网页判断服务是否在线（无需鉴权）----
    if (route === '/status' && req.method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        service: 'kgcfip-agent',
        version: VERSION,
        agentId: os.hostname(),
        running: scan.running,
        task: scan.running
          ? { taskId: scan.taskId, done: scan.done, total: scan.total, startedAt: scan.startedAt }
          : null,
      });
    }

    // 本地服务只监听 127.0.0.1，所有接口对网页开放，无需令牌
    try {
      if (route === '/scan' && req.method === 'POST') {
        const payload = await readBody(req);
        const started = await startScan(payload, cfg);
        if (started.error) return sendJson(res, started.code || 400, { ok: false, error: started.error });
        return sendJson(res, 200, { ok: true, ...started });
      }

      if (route === '/progress' && req.method === 'GET') {
        const since = Math.max(0, parseInt(u.searchParams.get('since') || '0', 10) || 0);
        const slice = scan.results.slice(since);
        return sendJson(res, 200, {
          ok: true,
          taskId: scan.taskId,
          running: scan.running,
          done: scan.done,
          total: scan.total,
          since,
          count: slice.length,
          results: slice,
          startedAt: scan.startedAt,
          finishedAt: scan.finishedAt,
        });
      }

      if (route === '/stop' && req.method === 'POST') {
        if (!scan.running) return sendJson(res, 200, { ok: true, stopped: false, message: '当前没有运行中的任务' });
        scan.stopRequested = true;
        info('收到停止指令，正在收尾...');
        return sendJson(res, 200, { ok: true, stopped: true });
      }

      return sendJson(res, 404, { ok: false, error: `未知接口 ${route}` });
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: String((e && e.message) || e) });
    }
  });

  // 从起始端口开始试，被占用则 +1
  const maxTries = 10;
  let port = cfg.listenPort;
  for (let i = 0; i < maxTries; i++) {
    const tryPort = cfg.listenPort + i;
    const okBind = await new Promise((resolve) => {
      const onError = (e) => {
        if (e.code === 'EADDRINUSE') resolve(false);
        else resolve(false);
      };
      server.once('error', onError);
      server.listen(tryPort, cfg.listenHost, () => {
        server.removeListener('error', onError);
        resolve(true);
      });
    });
    if (okBind) { port = tryPort; break; }
    if (i === maxTries - 1) {
      err(`端口 ${cfg.listenPort} ~ ${cfg.listenPort + maxTries - 1} 均被占用，无法启动服务。`);
      process.exit(1);
    }
  }

  log('');
  log(`  ${C.bold}kgcfip 本地测速 Agent${C.reset}  ${C.dim}v${VERSION}${C.reset}`);
  log(`  ${C.dim}──────────────────────────────────────────${C.reset}`);
  log('');
  ok(`服务已启动：${C.bold}http://${cfg.listenHost}:${port}${C.reset}`);
  log('');
  log(`  ${C.dim}网页端「本地测速」将通过此端口下发测速任务并取回结果。${C.reset}`);
  log(`  ${C.dim}按 Ctrl+C 停止服务${C.reset}`);
  log('');

  process.on('SIGINT', () => {
    log('');
    info('正在关闭服务...');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500);
  });
}

// ==================================================================
// 入口
// ==================================================================
const HELP = `
${C.bold}kgcfip 本地测速 Agent v${VERSION}${C.reset}

${C.bold}用法${C.reset}
  node agent.js [选项]

${C.bold}serve 模式选项${C.reset}
  --listen-port <端口>   监听端口，默认 15888（被占用则自动 +1，最多试 10 个）

${C.bold}测速参数（网页下发时以网页参数为准）${C.reset}
  --port <端口>          目标端口，默认 443
  --threads <数量>       并发数，默认 32
  --timeout <毫秒>       单阶段超时，默认 2500
  --latencyLimit <ms>    延迟上限，超过视为不可用，默认 1000

${C.bold}示例${C.reset}
  ${C.cyan}# 启动本地服务（网页直连）${C.reset}
  node agent.js
`;

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(HELP);
    return;
  }
  const cfg = loadConfig();
  await runServe(cfg);
}

main().catch((e) => {
  err(`运行异常：${e && e.stack ? e.stack : e}`);
  process.exit(1);
});
