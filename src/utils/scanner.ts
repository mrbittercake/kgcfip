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
}

// =================================================================
// 1. 地区分组逻辑 (源于参考代码)
// =================================================================

export { coloMap, getColoName } from './colo';

// =================================================================
// 2. IP 测速逻辑 (源于参考代码)
// =================================================================

/**
 * 将 IPv4 地址转换为十六进制，用于 nip.lfree.org 技巧
 */
function ipToHex(ip: string): string | null {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipv4Regex.test(ip)) {
        return null;
    }
    return ip.split('.').map(part => parseInt(part, 10).toString(16).padStart(2, '0')).join('');
}

/**
 * 测试单个 IP 的延迟并获取其 Cloudflare colo
 */
async function testIpLatency(ip: string, port: number, timeout: number): Promise<Omit<ScanResult, 'isAvailable' | 'ip' | 'port'>> {
    const controller = new AbortController();

    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const hexIp = ipToHex(ip);    
    const testDomain = hexIp ? `${hexIp}.nip.lfree.org` : `${ip}.nip.lfree.org`;    
    const testUrl = `https://${testDomain}:${port}`;

    try {
        // 第一次请求用于预热 DNS、TLS 等，并获取 colo
        const response1 = await fetch(testUrl, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Cloudflare-IP-Scanner/1.0' }
        });

        if (!response1.ok) {
            return { latency: -1, colo: `HTTP ${response1.status}` };
        }

        let colo = '-';
        try {
            // 这个特殊 worker 的响应体包含 colo 信息
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
            headers: { 'User-Agent': 'Cloudflare-IP-Scanner/1.0' }
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

    constructor(
        ips: string[],
        port: number,
        threads: number,
        latencyLimit: number,
        onProgress: (result: ScanResult) => void,
        onComplete: (results: ScanResult[]) => void
    ) {
        this.ips = ips;
        this.port = port;
        this.threads = Math.min(ips.length, threads);
        this.latencyLimit = latencyLimit;
        this.onProgress = onProgress;
        this.onComplete = onComplete;
        this.abortController = new AbortController();
    }

    public stop() {
        this.abortController.abort();
    }

    public async run() {
        const queue = [...this.ips];
        const finalResults: ScanResult[] = [];

        const worker = async () => {
            while (queue.length > 0) {
                if (this.abortController.signal.aborted) break;

                const rawTarget = queue.shift();
                if (!rawTarget) continue;

                let ip = rawTarget;
                let port = this.port;

                // 尝试解析 IP:Port 格式 (处理 IPv4:Port 和 [IPv6]:Port)
                const lastColonIndex = rawTarget.lastIndexOf(':');
                const closeBracketIndex = rawTarget.lastIndexOf(']');

                if (lastColonIndex > -1 && lastColonIndex > closeBracketIndex) {
                    const portPart = rawTarget.substring(lastColonIndex + 1);
                    const parsedPort = parseInt(portPart, 10);
                    if (!isNaN(parsedPort)) {
                        port = parsedPort;
                        ip = rawTarget.substring(0, lastColonIndex);
                        // 去除 IPv6 的方括号，适配 ipToHex 和域名生成
                        if (ip.startsWith('[') && ip.endsWith(']')) {
                            ip = ip.substring(1, ip.length - 1);
                        }
                    }
                }

                // 如果端口为0（通常在第三方源模式下初始传入0），且未解析出有效端口，则默认为443
                if (port === 0) port = 443;

                const { latency, colo } = await testIpLatency(ip, port, this.latencyLimit);
                
                const result: ScanResult = {
                    ip,
                    port,
                    isAvailable: latency > -1 && latency < this.latencyLimit,
                    latency,
                    colo,
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
