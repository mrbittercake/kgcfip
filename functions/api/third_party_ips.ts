interface Env {
    IP_KV: KVNamespace;
}

interface ParsedEntry {
    ip: string;
    port: number;
}

interface SourceResult {
    url: string;
    status: string;
    code?: number;
    error?: string;
    text?: string;
}

const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;

function isDomainName(host: string): boolean {
    return !IPV4_RE.test(host) && !host.includes(':');
}

// 解析单个源的文本内容为条目数组
function parseSource(text: string): ParsedEntry[] {
    const entries: ParsedEntry[] = [];
    const lines = text.split(/[\r\n]+/); // 兼容各种换行符

    for (const line of lines) {
        const trimmed = line.trim();
        // 忽略空行、注释或HTML错误页
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('<') || trimmed.startsWith('//')) continue;

        // 处理格式: HOST:PORT#NAME 或 HOST:PORT
        // HOST 可以是 IP 或域名，取 # 前面的部分（#NAME 部分忽略）
        const hashIndex = trimmed.indexOf('#');
        const ipPart = (hashIndex > -1 ? trimmed.substring(0, hashIndex) : trimmed).trim();
        if (!ipPart) continue;

        // 检查是否包含 HTTP（防止把完整 URL 当条目）
        if (ipPart.toLowerCase().includes('http')) continue;

        // 拆分 host 与 port（支持 IPv4:PORT、[IPv6]:PORT、域名:PORT）
        let host = ipPart;
        let port: number | undefined;
        const lastColon = ipPart.lastIndexOf(':');
        const closeBracket = ipPart.lastIndexOf(']');
        if (lastColon > -1 && lastColon > closeBracket) {
            const portPart = ipPart.substring(lastColon + 1);
            const parsedPort = parseInt(portPart, 10);
            if (!isNaN(parsedPort)) {
                port = parsedPort;
                host = ipPart.substring(0, lastColon);
                if (host.startsWith('[') && host.endsWith(']')) {
                    host = host.substring(1, host.length - 1);
                }
            }
        }

        const finalPort = port ?? 443;
        entries.push({ ip: host, port: finalPort });
    }
    return entries;
}

async function fetchOne(srcUrl: string): Promise<SourceResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时

    try {
        const r = await fetch(srcUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; CF-Scanner-Backend/1.0)'
            },
            cf: {
                cacheTtl: 60, // 对源站结果缓存60秒
                cacheEverything: true
            }
        });

        if (!r.ok) {
            return { url: srcUrl, status: 'error', code: r.status, error: `Status ${r.status}` };
        }
        const text = await r.text();
        return { url: srcUrl, status: 'ok', text };
    } catch (err) {
        if ((err as Error).name === 'AbortError') {
            return { url: srcUrl, status: 'error', error: 'Timeout' };
        }
        return { url: srcUrl, status: 'error', error: (err as Error).message };
    } finally {
        clearTimeout(timeoutId);
    }
}

// 单个源的统计结构（含解析明细），供前端逐源调用合并
function buildSourceStat(result: SourceResult): {
    url: string;
    count: number;
    ipCount: number;
    domainCount: number;
    status: string;
    error?: string;
    ips: ParsedEntry[];
} {
    let count = 0;
    let ipCount = 0;
    let domainCount = 0;
    const ips: ParsedEntry[] = [];

    if (result.status === 'ok' && result.text) {
        const entries = parseSource(result.text);
        for (const entry of entries) {
            ips.push(entry);
            count++;
            if (isDomainName(entry.ip)) domainCount++;
            else ipCount++;
        }
    }

    return {
        url: result.url,
        count,
        ipCount,
        domainCount,
        status: result.status,
        error: result.status === 'error' ? result.error : undefined,
        ips
    };
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
    const { env, request } = context;
    const url = new URL(request.url);
    const target = url.searchParams.get('url');

    // 单源模式：?url=xxx —— 每次调用只发 1 个子请求，规避 CF 子请求总数上限
    if (target) {
        const result = await fetchOne(target);
        const stat = buildSourceStat(result);
        return new Response(JSON.stringify(stat), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // 列表模式：返回已配置的源列表（不发起 fetch，由前端逐源调用单源接口）
    const sourcesRaw = await env.IP_KV.get('third_party_sources');
    if (!sourcesRaw) {
        return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
    }

    let sources: string[] = [];
    try {
        sources = JSON.parse(sourcesRaw);
    } catch (e) {
        return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
    }

    if (!Array.isArray(sources)) sources = [];

    return new Response(JSON.stringify(sources), {
        headers: { 'Content-Type': 'application/json' }
    });
};
