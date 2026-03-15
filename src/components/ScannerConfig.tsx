import { useState, useRef } from 'react';
import { CloudflareIps, getThirdPartyIps, ThirdPartyData } from '../api';
import {
    generateRandomIps,
    BatchScanner,
    ScanResult,
    CF_CIDR_LIST,
} from '../utils/scanner';
import { useToast } from './Toast';
import { Gauge, Play, StopCircle, Loader2 } from 'lucide-react';
import { useConfirm } from './ConfirmDialog';

interface IpScannerConfigAndControlProps {
    cfIps: CloudflareIps | null;
    onScanComplete: (results: ScanResult[]) => void;
}

const PORTS_TO_TEST = [80, 443, 8080, 8880, 2052, 2053, 2082, 2083, 2086, 2087, 2095, 2096, 8443];

function ScannerConfig({ cfIps, onScanComplete }: IpScannerConfigAndControlProps) {
    const [count, setCount] = useState(500);
    const [threads, setThreads] = useState(32);
    const [latencyLimit, setLatencyLimit] = useState(2000);
    const [selectedPort, setSelectedPort] = useState(443);
    const [ipSource, setIpSource] = useState<'cf' | 'cm' | 'third'>('cf');
    const [isScanning, setIsScanning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [total, setTotal] = useState(0);
    const [successCount, setSuccessCount] = useState(0);
    const [failCount, setFailCount] = useState(0);
    const [isStopping, setIsStopping] = useState(false);
    const [sourceStats, setSourceStats] = useState<ThirdPartyData['sources']>([]);
    const [uniqueIpCount, setUniqueIpCount] = useState(0);
    const [grossIpCount, setGrossIpCount] = useState(0);
    const [isPreparing, setIsPreparing] = useState(false);

    const scannerRef = useRef<BatchScanner | null>(null);
    const { showToast } = useToast();
    const { confirm } = useConfirm();

    const showLocationWarning = async () => {
        const result = await confirm('检测到您目前网络处于代理或VPN环境，请处于直连状态下再开始测试，否则结果没有意义！', {
            confirmText: '坚持测试',
            confirmButtonColor: 'bg-orange-500 hover:bg-orange-600 focus:ring-orange-500',
            cancelText: '取消测试',
            cancelButtonColor: 'bg-green-500 hover:bg-green-600 focus:ring-green-500',
        });
        return result;
    };




    const handleScan = async () => {
        setIsPreparing(true);
        try {
            // 每次点击测试时，先检测地理位置
            let isCN = true;
            try {
                const response = await fetch('https://api.ip.sb/geoip');
                const data = await response.json() as { country_code: string };
                isCN = data.country_code === 'CN';
            } catch (error) {
                console.error('Failed to determine location:', error);
                isCN = false; // 报错则默认提示警告
            }

            if (!isCN) {
                const continueScan = await showLocationWarning();
                if (!continueScan) {
                    setIsPreparing(false);
                    return;
                }
            }

            let targets: string[] = [];
            setSourceStats([]); // 重置统计
            setUniqueIpCount(0);
            setGrossIpCount(0);
            
            if (ipSource === 'third') {
                const data = await getThirdPartyIps();
                if (!data || !data.ips || data.ips.length === 0) {
                    setIsPreparing(false);
                    showToast('未能获取到第三方源IP，请检查配置或后台日志', 'warning');
                    return;
                }
                targets = data.ips;
                setSourceStats(data.sources);
                setUniqueIpCount(data.total);
                setGrossIpCount(data.sources.reduce((acc, s) => acc + s.count, 0));
            } else {
                let cidrsToUse: string[] = [];
                if (ipSource === 'cf')
                    cidrsToUse = (cfIps?.ipv4_cidrs && cfIps.ipv4_cidrs.length > 0) ? cfIps.ipv4_cidrs : (CF_CIDR_LIST || []);
                else
                    cidrsToUse = (cfIps?.cm_cidrs && cfIps.cm_cidrs.length > 0) ? cfIps.cm_cidrs : (CF_CIDR_LIST || []);

                if (!cidrsToUse || cidrsToUse.length === 0) {
                    showToast('未找到Cloudflare IP段数据，请先点击上方的“同步IP段”按钮进行同步。', 'error');
                    setIsPreparing(false);
                    return;
                }
                targets = generateRandomIps(cidrsToUse, count);
            }
            setProgress(0);
            setSuccessCount(0);
            setFailCount(0);
            await new Promise(resolve => setTimeout(resolve, 0));

            setTotal(targets.length);
            if (targets.length === 0) {
                setIsPreparing(false);
                showToast('未能生成测试IP，请检查设置', 'error');
                return;
            }
            
            const currentResults: ScanResult[] = [];
            const onProgress = (result: ScanResult) => {
                setProgress(p => p + 1);
                currentResults.push(result);
                if (result.isAvailable) {
                    setSuccessCount(s => s + 1);
                } else {
                    setFailCount(f => f + 1);
                }
            };

            const onComplete = (finalResults: ScanResult[]) => {
                setIsStopping(false);
                if (scannerRef.current) {
                    scannerRef.current.stop();
                }
                setIsScanning(false);
                onScanComplete(finalResults);
            };

            // 准备工作完成，开始扫描
            setIsPreparing(false);
            setIsScanning(true);
            const scanner = new BatchScanner(targets, ipSource === 'third' ? 0 : selectedPort, threads, latencyLimit, onProgress, onComplete);
            scannerRef.current = scanner;

            scanner.run();
        } catch (error) {
            console.error('Scan failed:', error);
            setIsScanning(false);
            setIsPreparing(false);
            showToast('启动测试失败，请检查控制台错误信息', 'error');
        }
    };

    const handleStopScan = () => {
        setIsStopping(true);
        if (scannerRef.current) {
            scannerRef.current.stop();
        }
    };

    return (
        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 mb-8">
            <div className="flex items-center gap-3 mb-4">
                <Gauge className="w-7 h-7 text-purple-500" />
                <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-200">IP优选测速</h2>
            </div>
            
            <div className="flex items-center mb-4">
                <label className="text-gray-700 dark:text-gray-300 font-semibold mr-3">IP来源:</label>
                <div className="relative flex w-fit items-center rounded-lg bg-gray-100 p-1 dark:bg-gray-700">
                    <button
                        onClick={() => setIpSource('cf')}
                        disabled={isScanning || isPreparing}
                        className={`relative z-10 rounded-md px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                            ipSource === 'cf'
                                ? 'bg-white text-gray-800 shadow-sm dark:bg-gray-900 dark:text-white'
                                : 'text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white'
                        }`}
                    >
                        CF官方IP
                    </button >
                    <button
                        onClick={() => setIpSource('cm')}
                        disabled={isScanning || isPreparing}
                        className={`relative z-10 rounded-md px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                            ipSource === 'cm'
                                ? 'bg-white text-gray-800 shadow-sm dark:bg-gray-900 dark:text-white'
                                : 'text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white'
                        }`}
                    >
                        CM整理IP
                    </button>
                    <button
                        onClick={() => setIpSource('third')}
                        disabled={isScanning || isPreparing}
                        className={`relative z-10 rounded-md px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                            ipSource === 'third'
                                ? 'bg-white text-gray-800 shadow-sm dark:bg-gray-900 dark:text-white'
                                : 'text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white'
                        }`}
                    >
                        第三方IP源
                    </button>
                </div>
            </div >

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div>
                    <label htmlFor="ip-count" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-1">随机IP数量:</label>
                    <input id="ip-count" type="number" value={count} onChange={(e) => setCount(parseInt(e.target.value, 10) || 0)} className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-white dark:bg-gray-700 dark:border-gray-600 leading-tight focus:outline-none focus:shadow-outline disabled:opacity-50" disabled={isScanning || isPreparing || ipSource === 'third'} />
                </div>
                <div>
                    <label htmlFor="port-select" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-1">端口:</label>
                    <select id="port-select" value={selectedPort} onChange={(e) => setSelectedPort(Number(e.target.value))} className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-white dark:bg-gray-700 dark:border-gray-600 leading-tight focus:outline-none focus:shadow-outline disabled:opacity-50" disabled={isScanning || isPreparing || ipSource === 'third'}>
                        {PORTS_TO_TEST.map(port => (
                            <option key={port} value={port}>{port}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label htmlFor="threads-count" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-1">线程数:</label>
                    <input id="threads-count" type="number" value={threads} onChange={(e) => setThreads(parseInt(e.target.value, 10) || 1)} className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-white dark:bg-gray-700 dark:border-gray-600 leading-tight focus:outline-none focus:shadow-outline disabled:opacity-50" disabled={isScanning || isPreparing} />
                </div>
                <div>
                    <label htmlFor="latency-limit" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-1">延迟限制(ms):</label>
                    <input id="latency-limit" type="number" value={latencyLimit} onChange={(e) => setLatencyLimit(parseInt(e.target.value, 10) || 2000)} className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-white dark:bg-gray-700 dark:border-gray-600 leading-tight focus:outline-none focus:shadow-outline disabled:opacity-50" disabled={isScanning || isPreparing} />
                </div>

            </div>
            <div className="mb-4 flex justify-center" >
                <button onClick={handleScan} disabled={isScanning || isPreparing} className="flex items-center bg-purple-600 text-white font-bold py-2 px-4 rounded-md hover:bg-purple-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed">
                    {isPreparing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                    {isPreparing ? '准备中...' : isScanning ? `测试中... (${progress}/${total})` : '开始测试'}
                </button>
                {isScanning && (
                    <button onClick={handleStopScan} style={{ marginLeft: "8px" }} disabled={isStopping}
                            className="flex items-center bg-red-600 text-white font-bold py-2 px-4 rounded-md hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed">
                        <StopCircle className="w-4 h-4 mr-2" />
                        {isStopping ? '停止中...' : '停止测试'}
                    </button>
                )}
            </div >

            {/* 准备中动画 */}
            {isPreparing && (
                <div className="mb-4 flex flex-col items-center justify-center p-6 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-dashed border-gray-300 dark:border-gray-600">
                    <Loader2 className="w-8 h-8 text-purple-500 animate-spin mb-2" />
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">正在获取 IP 资源，请稍候...</span>
                </div>
            )}

            {/* 第三方源统计展示区 */}
            {ipSource === 'third' && sourceStats.length > 0 && (
                <div className="mb-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 border border-gray-100 dark:border-gray-700">
                    <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">第三方IP获取详情</h3>
                    
                    {/* 新增的总览信息 */}
                    <div className="mb-3 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800/50 p-2 rounded-md text-center">
                        共发现 <strong className="text-blue-500 font-semibold">{grossIpCount}</strong> 个 IP，
                        去重后剩余 <strong className="text-purple-500 font-semibold">{uniqueIpCount}</strong> 个有效 IP 用于测试。
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {sourceStats.map((stat, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-white dark:bg-gray-800 p-2 rounded border border-gray-100 dark:border-gray-600 shadow-sm text-xs transition-colors hover:border-purple-200 dark:hover:border-purple-800">
                                <div className="truncate flex-1 mr-2 text-gray-600 dark:text-gray-300 font-mono" title={stat.url}>
                                    {stat.url.replace(/^https?:\/\//, '')}
                                </div>
                                <span className={`px-2 py-0.5 rounded-full font-bold shadow-sm ${stat.count > 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                    {stat.count}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {isScanning && (
                <div className="mb-4">
                    <div className="flex justify-between mb-1">
                        <span className="text-base font-medium text-purple-700 dark:text-white">进度</span>
                        <span className="text-sm font-medium text-purple-700 dark:text-white">任务: {progress} / {total}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                        <div className="bg-purple-600 h-2.5 rounded-full" style={{ width: `${total > 0 ? (progress / total) * 100 : 0}%` }}></div>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                        <span className="text-green-600">成功: {successCount}</span>
                        <span className="text-red-600">失败: {failCount}</span>
                    </div>
                </div>
            )}
        </div >
    );
}
export { ScannerConfig };
