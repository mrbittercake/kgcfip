interface Env {
    IP_KV: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
    const { env } = context;
    // 使用 wrangler.toml 中定义的 IP_KV
    const sources = await env.IP_KV.get('third_party_sources');
    return new Response(sources || '[]', {
        headers: { 'Content-Type': 'application/json' }
    });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
    const { request, env } = context;
    try {
        const sources = await request.json();
        if (!Array.isArray(sources)) {
            return new Response(JSON.stringify({ message: '数据格式错误' }), { status: 400 });
        }
        // 存储到 KV
        await env.IP_KV.put('third_party_sources', JSON.stringify(sources));
        return new Response(null, { status: 204 });
    } catch (err) {
        return new Response(JSON.stringify({ message: '解析请求失败' }), { status: 400 });
    }
};
