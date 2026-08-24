import { useState, useRef, useEffect } from 'react';
import { CloudflareIps, getThirdPartySourceList, getThirdPartySourceIps } from '../api';

type SourceRowStatus = 'pending' | 'loading' | 'done' | 'error';
interface SourceRow {
    url: string;
    status: SourceRowStatus;
    ipCount?: number;
    domainCount?: number;
    error?: string;
    ips?: { ip: string; port: number }[];
}
import {
    generateRandomIps,
    BatchScanner,
    ScanResult,
    CF_CIDR_LIST,
    isDomainName,
    resolveDomainToIp,
} from '../utils/scanner';
import { useToast } from './Toast';
import { Gauge, Play, StopCircle, Loader2, Pause, Square } from 'lucide-react';
import { useConfirm } from './ConfirmDialog';

interface IpScannerConfigAndControlProps {
    cfIps: CloudflareIps | null;
    onScanComplete: (results: ScanResult[]) => void;
}

const PORTS_TO_TEST = [80, 443, 8080, 8880, 2052, 2053, 2082, 2083, 2086, 2087, 2095, 2096, 8443];

export function ScannerConfig({ cfIps, onScanComplete }: IpScannerConfigAndControlProps) {
    const [count, setCount] = useState<string>('500');
    const [threads, setThreads] = useState<string>('8');
    const [latencyLimit, setLatencyLimit] = useState<string>('1000');
/*  */    const [countError, setCountError] = useState<string>('');
    const [threadsError, setThreadsError] = useState<string>('');
    const [latencyLimitError, setLatencyLimitError] = useState<string>('');
    const [selectedPort, setSelectedPort] = useState(443);
    const [ipSource, setIpSource] = useState<'cf' | 'cm' | 'third'>('cf');
    const [isScanning, setIsScanning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [total, setTotal] = useState(0);
    const [successCount, setSuccessCount] = useState(0);
    const [failCount, setFailCount] = useState(0);
    const [isStopping, setIsStopping] = useState(false);
    const [uniqueIpCount, setUniqueIpCount] = useState(0);
    const [grossIpCount, setGrossIpCount] = useState(0);
    const [ipCount, setIpCount] = useState(0);
    const [domainCount, setDomainCount] = useState(0);
    const [isPreparing, setIsPreparing] = useState(false);
    const [prepareDone, setPrepareDone] = useState(0);
    const [prepareTotal, setPrepareTotal] = useState(0);
    const [sourceRows, setSourceRows] = useState<SourceRow[]>([]);
    const [startTime, setStartTime] = useState<number | null>(null);
    const [now, setNow] = useState(Date.now());
    const [isPaused, setIsPaused] = useState(false);
    const [pausedAt, setPausedAt] = useState<number | null>(null);

    const scannerRef = useRef<BatchScanner | null>(null);
    const cancelPreparingRef = useRef(false);
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

    const validateInputs = (): { countNum: number; threadsNum: number; latencyLimitNum: number } | null => {
        const countTrim = count.trim();
        const threadsTrim = threads.trim();
        const latencyLimitTrim = latencyLimit.trim();
        let hasError = false;
        if (ipSource !== 'third' && !/^\d+$/.test(countTrim)) {
            setCountError('请输入有效的正整数');
            hasError = true;
        } else {
            setCountError('');
        }
        if (!/^\d+$/.test(threadsTrim) || parseInt(threadsTrim, 10) < 1) {
            setThreadsError('请输入大于等于1的整数');
            hasError = true;
        } else {
            setThreadsError('');
        }
        if (!/^\d+$/.test(latencyLimitTrim)) {
            setLatencyLimitError('请输入有效的正整数');
            hasError = true;
        } else {
            setLatencyLimitError('');
        }
        if (hasError) return null;

        return {
            countNum: parseInt(countTrim, 10),
            threadsNum: parseInt(threadsTrim, 10),
            latencyLimitNum: parseInt(latencyLimitTrim, 10),
        };
    };

    const checkGeoLocation = async (): Promise<boolean> => {
        let isCN = true;
        try {
            const response = await fetch('https://api.ip.sb/geoip');
            const data = await response.json() as { country_code: string };
            isCN = data.country_code === 'CN';
        } catch (error) {
            console.error('Failed to determine location:', error);
            isCN = false;
        }
        if (!isCN) {
            return showLocationWarning();
        }
        return true;
    };

    const prepareTargets = async (countNum: number): Promise<{ targets: string[]; resolvedMap?: Record<string, string | null> } | null> => {
        setSourceRows([]);
        setUniqueIpCount(0);
        setGrossIpCount(0);
        setIpCount(0);
        setDomainCount(0);

        if (cancelPreparingRef.current) return null;

        if (ipSource === 'third') {
            setPrepareDone(0);
            setPrepareTotal(0);

            // 先取出完整源列表，立即以"等待中"渲染全部条目
            const sources = await getThirdPartySourceList();
            if (cancelPreparingRef.current) return null;
            if (!Array.isArray(sources) || sources.length === 0) {
                showToast('未配置第三方源，请先到"第三方IP/域名源"中添加', 'warning');
                return null;
            }

            const rows: SourceRow[] = sources.map((url) => ({ url, status: 'pending' }));
            setSourceRows(rows);
            setPrepareTotal(sources.length);

            // 逐源解析，实时更新对应条目的状态与结果
            const allIps = new Map<string, { ip: string; port: number }>();
            let grossCount = 0;
            let doneCount = 0;

            for (let i = 0; i < sources.length; i++) {
                if (cancelPreparingRef.current) return null;
                // 标记当前行为"解析中"
                setSourceRows((prev) => prev.map((r, idx) => idx === i ? { ...r, status: 'loading' } : r));
                setPrepareDone(i);

                let stat;
                try {
                    stat = await getThirdPartySourceIps(sources[i]);
                } catch (e) {
                    stat = { url: sources[i], status: 'error', count: 0, ipCount: 0, domainCount: 0, ips: [], error: (e as Error).message };
                }

                // 更新当前行结果
                setSourceRows((prev) => prev.map((r, idx) => idx === i ? {
                    url: stat.url,
                    status: stat.status === 'error' ? 'error' : 'done',
                    ipCount: stat.ipCount,
                    domainCount: stat.domainCount,
                    error: stat.error,
                    ips: stat.ips
                } : r));
                doneCount++;
                setPrepareDone(doneCount);

                if (stat.status !== 'error') {
                    for (const item of stat.ips) {
                        allIps.set(`${item.ip}:${item.port}`, item);
                    }
                }
                grossCount += stat.count;
            }

            if (cancelPreparingRef.current) return null;

            const finalIps = Array.from(allIps.values());
            let dedupIp = 0;
            let dedupDomain = 0;
            for (const item of finalIps) {
                if (isDomainName(item.ip)) dedupDomain++;
                else dedupIp++;
            }

            setUniqueIpCount(finalIps.length);
            setGrossIpCount(grossCount);
            setIpCount(dedupIp);
            setDomainCount(dedupDomain);

            if (finalIps.length === 0) {
                showToast('未能获取到第三方源IP，请检查配置或后台日志', 'warning');
                return null;
            }

            const targets: string[] = [];
            const domainItems: { key: string; host: string }[] = [];
            for (const item of finalIps) {
                const key = `${item.ip}:${item.port}`;
                targets.push(key);
                // 收集域名源，前端用阿里云 DoH 解析出测速 IP
                if (isDomainName(item.ip)) domainItems.push({ key, host: item.ip });
            }

            const resolvedMap: Record<string, string | null> = {};
            if (domainItems.length > 0) {
                const entries = await Promise.all(
                    domainItems.map(async ({ key, host }) => [key, await resolveDomainToIp(host)] as const)
                );
                for (const [key, ip] of entries) resolvedMap[key] = ip;
            }

            return { targets, resolvedMap };
        }

        const cidrsToUse = ipSource === 'cf'
            ? (cfIps?.ipv4_cidrs?.length ? cfIps.ipv4_cidrs : (CF_CIDR_LIST || []))
            : (cfIps?.cm_cidrs?.length ? cfIps.cm_cidrs : (CF_CIDR_LIST || []));

        if (!cidrsToUse || cidrsToUse.length === 0) {
            showToast('未找到Cloudflare IP段数据，请先点击上方的"同步IP段"按钮进行同步。', 'error');
            return null;
        }
        return { targets: generateRandomIps(cidrsToUse, countNum) };
    };

    const handleScan = async () => {
        cancelPreparingRef.current = false;

        const val = validateInputs();
        if (!val) return;

        setIsPreparing(true);
        try {
            // Step 1: 地理定位检测
            const shouldContinue = await checkGeoLocation();
            if (!shouldContinue || cancelPreparingRef.current) {
                setIsPreparing(false);
                return;
            }

            // Step 2: 准备靶标 IP
            const prepared = await prepareTargets(val.countNum);
            if (!prepared || prepared.targets.length === 0 || cancelPreparingRef.current) {
                setIsPreparing(false);
                return;
            }
            const targets = prepared.targets;

            // Step 3: 初始化扫描状态
            setProgress(0);
            setSuccessCount(0);
            setFailCount(0);
            setTotal(targets.length);
            await new Promise(resolve => setTimeout(resolve, 0));

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
                setIsPaused(false);
                if (scannerRef.current) {
                    scannerRef.current.stop();
                }
                setIsScanning(false);
                setStartTime(null);
                onScanComplete(finalResults);
            };

            // Step 4: 启动扫描
            setIsPreparing(false);
            setIsScanning(true);
            setStartTime(Date.now());
            setNow(Date.now());
            const scanner = new BatchScanner(
                targets,
                ipSource === 'third' ? 0 : selectedPort,
                val.threadsNum,
                val.latencyLimitNum,
                onProgress,
                onComplete,
                prepared.resolvedMap,
            );
            scannerRef.current = scanner;

            await scanner.run();
        } catch (error) {
            console.error('Scan failed:', error);
            setIsScanning(false);
            setIsPreparing(false);
            setIsPaused(false);
            setStartTime(null);
            showToast('启动测试失败，请检查控制台错误信息', 'error');
        }
    };

    const handleStopScan = () => {
        setIsStopping(true);
        setIsPaused(false);
        setStartTime(null);
        if (scannerRef.current) {
            scannerRef.current.stop();
        }
    };

    const handlePause = () => {
        if (scannerRef.current) {
            scannerRef.current.pause();
        }
        setPausedAt(Date.now());
        setIsPaused(true);
    };

    const handleResume = () => {
        if (scannerRef.current && pausedAt !== null) {
            // 将暂停时长补偿到 startTime，使已用时连续、预计剩余准确
            setStartTime((prev) => (prev !== null ? prev + (Date.now() - pausedAt) : prev));
        }
        setPausedAt(null);
        if (scannerRef.current) {
            scannerRef.current.resume();
        }
        setIsPaused(false);
    };

    // 扫描进行中且未暂停时，每 1 秒刷新 now 以更新已用时间
    useEffect(() => {
        if (!isScanning || isPaused) return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [isScanning, isPaused]);

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
                        第三方IP/域名源
                    </button>
                </div>
            </div >

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div>
                    <label htmlFor="ip-count" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-1">随机IP数量:</label>
                    <input
                        id="ip-count"
                        type="text"
                        value={count}
                        onChange={(e) => { setCount(e.target.value); if (countError) setCountError(''); }}
                        className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-white dark:bg-gray-700 dark:border-gray-600 leading-tight focus:outline-none focus:shadow-outline disabled:opacity-50"
                        disabled={isScanning || isPreparing || ipSource === 'third'}
                    />
                    {countError && <p className="text-red-500 text-xs mt-1">{countError}</p>}
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
                    <input
                        id="threads-count"
                        type="text"
                        value={threads}
                        onChange={(e) => { setThreads(e.target.value); if (threadsError) setThreadsError(''); }}
                        className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-white dark:bg-gray-700 dark:border-gray-600 leading-tight focus:outline-none focus:shadow-outline disabled:opacity-50"
                        disabled={isScanning || isPreparing}
                    />
                    {threadsError && <p className="text-red-500 text-xs mt-1">{threadsError}</p>}
                </div>
                <div>
                    <label htmlFor="latency-limit" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-1">延迟限制(ms):</label>
                    <input
                        id="latency-limit"
                        type="text"
                        value={latencyLimit}
                        onChange={(e) => { setLatencyLimit(e.target.value); if (latencyLimitError) setLatencyLimitError(''); }}
                        className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-white dark:bg-gray-700 dark:border-gray-600 leading-tight focus:outline-none focus:shadow-outline disabled:opacity-50"
                        disabled={isScanning || isPreparing}
                    />
                    {latencyLimitError && <p className="text-red-500 text-xs mt-1">{latencyLimitError}</p>}
                </div>

            </div>
            <div className="mb-4 flex justify-center" >
                <button onClick={handleScan} disabled={isScanning || isPreparing} className="flex items-center bg-purple-600 text-white font-bold py-2 px-4 rounded-md hover:bg-purple-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed">
                    {isPreparing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                    {isPreparing
                        ? (ipSource === 'third' && prepareTotal > 0
                            ? `解析源 ${prepareDone}/${prepareTotal}`
                            : '准备中...')
                        : isScanning
                            ? `测试中... (${progress}/${total})`
                            : '开始测试'}
                </button>
                {isPreparing && (
                    <button onClick={() => { cancelPreparingRef.current = true; setIsPreparing(false); }} style={{ marginLeft: "8px" }}
                            className="flex items-center bg-red-600 text-white font-bold py-2 px-4 rounded-md hover:bg-red-700 transition-colors">
                        <StopCircle className="w-4 h-4 mr-2" />
                        取消准备
                    </button>
                )}
                {isScanning && (
                    <button onClick={handleStopScan} style={{ marginLeft: "8px" }} disabled={isStopping}
                            className="flex items-center bg-red-600 text-white font-bold py-2 px-4 rounded-md hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed">
                        <StopCircle className="w-4 h-4 mr-2" />
                        {isStopping ? '停止中...' : '停止测试'}
                    </button>
                )}
            </div >

            {/* 第三方源逐条解析展示区 */}
            {ipSource === 'third' && sourceRows.length > 0 && (
                <div className="mb-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 border border-gray-100 dark:border-gray-700">
                    <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                        第三方IP/域名获取详情 {isPreparing && `(${prepareDone}/${prepareTotal})`}
                    </h3>

                    {/* 解析完成后的总览信息 */}
                    {!isPreparing && (
                        <div className="mb-3 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800/50 p-2 rounded-md text-center">
                            共发现 <strong className="text-blue-500 font-semibold">{grossIpCount}</strong> 个记录，
                            去重后剩余 <strong className="text-purple-500 font-semibold">{uniqueIpCount}</strong> 个，
                            其中 IP <strong className="text-green-500 font-semibold">{ipCount}</strong> 个、
                            域名 <strong className="text-orange-500 font-semibold">{domainCount}</strong> 个。
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {sourceRows.map((row, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-white dark:bg-gray-800 p-2 rounded border border-gray-100 dark:border-gray-600 shadow-sm text-xs transition-colors hover:border-purple-200 dark:hover:border-purple-800">
                                <div className="truncate flex-1 mr-2 text-gray-600 dark:text-gray-300 font-mono" title={row.url}>
                                    {row.url.replace(/^https?:\/\//, '')}
                                </div>
                                <span className="flex items-center gap-1 shrink-0">
                                    {row.status === 'pending' && (
                                        <span className="px-2 py-0.5 rounded-full font-bold shadow-sm bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                                            等待中
                                        </span>
                                    )}
                                    {row.status === 'loading' && (
                                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full font-bold shadow-sm bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            解析中
                                        </span>
                                    )}
                                    {row.status === 'done' && (
                                        <>
                                            {row.ipCount! > 0 && (
                                                <span className="px-2 py-0.5 rounded-full font-bold shadow-sm bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" title="IP 个数">
                                                    IP {row.ipCount}
                                                </span>
                                            )}
                                            {row.domainCount! > 0 && (
                                                <span className="px-2 py-0.5 rounded-full font-bold shadow-sm bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" title="域名个数">
                                                    域名 {row.domainCount}
                                                </span>
                                            )}
                                            {row.ipCount === 0 && row.domainCount === 0 && (
                                                <span className="px-2 py-0.5 rounded-full font-bold shadow-sm bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" title="该源未返回有效条目">
                                                    未解析出
                                                </span>
                                            )}
                                        </>
                                    )}
                                    {row.status === 'error' && (
                                        <span className="px-2 py-0.5 rounded-full font-bold shadow-sm bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" title={row.error || '请求失败'}>
                                            失败
                                        </span>
                                    )}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {isScanning && (() => {
                const endRef = isPaused && pausedAt !== null ? pausedAt : now;
                const elapsedSec = startTime ? Math.floor((endRef - startTime) / 1000) : 0;
                const percent = total > 0 ? Math.round((progress / total) * 100) : 0;
                const fmt = (s: number) => {
                    const m = Math.floor(s / 60);
                    const sec = s % 60;
                    return `${m}:${sec.toString().padStart(2, '0')}`;
                };
                return (
                    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-2rem)] max-w-xl px-5 py-3 rounded-xl bg-white/95 dark:bg-gray-800/95 backdrop-blur border border-gray-200 dark:border-gray-700 shadow-[0_-4px_16px_rgba(0,0,0,0.12)]">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-base font-medium text-purple-700 dark:text-white">
                                进度 {percent}%
                            </span>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-purple-700 dark:text-white mr-1">
                                    任务: {progress} / {total}
                                </span>
                                {isPaused ? (
                                    <button
                                        type="button"
                                        onClick={handleResume}
                                        aria-label="继续测试"
                                        title="继续测试"
                                        className="p-1.5 rounded-full text-green-600 bg-green-100 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-300 dark:hover:bg-green-800/50 transition-colors"
                                    >
                                        <Play className="w-4 h-4" />
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handlePause}
                                        aria-label="暂停测试"
                                        title="暂停测试"
                                        className="p-1.5 rounded-full text-yellow-600 bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-900/50 dark:text-yellow-300 dark:hover:bg-yellow-800/50 transition-colors"
                                    >
                                        <Pause className="w-4 h-4" />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={handleStopScan}
                                    disabled={isStopping}
                                    aria-label="停止测试"
                                    title="停止测试"
                                    className="p-1.5 rounded-full text-red-600 bg-red-100 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-800/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Square className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                        <div className="w-full flex h-2.5 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                            <div className="bg-green-500 h-2.5 transition-all duration-300" style={{ width: `${total > 0 ? (successCount / total) * 100 : 0}%` }}></div>
                            <div className="bg-red-500 h-2.5 transition-all duration-300" style={{ width: `${total > 0 ? (failCount / total) * 100 : 0}%` }}></div>
                        </div>
                        <div className="flex justify-between text-sm mt-1">
                            <span className="text-green-600">成功: {successCount}</span>
                            <span className="text-gray-500 dark:text-gray-400">已用: {fmt(elapsedSec)}</span>
                            <span className="text-red-600">失败: {failCount}</span>
                        </div>
                    </div>
                );
            })()}
        </div >
    );
}