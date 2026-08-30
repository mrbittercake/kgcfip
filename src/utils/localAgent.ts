/**
 * 本地 Agent 服务客户端
 * ------------------------------------------------------------------
 * 网页直接连本机 127.0.0.1 上的 Agent 服务下发测速任务、轮询进度、取回结果，
 * 不经任何服务端中转，因此页面上的参数可以原样下发给本机执行。
 *
 * 网页与本地服务之间无需令牌：localhost / 127.0.0.1 仅本机可达，不存在
 * 跨网络泄露风险。
 *
 * 浏览器兼容性说明：
 *   HTTPS 页面请求 http://127.0.0.1 属于"混合内容"，但 W3C 规范与
 *   Chrome / Edge / Firefox 均把 localhost 与 127.0.0.1 视为
 *   "潜在可信来源"，对此类请求放行。Safari 较严格，若被拦截，
 *   可改用 http 方式访问本站点。
 */

/** Agent 默认端口（与本地服务 listenPort 一致；被占用时服务会自动 +1） */
export const DEFAULT_AGENT_PORT = 15888;

/** 探测时向后尝试的端口数量（服务端口被占用会自动 +1，故多探几个以保证命中） */
const PROBE_PORT_RANGE = 10;

export interface AgentStatus {
    ok: boolean;
    service?: string;
    version?: string;
    agentId?: string;
    running: boolean;
    task: { taskId: string; done: number; total: number; startedAt: number } | null;
}

export interface AgentResult {
    host: string;   // 展示用（域名源时为域名）
    ip: string;     // 实际连接的 IP
    port: number;
    tcpMs: number;
    tlsMs: number;
    latency: number;
    colo: string;
    loc: string;
    ok: boolean;
    error: string;
    status: number;
    ts: number;
}

export interface AgentProgress {
    ok: boolean;
    taskId: string | null;
    running: boolean;
    done: number;
    total: number;
    since: number;
    count: number;
    results: AgentResult[];
    startedAt: number;
    finishedAt: number;
}

/** 下发给本地 Agent 的测速参数（直接取自页面上的配置） */
export interface AgentScanPayload {
    targets: { host: string; ip: string; port: number }[];
    threads: number;
    timeoutMs: number;
    latencyLimit: number;
    sni?: string;
    httpHost?: string;
    source?: string;
}

export type AgentProbeResult =
    | { online: true; baseUrl: string; status: AgentStatus }
    | { online: false; reason: 'offline' | 'occupied' };

// ==================================================================
// 基础请求封装
// ==================================================================
async function agentFetch(
    baseUrl: string,
    path: string,
    init: RequestInit = {},
    timeoutMs = 4000
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(init.headers as Record<string, string> | undefined),
        };
        return await fetch(`${baseUrl}${path}`, { ...init, headers, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

// ==================================================================
// 探测本地服务是否在线
// ==================================================================
export async function probeLocalAgent(port: number = DEFAULT_AGENT_PORT): Promise<AgentProbeResult> {
    // 从用户设置的端口开始，依次向后探测（服务端口被占用会自动 +1）
    const attempts = Array.from({ length: PROBE_PORT_RANGE }, (_, i) => port + i).map(async (p) => {
        const baseUrl = `http://127.0.0.1:${p}`;
        try {
            const res = await agentFetch(baseUrl, '/status', { method: 'GET' }, 2500);
            if (!res.ok) return null;
            const status = (await res.json()) as AgentStatus;
            if (!status || status.service !== 'kgcfip-agent') return null;
            return { baseUrl, status };
        } catch {
            return null;
        }
    });

    const settled = await Promise.all(attempts);
    const hit = settled.find((x): x is { baseUrl: string; status: AgentStatus } => !!x);
    if (!hit) return { online: false, reason: 'offline' };

    return { online: true, baseUrl: hit.baseUrl, status: hit.status };
}

// ==================================================================
// 下发 / 轮询 / 停止
// ==================================================================
export async function startAgentScan(
    baseUrl: string,
    payload: AgentScanPayload
): Promise<{ taskId: string; total: number }> {
    const res = await agentFetch(baseUrl, '/scan', {
        method: 'POST',
        body: JSON.stringify(payload),
    }, 10000);

    const data = await res.json().catch(() => ({})) as {
        ok?: boolean; error?: string; taskId?: string; total?: number;
    };
    if (res.status === 409) throw new Error('本地 Agent 正在执行其它任务，请等待完成或先停止');
    if (!res.ok || !data.ok) throw new Error(data.error || `下发任务失败（HTTP ${res.status}）`);
    if (!data.taskId) throw new Error('本地 Agent 未返回任务 ID');
    return { taskId: data.taskId, total: data.total ?? payload.targets.length };
}

export async function fetchAgentProgress(
    baseUrl: string,
    since: number
): Promise<AgentProgress> {
    const res = await agentFetch(baseUrl, `/progress?since=${since}`, { method: 'GET' }, 6000);
    if (!res.ok) throw new Error(`读取进度失败（HTTP ${res.status}）`);
    return (await res.json()) as AgentProgress;
}

export async function stopAgentScan(baseUrl: string): Promise<void> {
    try {
        await agentFetch(baseUrl, '/stop', { method: 'POST' }, 3000);
    } catch {
        // 停止失败不影响前端收尾
    }
}
