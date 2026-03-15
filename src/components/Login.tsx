import { useState } from 'react';
import { login } from '../api';
import { Layers, Zap, Filter, ClipboardCopy, Server, Box } from 'lucide-react';

interface LoginProps {
    onLogin: () => void;
}

export function Login({ onLogin }: LoginProps) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password) {
            setError('请输入密码');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const result = await login(password);
            if (result.success) {
                if (result.token) {
                    localStorage.setItem('JWT_SECRET', result.token);
                }
                if (result.apiToken) {
                    localStorage.setItem('APITOKEN', result.apiToken);
                }
                onLogin();
            } else {
                setError(result.message || '密码错误');
            }
        } catch (err) {
            setError('登录请求失败');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-200 dark:from-gray-900 dark:to-gray-800 overflow-y-auto p-4 transition-colors duration-200">
            <main className="flex flex-col items-center gap-12 w-full max-w-5xl mx-auto my-12">
                {/* Top: Header & Description */}
                <div className="text-center text-gray-800 dark:text-gray-200 space-y-4 -mt-4">
                    <div className="flex items-center justify-center gap-4">
                        <img src="/img/logo.svg" alt="Logo" className="w-14 h-14" />
                        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-blue-500 dark:from-purple-400 dark:to-blue-400">私人优选IP管理</h1>
                    </div>
                    <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                        一个强大、私密、高效的 私人优选 IP 管理工具，助您掌控网络连接。
                    </p>
                </div>

                {/* Middle: Login Form */}
                <div className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-lg p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700">
                    <h2 className="text-2xl font-bold mb-6 text-center text-gray-800 dark:text-gray-100">管理员登录</h2>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label htmlFor="password" className="sr-only">Password</label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="appearance-none border border-gray-300 dark:border-gray-600 rounded-lg w-full py-3 px-4 text-gray-700 dark:text-white bg-transparent focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all placeholder:text-gray-400 dark:placeholder:text-gray-500"
                                placeholder="请输入密码"
                            />
                        </div>
                        <div className="h-5 flex items-center justify-center">
                            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                        </div>
                        <button
                            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg focus:outline-none focus:shadow-outline transition-colors disabled:bg-purple-400 disabled:cursor-not-allowed flex items-center justify-center"
                            type="submit"
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    登录中...
                                </>
                            ) : '登 录'}
                        </button>
                    </form>
                </div>

                {/* Bottom: Features */}
                <div className="w-full">
                    <h2 className="text-2xl font-bold mb-10 text-center text-gray-800 dark:text-gray-200 tracking-wider">特色功能</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
                        <div className="flex items-start gap-4 p-4 rounded-xl bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm ring-1 ring-black/5 shadow-lg"><Layers className="w-7 h-7 text-blue-500 shrink-0 mt-1" /><div><h3 className="font-bold text-gray-800 dark:text-gray-100">多源IP获取</h3><p className="text-sm text-gray-600 dark:text-gray-400">聚合官方、社区及自定义第三方IP源，构建专属的IP资源池。</p></div></div>
                        <div className="flex items-start gap-4 p-4 rounded-xl bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm ring-1 ring-black/5 shadow-lg"><Zap className="w-7 h-7 text-yellow-500 shrink-0 mt-1" /><div><h3 className="font-bold text-gray-800 dark:text-gray-100">高并发测速</h3><p className="text-sm text-gray-600 dark:text-gray-400">利用多线程并发测试IP延迟，快速从海量IP中筛选出可用节点。</p></div></div>
                        <div className="flex items-start gap-4 p-4 rounded-xl bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm ring-1 ring-black/5 shadow-lg"><Filter className="w-7 h-7 text-green-500 shrink-0 mt-1" /><div><h3 className="font-bold text-gray-800 dark:text-gray-100">灵活筛选</h3><p className="text-sm text-gray-600 dark:text-gray-400">支持按延迟、地区、数量等多维度筛选测速结果，精确定位所需IP。</p></div></div>
                        <div className="flex items-start gap-4 p-4 rounded-xl bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm ring-1 ring-black/5 shadow-lg"><Box className="w-7 h-7 text-teal-500 shrink-0 mt-1" /><div><h3 className="font-bold text-gray-800 dark:text-gray-100">场景分组</h3><p className="text-sm text-gray-600 dark:text-gray-400">将优选IP按不同网络环境（如家庭、公司）保存为场景，方便快速切换使用。</p></div></div>
                        <div className="flex items-start gap-4 p-4 rounded-xl bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm ring-1 ring-black/5 shadow-lg"><ClipboardCopy className="w-7 h-7 text-purple-500 shrink-0 mt-1" /><div><h3 className="font-bold text-gray-800 dark:text-gray-100">一键导出/复制</h3><p className="text-sm text-gray-600 dark:text-gray-400">支持将筛选结果导出为CSV、TXT等格式，或直接复制到剪贴板，兼容多种客户端。</p></div></div>
                        <div className="flex items-start gap-4 p-4 rounded-xl bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm ring-1 ring-black/5 shadow-lg"><Server className="w-7 h-7 text-indigo-500 shrink-0 mt-1" /><div><h3 className="font-bold text-gray-800 dark:text-gray-100">私有API</h3><p className="text-sm text-gray-600 dark:text-gray-400">为每个场景生成专属API订阅链接，支持参数筛选，轻松集成到其他应用。</p></div></div>
                    </div>
                </div>
            </main>
        </div>
    );
}