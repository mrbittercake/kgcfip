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
    const allIps = new Set<string>();
    const sourceStats: { url: string; count: number }[] = [];

    // 3. 解析结果
    results.forEach(result => {
        let count = 0;
        if (result.status === 'ok' && result.text) {
            const lines = result.text.split(/[\r\n]+/); // 兼容各种换行符
            
            for (const line of lines) {
                const trimmed = line.trim();
                // 忽略空行、注释或HTML错误页
                if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('<') || trimmed.startsWith('//')) continue;

                // 处理格式: IP:PORT#NAME 或 IP:PORT
                // 取 # 前面的部分
                const [ipPart] = trimmed.split('#');
                if (!ipPart) continue;

                const cleanIpPart = ipPart.trim();
                
                // 简单的正则匹配 IPv4 或 IPv6（可选端口）
                // IPv4: 1.1.1.1 或 1.1.1.1:443
                // IPv6: [2400:cb00::1]:443 或 2400:cb00::1
                
                // 检查是否看起来像 IP (包含数字、点、冒号) 且不包含 HTTP (防止把 URL 当 IP)
                if (/^[0-9a-fA-F:.[\]]+$/.test(cleanIpPart) && !cleanIpPart.toLowerCase().includes('http')) {
                    
                    // 判断是否包含端口
                    // 逻辑：如果最后部分是 :数字，则认为包含端口
                    // 注意 IPv6 的复杂性，如果包含多个 : 且没有 []，我们简单判定
                    
                    const hasPort = /:(\d+)$/.test(cleanIpPart);
                    const finalIp = hasPort ? cleanIpPart : `${cleanIpPart}:443`;
                    
                    allIps.add(finalIp);
                    count++;
                }
            }
        }
        sourceStats.push({ url: result.url, count });
    });

    const finalIps = Array.from(allIps);
    return new Response(JSON.stringify({
        total: finalIps.length,
        sources: sourceStats,
        ips: finalIps
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
};