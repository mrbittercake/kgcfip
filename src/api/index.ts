import { ScanResult } from '../utils/scanner';

export interface CloudflareIps {
    ipv4_cidrs: string[];
    cm_cidrs: string[];
    etag?: string;
}

export interface SceneInfo {
    name: string;
}

export interface ThirdPartyIpItem {
    ip: string;
    port: number;
}

export interface ThirdPartySourceStat {
    url: string;
    count: number;
    ipCount: number;
    domainCount: number;
    status: string;
    error?: string;
    ips: ThirdPartyIpItem[];
}

export interface ThirdPartyData {
    total: number;
    ipCount: number; // 去重后的 IP 条目数
    domainCount: number; // 去重后的域名条目数
    sources: { url: string; count: number; ipCount: number; domainCount: number; status?: string; error?: string }[];
    ips: ThirdPartyIpItem[];
}

/**
 * 统一响应处理函数
 * 解析 JSON 响应，自动处理 HTTP 错误状态码
 */
const handleResponse = async <T>(response: Response): Promise<T> => {
    if (!response.ok) {
        let errorMessage = `请求失败: ${response.status} ${response.statusText}`;

        // 统一处理 401 未授权 — 此时 token 已经不可用，清理登录态
        if (response.status === 401) {
            const hadAuth = localStorage.getItem('auth_token') === 'true';
            if (hadAuth) {
                localStorage.removeItem('auth_token');
                localStorage.removeItem('JWT_SECRET');
                localStorage.removeItem('APITOKEN');
                sessionStorage.setItem('auth_expired', 'true');
                window.dispatchEvent(new CustomEvent('auth:expired'));
            }
            throw new Error('登录已过期或无效，请重新登录');
        }

        try {
            const json: Record<string, unknown> = await response.json();
            if (json && json.message) {
                errorMessage = String(json.message);
            }
        } catch {
            // 非 JSON 响应，回退到状态文本
        }
        throw new Error(errorMessage);
    }

    // 204 No Content 或空响应
    const contentType = response.headers.get('content-type');
    if (response.status === 204 || !contentType || !contentType.includes('application/json')) {
        return null as any;
    }

    return response.json() as Promise<T>;
}

/**
 * 一个包装了 fetch 的函数，自动添加 Authorization header
 * 401 自愈逻辑统一在 handleResponse 中处理
 */
const authedFetch = async (url: RequestInfo | URL, options: RequestInit = {}): Promise<Response> => {
    const token = localStorage.getItem('JWT_SECRET');
    const headers = new Headers(options.headers);

    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    return fetch(url, {
        ...options,
        headers,
    });
};

export async function getCloudflareIps(): Promise<CloudflareIps | null> {
    const response = await authedFetch('/api/cf_ips');
    return handleResponse<CloudflareIps>(response);
}

export async function syncCloudflareIps(): Promise<CloudflareIps> {
    const response = await authedFetch('/api/cf_ips', {
        method: 'POST',
    });
    return handleResponse<CloudflareIps>(response);
}

export async function saveResults(sceneName: string, results: ScanResult[], mode: 'overwrite' | 'append'): Promise<void> {
    const response = await authedFetch(`/api/results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneName, results, mode }),
    });
    return handleResponse<void>(response);
}

export async function getScenes(): Promise<SceneInfo[]> {
    // 添加时间戳防止缓存
    return handleResponse<SceneInfo[]>(await authedFetch(`/api/results?t=${Date.now()}`));
}

export async function getSceneResults(name: string): Promise<ScanResult[]> {
    // 添加时间戳防止缓存
    return handleResponse<ScanResult[]>(await authedFetch(`/api/results?scene=${encodeURIComponent(name)}&t=${Date.now()}`));
}

export async function login(password: string): Promise<{ success: boolean; message?: string; token?: string; apiToken?: string }> {
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
        });
        
        const data = await response.json().catch(() => ({})) as { token?: string; apiToken?: string; message?: string };

        if (response.ok) {
            return { success: true, token: data?.token, apiToken: data?.apiToken };
        }
        
        return { success: false, message: data?.message || '登录失败' };
    } catch (e) {
        console.error('Login failed:', e);
        return { success: false, message: '网络请求失败，请检查网络连接' };
    }
}

export async function getThirdPartySources(): Promise<string[]> {
    // 添加时间戳防止缓存
    return handleResponse<string[]>(await authedFetch(`/api/sources?t=${Date.now()}`));
}

export async function saveThirdPartySources(sources: string[]): Promise<void> {
    const response = await authedFetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sources),
    });
    return handleResponse<void>(response);
}

// 获取已配置的第三方源列表（不发起 fetch，避免 CF 子请求上限）
export async function getThirdPartySourceList(): Promise<string[]> {
    return handleResponse<string[]>(await authedFetch(`/api/third_party_ips?t=${Date.now()}`));
}

// 获取单个源的解析结果（每次调用只发 1 个子请求）
export async function getThirdPartySourceIps(srcUrl: string): Promise<ThirdPartySourceStat> {
    return handleResponse<ThirdPartySourceStat>(await authedFetch(`/api/third_party_ips?url=${encodeURIComponent(srcUrl)}&t=${Date.now()}`));
}

export interface ThirdPartyProgress {
    done: number;          // 已完成的源数量
    total: number;         // 源总数
    stat: ThirdPartySourceStat;                    // 刚完成的这个源
    accumulatedStats: ThirdPartyData['sources'];   // 已完成源的统计累计
    accumulatedIps: ThirdPartyIpItem[];            // 已完成源的条目累计（未去重）
}

/**
 * 逐源拉取并合并第三方 IP/域名。
 * 每个源单独请求后端（每次仅 1 个 CF 子请求），从而绕过 Cloudflare
 * 单次调用 50 个子请求的硬上限，支持任意数量的源。
 * onSourceProgress 在每完成一个源时回调，便于前端实时展示解析进度。
 */
export async function getThirdPartyIps(
    onSourceProgress?: (p: ThirdPartyProgress) => void
): Promise<ThirdPartyData> {
    const sources = await getThirdPartySourceList();
    if (!Array.isArray(sources) || sources.length === 0) {
        return { total: 0, ipCount: 0, domainCount: 0, sources: [], ips: [] };
    }

    const allIps = new Map<string, ThirdPartyIpItem>();
    const sourceStats: ThirdPartyData['sources'] = [];
    const accumulatedIps: ThirdPartyIpItem[] = [];
    let grossIp = 0;
    let grossDomain = 0;

    // 逐个请求（非一次性 Promise.all），以便每完成一个就回调进度
    for (let i = 0; i < sources.length; i++) {
        const stat = await getThirdPartySourceIps(sources[i]);
        for (const item of stat.ips) {
            const key = `${item.ip}:${item.port}`;
            allIps.set(key, item);
            accumulatedIps.push(item);
        }
        const statSummary: ThirdPartyData['sources'][number] = {
            url: stat.url,
            count: stat.count,
            ipCount: stat.ipCount,
            domainCount: stat.domainCount,
            status: stat.status,
            error: stat.error
        };
        sourceStats.push(statSummary);
        grossIp += stat.ipCount;
        grossDomain += stat.domainCount;

        if (onSourceProgress) {
            onSourceProgress({
                done: i + 1,
                total: sources.length,
                stat,
                accumulatedStats: [...sourceStats],
                accumulatedIps: [...accumulatedIps]
            });
        }
    }

    const finalIps = Array.from(allIps.values());
    // 去重后重新统计 IP/域名（避免跨源重复导致的总数偏差）
    let dedupIp = 0;
    let dedupDomain = 0;
    for (const item of finalIps) {
        if (isDomainName(item.ip)) dedupDomain++;
        else dedupIp++;
    }

    return {
        total: finalIps.length,
        ipCount: dedupIp,
        domainCount: dedupDomain,
        sources: sourceStats,
        ips: finalIps
    };
}

function isDomainName(host: string): boolean {
    return !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) && !host.includes(':');
}
