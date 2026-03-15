import { ScanResult } from '../utils/scanner';

export interface CloudflareIps {
    ipv4_cidrs: string[];
    cm_cidrs: string[];
    etag?: string;
}

export interface SceneInfo {
    name: string;
}

export interface ThirdPartyData {
    total: number;
    sources: { url: string; count: number }[];
    ips: string[];
}

/**
 * 统一响应处理函数
 * 解析 JSON 响应，自动处理 HTTP 错误状态码
 */
const handleResponse = async <T>(response: Response): Promise<T> => {
    const text = await response.text();

    if (!response.ok) {
        let errorMessage = `请求失败: ${response.status} ${response.statusText}`;
        
        // 统一处理 401 未授权
        if (response.status === 401) {
            throw new Error('登录已过期或无效，请重新登录');
        }

        try {
            const json = JSON.parse(text);
            if (json && json.message) {
                errorMessage = json.message;
            }
        } catch {
            if (text) errorMessage = text;
        }
        throw new Error(errorMessage);
    }

    return text ? JSON.parse(text) : null as any;
}

/**
 * 一个包装了 fetch 的函数，自动添加 Authorization header
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

export async function getThirdPartyIps(): Promise<ThirdPartyData> {
    // 添加时间戳防止缓存
    return handleResponse<ThirdPartyData>(await authedFetch(`/api/third_party_ips?t=${Date.now()}`));
}
