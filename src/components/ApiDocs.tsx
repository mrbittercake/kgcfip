import { useToast } from './Toast';
import { Copy, Key } from 'lucide-react';

interface ApiDocsProps {
    apiToken: string;
}

export function ApiDocs({ apiToken }: ApiDocsProps) {
    const { showToast } = useToast();

    return (
        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 mb-8">
            <div className="flex items-center gap-3 mb-4">
                <Key className="w-7 h-7 text-orange-500" />
                <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-200">API接口</h2>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                使用以下链接获取纯文本格式的优选IP列表：
            </p>
            <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono text-gray-800 dark:text-gray-200 break-all border border-gray-200 dark:border-gray-600">
                    {window.location.origin}/api/getips?token={apiToken || '请重新登录获取Token'}
                </div>
                <button
                    onClick={() => {
                        const url = `${window.location.origin}/api/getips?token=${apiToken}`;
                        navigator.clipboard.writeText(url).then(() => showToast('API地址已复制', 'success'));
                    }}
                    disabled={!apiToken}
                    className="flex items-center bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md text-sm transition-colors whitespace-nowrap disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    <Copy className="w-4 h-4 mr-2" />
                    复制
                </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-4 mb-2">
                接口支持以下筛选参数：
            </p>
            <ul className="text-sm text-gray-500 dark:text-gray-400 list-disc list-inside space-y-1 mb-4">
                <li><code>scene=场景名称</code>: 按场景名称筛选，例如 <code>scene=家庭电信</code></li>
                <li><code>latency=毫秒数</code>: 筛选延迟小于等于指定值的IP，例如 <code>latency=200</code></li>
                <li><code>region=地区代码</code>: 按Cloudflare地区代码筛选 (例如: LAX, SJC)，不区分大小写。例如 <code>region=SJC</code></li>
                <li><code>count=数量</code>: 返回指定数量的IP（按延迟排序），例如 <code>count=10</code></li>
            </ul>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                示例:
            </p>
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                    {`${window.location.origin}/api/getips?token=${apiToken || 'TOKEN'}&scene=家庭电信&latency=200&region=SJC&count=10`}
            </div>
        </div>
    );
}
