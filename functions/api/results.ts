interface Env {
  IP_KV: KVNamespace;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    const body = await request.json() as { sceneName: string; results: any[]; mode: 'overwrite' | 'append' };
    const { sceneName, results, mode } = body;

    if (!sceneName || !results) {
      return new Response(JSON.stringify({ message: '缺少必要参数' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 确保在 Cloudflare Pages 后台绑定了名为 IP_KV 的 KV 命名空间
    if (!env.IP_KV) {
      throw new Error('KV 存储未绑定，请检查 Cloudflare Pages 设置 (变量名应为 IP_KV)');
    }

    const key = `scene:${sceneName}`;
    let finalResults = results;

    if (mode === 'append') {
      // 追加模式：读取旧数据并合并
      const existing = await env.IP_KV.get(key, { type: 'json' }) as any[];
      if (existing && Array.isArray(existing)) {
        // 使用 Map 根据 IP 去重
        const ipMap = new Map(existing.map(item => [item.ip, item]));
        results.forEach(item => ipMap.set(item.ip, item));
        finalResults = Array.from(ipMap.values());
      }
    } else {
      // 覆盖模式(overwrite): 直接使用新数据，KV put 会自动替换旧内容
      finalResults = results;
    }

    await env.IP_KV.put(key, JSON.stringify(finalResults));

    return new Response(JSON.stringify({ success: true, count: finalResults.length }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ message: (err as Error).message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const sceneName = url.searchParams.get('scene');
  
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  };

  try {
    if (sceneName) {
      // 获取特定场景的详细数据
      const key = `scene:${sceneName}`;
      const data = await env.IP_KV.get(key, { type: 'json' });
      return new Response(JSON.stringify(data || []), { headers });
    } else {
      // 列出所有场景
      const list = await env.IP_KV.list({ prefix: 'scene:' });
      const scenes = list.keys.map(k => ({ name: k.name.replace('scene:', '') }));
      return new Response(JSON.stringify(scenes), { headers });
    }
  } catch (err) {
    return new Response(JSON.stringify({ message: (err as Error).message }), { status: 500, headers });
  }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const sceneName = url.searchParams.get('scene');

  if (!sceneName) {
    return new Response(JSON.stringify({ message: 'Missing scene name' }), { status: 400 });
  }

  try {
    await env.IP_KV.delete(`scene:${sceneName}`);
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ message: (err as Error).message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};