import { useState, useRef, useEffect, useCallback } from 'react';
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
    probeBrowserAvailable,
} from '../utils/scanner';
import {
    probeLocalAgent, startAgentScan, fetchAgentProgress, stopAgentScan,
    DEFAULT_AGENT_PORT,
    type AgentResult, type AgentProbeResult,
} from '../utils/localAgent';
import { useToast } from './Toast';
import { Gauge, Play, StopCircle, Loader2, Pause, Square, Cpu, RefreshCw, AlertTriangle } from 'lucide-react';
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

    // ---------- 测速方式切换 ----------
    const [activeTab, setActiveTab] = useState<'browser' | 'local'>('browser');

    // ---------- 本地 Agent ----------
    const [agentProbe, setAgentProbe] = useState<AgentProbeResult | null>(null);
    const [agentChecking, setAgentChecking] = useState(false);
    // 本地服务端口：保存在浏览器本地，下次自动带出
    const [agentPort, setAgentPort] = useState<string>(
        () => localStorage.getItem('LOCAL_AGENT_PORT') || String(DEFAULT_AGENT_PORT)
    );
    const agentStopRef = useRef(false);
    const agentModeRef = useRef(false);
    // 当前这一轮是否走本地 Agent（需要触发重渲染以隐藏不支持的暂停按钮）
    const [agentActive, setAgentActive] = useState(false);

    /** 探测本机 127.0.0.1 上的 Agent 服务 */
    const checkAgent = useCallback(async (port: number, silent = false) => {
        setAgentChecking(true);
        try {
            const r = await probeLocalAgent(port);
            setAgentProbe(r);
            if (r.online && !silent) showToast('已连接到本地 Agent 服务', 'success');
        } catch {
            setAgentProbe({ online: false, reason: 'offline' });
        } finally {
            setAgentChecking(false);
        }
    }, [showToast]);

    // 启动 & 端口变更：探测本地服务
    useEffect(() => {
        void checkAgent(Number(agentPort) || DEFAULT_AGENT_PORT, true);
    }, [checkAgent, agentPort]);

    // ---------- 浏览器端测速可用性自检 ----------
    // 浏览器无法为任意 IP 设置 TLS SNI，只能依赖会失效的第三方泛解析域名；
    // 此处用一次真实浏览器测速来验证当前环境是否可用，失败则提示切换到本地测速。
    const [browserHealthy, setBrowserHealthy] = useState<boolean | null>(null);
    const [browserChecking, setBrowserChecking] = useState(false);

    const checkBrowser = useCallback(async () => {
        setBrowserChecking(true);
        setBrowserHealthy(null);
        try {
            const ok = await probeBrowserAvailable();
            setBrowserHealthy(ok);
        } catch {
            setBrowserHealthy(false);
        } finally {
            setBrowserChecking(false);
        }
    }, []);

    // 进入「浏览器测速」Tab 时做一次自检
    useEffect(() => {
        if (activeTab === 'browser') void checkBrowser();
    }, [activeTab, checkBrowser]);

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

    // ---------- 本地 Agent 测速 ----------

    /** Agent 结果 -> 页面统一的 ScanResult，从而复用原有的结果列表与保存逻辑 */
    const toScanResult = (r: AgentResult): ScanResult => ({
        ip: r.host,
        port: r.port,
        isAvailable: r.ok,
        latency: r.ok ? r.latency : -1,
        colo: r.colo || undefined,
        domain: isDomainName(r.host) || undefined,
        tcpMs: r.tcpMs >= 0 ? r.tcpMs : undefined,
        tlsMs: r.tlsMs >= 0 ? r.tlsMs : undefined,
        error: r.error || undefined,
    });

    /**
     * 把页面已有的靶标字符串解析成 Agent 需要的 {host, ip, port}。
     * 域名源用 DoH 已解析出的 IP 去连接，但 host 保留域名，与浏览器端行为一致。
     */
    const buildAgentTargets = (
        rawTargets: string[],
        resolvedMap?: Record<string, string | null>,
        defaultPort = 443
    ) => rawTargets.map((raw) => {
        let host = raw;
        let port = defaultPort;
        const lastColon = raw.lastIndexOf(':');
        const closeBracket = raw.lastIndexOf(']');
        if (lastColon > -1 && lastColon > closeBracket) {
            const p = parseInt(raw.substring(lastColon + 1), 10);
            if (!isNaN(p)) {
                port = p;
                host = raw.substring(0, lastColon);
                if (host.startsWith('[') && host.endsWith(']')) host = host.substring(1, host.length - 1);
            }
        }
        if (port === 0) port = 443;
        const ip = (resolvedMap && resolvedMap[raw]) || host;
        return { host, ip, port };
    });

    /** 通过本地 Agent 执行测速：下发参数 -> 轮询进度 -> 汇总回传 */
    const runAgentScan = async (
        targets: { host: string; ip: string; port: number }[],
        threadsNum: number,
        latencyLimitNum: number,
        onProgress: (r: ScanResult) => void,
        onComplete: (rs: ScanResult[]) => void,
    ) => {
        if (!agentProbe?.online) throw new Error('本地 Agent 未连接');
        const base = agentProbe.baseUrl;

        await startAgentScan(base, {
            targets,
            threads: threadsNum,
            timeoutMs: 2500,
            latencyLimit: latencyLimitNum,
            source: ipSource,
        });

        let since = 0;
        let lastDone = -1;
        let stallTicks = 0;
        const acc: ScanResult[] = [];

        while (!agentStopRef.current) {
            const p = await fetchAgentProgress(base, since);
            since += p.count;
            for (const r of p.results) {
                const sr = toScanResult(r);
                acc.push(sr);
                onProgress(sr);
            }

            if (!p.running) break;

            // 卡死保护：连续 60 秒没有任何进展则放弃
            if (p.done === lastDone) {
                if (++stallTicks > 150) throw new Error('本地 Agent 长时间无进展，已放弃等待');
            } else {
                lastDone = p.done;
                stallTicks = 0;
            }
            await new Promise((r) => setTimeout(r, 400));
        }

        onComplete(acc.filter((r) => r.isAvailable).sort((a, b) => a.latency - b.latency));
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
                setAgentActive(false);
                agentModeRef.current = false;
                if (scannerRef.current) {
                    scannerRef.current.stop();
                }
                setIsScanning(false);
                setStartTime(null);
                onScanComplete(finalResults);
            };

            // Step 4: 启动扫描（按当前 Tab 决定走本地 Agent 还是浏览器端）
            setIsPreparing(false);
            setIsScanning(true);
            setStartTime(Date.now());
            setNow(Date.now());

            const agentReady = activeTab === 'local' && agentProbe?.online === true;
            agentModeRef.current = agentReady;
            agentStopRef.current = false;
            setAgentActive(agentReady);

            if (agentReady) {
                const agentTargets = buildAgentTargets(
                    targets,
                    prepared.resolvedMap,
                    ipSource === 'third' ? 0 : selectedPort,
                );
                await runAgentScan(agentTargets, val.threadsNum, val.latencyLimitNum, onProgress, onComplete);
            } else {
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
            }
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
        if (agentModeRef.current && agentProbe?.online) {
            // 轮询循环会自行退出并触发 onComplete 收尾
            agentStopRef.current = true;
            void stopAgentScan(agentProbe.baseUrl);
        }
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

            {/* ============ 测速方式：浏览器测速 / 本地测速 ============ */}
            <div className="mb-4">
                <div className="flex w-fit items-center rounded-lg bg-gray-100 p-1 dark:bg-gray-700 mb-3">
                    <button
                        onClick={() => setActiveTab('browser')}
                        disabled={isScanning || isPreparing}
                        className={`relative z-10 rounded-md px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                            activeTab === 'browser'
                                ? 'bg-white text-gray-800 shadow-sm dark:bg-gray-900 dark:text-white'
                                : 'text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white'
                        }`}
                    >
                        浏览器测速
                    </button>
                    <button
                        onClick={() => setActiveTab('local')}
                        disabled={isScanning || isPreparing}
                        className={`relative z-10 rounded-md px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                            activeTab === 'local'
                                ? 'bg-white text-gray-800 shadow-sm dark:bg-gray-900 dark:text-white'
                                : 'text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white'
                        }`}
                    >
                        本地测速
                    </button>
                </div>

                {activeTab === 'browser' ? (
                    /* ---------- 浏览器测速面板 ---------- */
                    <div className="space-y-3">
                        {browserChecking && (
                            <p className="text-sm text-gray-500 dark:text-gray-400">正在检测浏览器测速是否可用…</p>
                        )}
                        {!browserChecking && browserHealthy === true && (
                            <p className="text-sm text-green-600 dark:text-green-400">
                                浏览器测速可用，可直接点击「开始测试（浏览器）」。
                            </p>
                        )}
                        {!browserChecking && browserHealthy === false && (
                            <div className="flex items-start gap-2.5 rounded-lg border border-orange-200 dark:border-orange-700/50 bg-orange-50 dark:bg-orange-900/20 px-4 py-3">
                                <AlertTriangle className="w-4 h-4 text-orange-500 flex-none mt-0.5" />
                                <div className="text-sm text-orange-800 dark:text-orange-300">
                                    <p>当前环境的浏览器测速不可用（测速地址无法解析或连接失败）。</p>
                                    <p className="mt-1">
                                        建议使用「本地测速」：在本机运行 Agent 后，页面参数会原样下发到本机执行，结果更稳定。
                                        <button
                                            onClick={() => setActiveTab('local')}
                                            className="ml-1 inline-flex items-center gap-1 text-orange-700 dark:text-orange-200 font-medium underline underline-offset-2 hover:opacity-80"
                                        >
                                            切换到本地测速 →
                                        </button>
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    /* ---------- 本地 Agent 测速面板 ---------- */
                    <div className={'rounded-lg border overflow-hidden ' + (agentProbe?.online ? 'border-green-500 dark:border-green-500' : 'border-red-500 dark:border-red-500')}>
                        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-900/40">
                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                <Cpu className="w-5 h-5 text-teal-500 flex-none" />
                                <span className="font-medium text-gray-700 dark:text-gray-200">本地 Agent 测速</span>
                                {agentProbe === null && (
                                    <span className="px-2 py-0.5 text-xs rounded-full bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">未检测</span>
                                )}
                                {agentProbe && !agentProbe.online && agentProbe.reason === 'offline' && (
                                    <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">未启动</span>
                                )}
                                {agentProbe?.online && (
                                    <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                                        已连接 {agentProbe.baseUrl}
                                        {agentProbe.status.running && agentProbe.status.task
                                            ? ` · 忙（${agentProbe.status.task.done}/${agentProbe.status.task.total}）`
                                            : ''}
                                    </span>
                                )}
                            </div>

                            <button
                                onClick={() => void checkAgent(Number(agentPort) || DEFAULT_AGENT_PORT)}
                                disabled={agentChecking || isScanning}
                                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-teal-600 text-white hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-none"
                            >
                                <RefreshCw className={`w-3 h-3 ${agentChecking ? 'animate-spin' : ''}`} />
                                {agentChecking ? '检测中' : '检测服务'}
                            </button>
                        </div>

                        <div className="px-4 py-3">
                            {/* 本地服务端口设置（保存在浏览器本地） */}
                            <div className="flex items-center gap-2 mb-3">
                                <label htmlFor="agent-port" className="text-xs text-gray-600 dark:text-gray-400 flex-none">本地服务端口</label>
                                <input
                                    id="agent-port"
                                    type="text"
                                    inputMode="numeric"
                                    value={agentPort}
                                    onChange={(e) => {
                                        const v = e.target.value.replace(/[^\d]/g, '').slice(0, 5);
                                        setAgentPort(v);
                                        localStorage.setItem('LOCAL_AGENT_PORT', v);
                                    }}
                                    placeholder={String(DEFAULT_AGENT_PORT)}
                                    className="w-24 px-2.5 py-1.5 text-xs font-mono rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none disabled:opacity-50"
                                    disabled={isScanning || agentChecking}
                                />
                                <span className="text-xs text-gray-400 dark:text-gray-500">默认 {DEFAULT_AGENT_PORT}</span>
                            </div>

                            {!agentProbe?.online && (
                                <>
                                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                                        本机 Agent 未运行，请按以下步骤启动：
                                    </p>
                                    <ol className="list-decimal list-inside space-y-1.5 text-sm text-gray-600 dark:text-gray-400 mb-3">
                                        <li>
                                            下载并解压 <a href="/local-agent.zip" download className="text-teal-600 dark:text-teal-400 hover:underline font-medium">local-agent.zip</a>（需先安装
                                            <a href="https://nodejs.org/" target="_blank" rel="noreferrer" className="text-teal-600 dark:text-teal-400 hover:underline"> Node.js</a>，16 及以上版本）
                                        </li>
                                        <li>
                                            进入解压后的文件夹，执行 <code className="px-1 rounded bg-gray-100 dark:bg-gray-700 text-xs">node agent.js</code>
                                            （Windows 双击 <code className="px-1 rounded bg-gray-100 dark:bg-gray-700 text-xs">start.bat</code>即可启动）
                                        </li>
                                        <li>确认端口与本地 <code className="px-1 rounded bg-gray-100 dark:bg-gray-700 text-xs">config.json</code> 的 listenPort 一致，再点「检测服务」</li>
                                    </ol>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="mb-4 flex justify-center" >
                <button onClick={handleScan} disabled={isScanning || isPreparing || (activeTab === 'local' && !agentProbe?.online)} className="flex items-center bg-purple-600 text-white font-bold py-2 px-4 rounded-md hover:bg-purple-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed">
                    {isPreparing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                    {isPreparing
                        ? (ipSource === 'third' && prepareTotal > 0
                            ? `解析源 ${prepareDone}/${prepareTotal}`
                            : '准备中...')
                            : isScanning
                                ? `测试中... (${progress}/${total})`
                                : (activeTab === 'local'
                                    ? (agentProbe?.online ? '开始测试（本地 Agent）' : '本地 Agent 未连接')
                                    : '开始测试（浏览器）')}
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
                                ) : agentActive ? (
                                    // 本地 Agent 暂不支持暂停，用不可点状态替代，避免点击无反应
                                    <span
                                        aria-label="本地 Agent 模式不支持暂停"
                                        title="本地 Agent 模式暂不支持暂停，可使用「停止测试」"
                                        className="p-1.5 rounded-full text-gray-300 bg-gray-100 dark:bg-gray-700 dark:text-gray-500 cursor-not-allowed"
                                    >
                                        <Pause className="w-4 h-4" />
                                    </span>
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