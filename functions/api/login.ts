interface Env {
  LOGINPW?: string;
  JWT_SECRET?: string;
  APITOKEN?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  
  try {
    const { password } = await request.json() as { password: string };

    if (!env.LOGINPW || !env.JWT_SECRET) {
        console.error("FATAL: LOGINPW or JWT_SECRET is not configured in environment variables.");
        return new Response(JSON.stringify({ success: false, message: '错误: 环境变量未配置！' }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (password === env.LOGINPW) {
      // 密码正确，直接返回 JWT_SECRET 作为 Token（静态令牌模式）
      // 同时返回 APITOKEN 供前端展示给用户用于公共接口调用
      return new Response(JSON.stringify({ 
        success: true, 
        token: env.JWT_SECRET,
        apiToken: env.APITOKEN 
      }), { headers: { 'Content-Type': 'application/json' } });
    } else {
      return new Response(JSON.stringify({ success: false, message: 'Password incorrect' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: 'Invalid request' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
};