interface Env {
    JWT_SECRET: string;
}

/**
 * 这个中间件会拦截所有 /api/* 的请求
 */
export const onRequest: PagesFunction<Env> = async (context) => {
    const { request, env, next } = context;
    const url = new URL(request.url);

    // 公共接口：登录接口不需要鉴权；getips 接口使用 URL 参数鉴权，也跳过此处的 Bearer 检查
    if (url.pathname === '/api/login' || url.pathname === '/api/getips') {
        return await next();
    }

    // 受保护的接口：检查 Authorization Header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response('Unauthorized: Missing or invalid token.', { status: 401 });
    }

    const token = authHeader.substring(7); // 提取 "Bearer " 后面的 token

    if (!env.JWT_SECRET) {
        console.error("FATAL: JWT_SECRET is not configured in environment variables.");
        return new Response('Internal Server Error: Auth is not configured.', { status: 500 });
    }

    // 简单比对 Token 是否等于环境变量中的 JWT_SECRET
    if (token === env.JWT_SECRET) {
        return await next(); // 验证通过，放行请求到具体的接口函数
    } else {
        return new Response('Unauthorized: Invalid or expired token.', { status: 401 });
    }
};