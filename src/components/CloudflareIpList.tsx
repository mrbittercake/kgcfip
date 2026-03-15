import { useState, useEffect } from 'react';
import { CloudflareIps, getCloudflareIps, syncCloudflareIps } from '../api';
import { Cloud, RotateCw } from 'lucide-react';
import { useToast } from './Toast';

interface CloudflareIpListProps {
    onDataLoaded: (data: CloudflareIps) => void;
}

export function CloudflareIpList({ onDataLoaded }: CloudflareIpListProps) {
    const [cfIps, setCfIps] = useState<CloudflareIps | null>(null);
    const [loading, setLoading] = useState(false);
    const { showToast } = useToast();

    const loadData = async () => {
        setLoading(true);
        try {
            const cfData = await getCloudflareIps();
            setCfIps(cfData);
            if (cfData) {
                onDataLoaded(cfData);
            }
        } catch (err) {
            console.error('Failed to fetch Cloudflare IPs', err);
            showToast('获取Cloudflare IP段失败', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSync = async () => {
        setLoading(true);
        try {
            const data = await syncCloudflareIps();
            setCfIps(data);
            onDataLoaded(data);
            showToast('同步成功', 'success');
        } catch (err) {
            showToast('同步Cloudflare IP失败', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    return (
        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 mb-8">
            <div className="flex items-center gap-4 mb-6">
                <Cloud className="w-7 h-7 text-blue-500" />
                <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-200">IP段</h2>
                <button 
                    onClick={handleSync}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-100 rounded-full hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:hover:bg-blue-800/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="从上游同步最新的IP段"
                >
                    <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span>{loading ? '同步中...' : '同步IP段'}</span>
                </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="font-bold text-gray-600 dark:text-gray-300">CF官方IP段</h3>
                    <span className="text-xs text-gray-400 dark:text-gray-500">cloudflare官方公布的ip段，覆盖最全</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {cfIps?.ipv4_cidrs && cfIps.ipv4_cidrs.length > 0 ? cfIps.ipv4_cidrs.map(cidr => (
                      <span key={cidr} className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-1 rounded text-xs font-mono">{cidr}</span>
                    )) : <p className="text-gray-400 text-xs italic">暂无数据</p>}
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="font-bold text-gray-600 dark:text-gray-300">CM整理IP段</h3>
                    <span className="text-xs text-gray-400 dark:text-gray-500">民间大佬维护IP段，测速成功率高</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {cfIps?.cm_cidrs && cfIps.cm_cidrs.length > 0 ? cfIps.cm_cidrs.map(cidr => (
                      <span key={cidr} className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-1 rounded text-xs font-mono">{cidr}</span>
                    )) : <p className="text-gray-400 text-xs italic">暂无数据</p>}
                  </div>
                </div>
            </div>
        </div>
    );
}