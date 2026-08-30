// e:\CODE\kgcfip\src\utils\scanner.ts
/**
 * 扫描结果的数据结构
 */
export interface ScanResult {
    ip: string;
    port: number;
    isAvailable: boolean;
    latency: number;
    colo?: string; // Cloudflare 数据中心代码
    domain?: boolean; // 是否为域名源（保存域名而非解析出的IP）

    // 以下为本地 Agent 测速的扩展字段，浏览器端测速不会产生这些值。
    // 全部可选，保证与原有「保存为场景 / 导出 / 筛选」等逻辑完全兼容。
    tcpMs?: number;        // TCP 三次握手耗时
    tlsMs?: number;        // 累计到 TLS 握手完成的耗时
    error?: string;        // 不可用时的原因
}

/**
 * 判断一个 host 是否为域名（非 IPv4 / IPv6）
 */
export function isDomainName(host: string): boolean {
    // IPv6（含方括号或包含多个冒号）一律视为IP
    if (host.includes(':')) return false;
    // IPv4
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)) return false;
    // 形如 example.com
    return /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/.test(host);
}

/**
 * 通过阿里云公共 DNS (DoH) 将域名解析为 IP（优先 A 记录，其次 AAAA）
 * 使用 dns.alidns.com，在大陆网络环境下可正常访问
 */
export async function resolveDomainToIp(host: string): Promise<string | null> {
    const query = (type: 'A' | 'AAAA') =>
        fetch(`https://dns.alidns.com/resolve?name=${encodeURIComponent(host)}&type=${type}`);

    try {
        const resA = await query('A');
        if (resA.ok) {
            const json = await resA.json() as { Status?: number; Answer?: { type: number; data: string }[] };
            if (json.Status === 0) {
                const a = json.Answer?.find(r => r.type === 1);
                if (a) return a.data;
            }
        }
        const resAAAA = await query('AAAA');
        if (resAAAA.ok) {
            const json = await resAAAA.json() as { Status?: number; Answer?: { type: number; data: string }[] };
            if (json.Status === 0) {
                const aaaa = json.Answer?.find(r => r.type === 28);
                if (aaaa) return aaaa.data;
            }
        }
    } catch {
        // 解析失败
    }
    return null;
}

// =================================================================
// 1. 地区分组逻辑 (源于参考代码)
// =================================================================

export { coloMap, getColoName } from './colo';

// =================================================================
// 2. IP 测速逻辑 (源于参考代码)
// =================================================================

/**
 * 将 IPv4 地址转换为十六进制，用于 nip.cmliussss.hidns.vip 技巧
 */
function ipToHex(ip: string): string | null {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipv4Regex.test(ip)) {
        return null;
    }
    return ip.split('.').map(part => parseInt(part, 10).toString(16).padStart(2, '0')).join('');
}

/**
 * 判断是否为 IPv6 地址
 */
function isIPv6(ip: string): boolean {
    return ip.includes(':');
}

/**
 * 测试单个 IP 的延迟并获取其 Cloudflare colo
 *
 * 浏览器无法直接为任意 IP 设置自定义 TLS SNI，故采用「hex 域名技巧」：
 * 将 IPv4 编码进子域名 <hexIp>.ns.psb.kdns.fr，由 Cloudflare 边缘按
 * ip.json 端点返回 colo；IPv6 则直接连地址并指定 Host 头。
 * 该路径依赖浏览器对测速域名的 DNS 解析，解析不通即自然返回失败，
 * 从而引导用户改用更可靠的「本地 Agent 测速」。
 */
async function testIpLatency(ip: string, port: number, timeout: number): Promise<Omit<ScanResult, 'isAvailable' | 'ip' | 'port'>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const headers: Record<string, string> = { 'User-Agent': 'Cloudflare-IP-Scanner/1.0' };
    let testUrl: string;
    if (isIPv6(ip)) {
        // IPv6 无法使用 hex 技巧，直接连接地址并指定 Host 头部，
        // 由 Cloudflare 边缘按 ip.json 特殊端点返回 colo
        headers['Host'] = 'ns.psb.kdns.fr';
        testUrl = `https://[${ip}]:${port}/ip.json?_t=${Date.now()}`;
    } else {
        // IPv4 通过 IP 转换得到的十六进制拼接测速域名，返回的 JSON 中 "colo" 字段即为机场码
        const hexIp = ipToHex(ip);
        const testDomain = hexIp ? `${hexIp}.ns.psb.kdns.fr` : `${ip}.ns.psb.kdns.fr`;
        testUrl = `https://${testDomain}:${port}/ip.json?_t=${Date.now()}`;
    }

    try {
        // 第一次请求用于预热 DNS、TLS 等，并获取 colo
        const response1 = await fetch(testUrl, {
            signal: controller.signal,
            headers,
        });

        if (!response1.ok) {
            return { latency: -1, colo: `HTTP ${response1.status}` };
        }

        let colo = '-';
        try {
            // 该测速地址的响应体包含 colo 信息 (例如 {"colo": "LAX", ...})
            const data = await response1.json() as { colo?: string };
            if (data?.colo) {
                colo = data.colo;
            }
        } catch (e) {
            // 如果响应不是 JSON，则忽略
        }

        // 第二次请求用于获取更准确的 RTT
        const secondRequestStart = Date.now();
        await fetch(testUrl, {
            signal: controller.signal,
            headers,
        });
        const latency = Date.now() - secondRequestStart;

        return { latency, colo };

    } catch (error: any) {
        if (error.name === 'AbortError') {
            return { latency: -1, colo: 'Timeout' };
        }
        return { latency: -1, colo: 'Error' };
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * 浏览器端测速可用性自检：探测测速域名 ns.psb.kdns.fr 能否被解析。
 * 浏览器逐 IP 测速依赖该域名的 DNS 解析（见 testIpLatency），
 * 若解析不通则说明当前环境无法进行网页测速，应切换到「本地 Agent 测速」兜底。
 */
export async function probeBrowserAvailable(): Promise<boolean> {
    const ip = await resolveDomainToIp('ns.psb.kdns.fr');
    return !!ip;
}

// =================================================================
// 3. 批量扫描器和 IP 生成器
// =================================================================

export class BatchScanner {
    private ips: string[];
    private port: number;
    private threads: number;
    private latencyLimit: number;
    private onProgress: (result: ScanResult) => void;
    private onComplete: (results: ScanResult[]) => void;
    private abortController: AbortController;
    // 解析出的测速IP映射：key 为 "host:port"，value 为实际用于测速的IP（域名解析后）
    private resolvedMap?: Record<string, string | null>;
    private paused = false;
    private resumeResolvers: Array<() => void> = [];

    constructor(
        ips: string[],
        port: number,
        threads: number,
        latencyLimit: number,
        onProgress: (result: ScanResult) => void,
        onComplete: (results: ScanResult[]) => void,
        resolvedMap?: Record<string, string | null>
    ) {
        this.ips = ips;
        this.port = port;
        this.threads = Math.min(ips.length, threads);
        this.latencyLimit = latencyLimit;
        this.onProgress = onProgress;
        this.onComplete = onComplete;
        this.abortController = new AbortController();
        this.resolvedMap = resolvedMap;
    }

    public stop() {
        this.abortController.abort();
    }

    public pause() {
        this.paused = true;
    }

    public resume() {
        this.paused = false;
        const resolvers = this.resumeResolvers;
        this.resumeResolvers = [];
        resolvers.forEach((r) => r());
    }

    /**
     * 解析 "host:port" / "[IPv6]:port" / "host" 字符串
     */
    private parseTarget(rawTarget: string): { host: string; port: number } {
        let host = rawTarget;
        let port = this.port;

        const lastColonIndex = rawTarget.lastIndexOf(':');
        const closeBracketIndex = rawTarget.lastIndexOf(']');

        if (lastColonIndex > -1 && lastColonIndex > closeBracketIndex) {
            const portPart = rawTarget.substring(lastColonIndex + 1);
            const parsedPort = parseInt(portPart, 10);
            if (!isNaN(parsedPort)) {
                port = parsedPort;
                host = rawTarget.substring(0, lastColonIndex);
                if (host.startsWith('[') && host.endsWith(']')) {
                    host = host.substring(1, host.length - 1);
                }
            }
        }

        if (port === 0) port = 443;
        return { host, port };
    }

    public async run() {
        const queue = [...this.ips];
        const finalResults: ScanResult[] = [];

        const worker = async () => {
            while (queue.length > 0) {
                if (this.abortController.signal.aborted) break;
                if (this.paused) {
                    await new Promise<void>((resolve) => { this.resumeResolvers.push(resolve); });
                    if (this.abortController.signal.aborted) break;
                    continue;
                }

                const rawTarget = queue.shift();
                if (!rawTarget) continue;

                const { host, port } = this.parseTarget(rawTarget);

                // 域名源：先用阿里云 DoH 解析出 IP 再用 IP 测速，保存时仍保存域名
                let testHost = host;
                let isDomain = false;
                if (isDomainName(host)) {
                    isDomain = true;
                    const resolved = this.resolvedMap ? (this.resolvedMap[rawTarget] ?? null) : await resolveDomainToIp(host);
                    if (!resolved) {
                        const fail: ScanResult = {
                            ip: host,
                            port,
                            isAvailable: false,
                            latency: -1,
                            colo: 'ResolveFail',
                            domain: true,
                        };
                        finalResults.push(fail);
                        this.onProgress(fail);
                        continue;
                    }
                    testHost = resolved;
                }

                const { latency, colo } = await testIpLatency(testHost, port, this.latencyLimit);

                const result: ScanResult = {
                    ip: isDomain ? host : testHost, // 域名源保存域名，IP源保存IP
                    port,
                    isAvailable: latency > 0 && latency <= this.latencyLimit,
                    latency,
                    colo,
                    domain: isDomain || undefined,
                };

                finalResults.push(result);
                this.onProgress(result);
            }
        };

        const workers = Array(this.threads).fill(null).map(() => worker());
        await Promise.all(workers);

        // 按延迟对成功的结果进行排序
        const sortedResults = finalResults
            .filter(r => r.isAvailable)
            .sort((a, b) => a.latency - b.latency);

        this.onComplete(sortedResults);
    }
}

/**
 * 从 CIDR 块生成随机 IP
 */
function generateRandomIPFromCIDR(cidr: string): string {
    const [baseIP, prefixLength] = cidr.split('/');
    const prefix = parseInt(prefixLength, 10);
    
    if (prefix === 32) return baseIP;

    const hostBits = 32 - prefix;
    const ipParts = baseIP.split('.').map(p => parseInt(p, 10));
    
    const ipInt = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
    const randomOffset = Math.floor(Math.random() * (2 ** hostBits));
    const mask = (0xFFFFFFFF << hostBits) >>> 0;
    const randomIPInt = ((ipInt & mask) >>> 0) + randomOffset;
    
    return [
        (randomIPInt >>> 24) & 0xFF,
        (randomIPInt >>> 16) & 0xFF,
        (randomIPInt >>> 8) & 0xFF,
        randomIPInt & 0xFF
    ].join('.');
}

/**
 * 从 CIDR 列表生成指定数量的随机 IP
 */
export function generateRandomIps(cidrs: string[], count: number): string[] {
    if (!cidrs || cidrs.length === 0) {
        return [];
    }
    const randomIps = new Set<string>();
    const maxAttempts = count * 5; 
    let attempts = 0;

    while (randomIps.size < count && attempts < maxAttempts) {
        const randomCidr = cidrs[Math.floor(Math.random() * cidrs.length)];
        const randomIp = generateRandomIPFromCIDR(randomCidr);
        randomIps.add(randomIp);
        attempts++;
    }
    return Array.from(randomIps);
}

// =================================================================
// 4. 其他工具函数
// =================================================================

/**
 * 根据延迟值获取颜色样式
 */
export const getLatencyColor = (latency: number): string => {
    if (latency < 0) return 'text-gray-400 dark:text-gray-500';
    if (latency < 200) return 'text-green-500 dark:text-green-400';
    if (latency < 500) return 'text-yellow-500 dark:text-yellow-400';
    return 'text-red-500 dark:text-red-400';
};


/**
 * 备用的 Cloudflare CIDR 列表。
 * 此列表已废弃，CIDR数据现在应完全从API/KV中获取。
 * 保留为空数组以确保类型兼容和旧逻辑的平稳过渡。
 */
export const CF_CIDR_LIST: string[] = [];
