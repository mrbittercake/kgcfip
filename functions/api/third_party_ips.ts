interface Env {
    IP_KV: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
    const { env } = context;

    // 1. 从 KV 读取配置的源列表
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

    if (!Array.isArray(sources) || sources.length === 0) {
        return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
    }

    // 2. 并发请求所有源地址
    const fetchPromises = sources.map(async (srcUrl) => {
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
    });

    const results = await Promise.all(fetchPromises);
    const allIps = new Map<string, { ip: string; port: number }>();
    const sourceStats: { url: string; count: number; ipCount: number; domainCount: number }[] = [];

    // 3. 解析结果
    results.forEach(result => {
        let count = 0;
        let srcIpCount = 0;
        let srcDomainCount = 0;
        if (result.status === 'ok' && result.text) {
            const lines = result.text.split(/[\r\n]+/); // 兼容各种换行符

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
                const key = `${host}:${finalPort}`;
                const entry: { ip: string; port: number } = { ip: host, port: finalPort };
                allIps.set(key, entry);
                count++;
                const isDomain = !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) && !host.includes(':');
                if (isDomain) srcDomainCount++;
                else srcIpCount++;
            }
        }
        sourceStats.push({ url: result.url, count, ipCount: srcIpCount, domainCount: srcDomainCount });
    });

    const finalIps = Array.from(allIps.values());
    // 区分 IP 与域名条目（去重后）
    let ipCount = 0;
    let domainCount = 0;
    for (const item of finalIps) {
        const isDomain = !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(item.ip) && !item.ip.includes(':');
        if (isDomain) domainCount++;
        else ipCount++;
    }
    return new Response(JSON.stringify({
        total: finalIps.length,
        ipCount,
        domainCount,
        sources: sourceStats,
        ips: finalIps
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
};