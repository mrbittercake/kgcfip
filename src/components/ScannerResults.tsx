import { useState, useEffect, useRef } from 'react';
import { saveResults, getScenes } from '../api';
import {
  ScanResult,
  getLatencyColor,
} from '../utils/scanner';
import { useToast } from './Toast';
import { ListFilter, Save } from 'lucide-react';
import { RegionDisplay } from './RegionDisplay';

interface IpScannerResultsAndSaveProps {
    scanResults: ScanResult[];
    onSaveSuccess?: () => void;
}

const DEFAULT_IPS_PER_REGION = 20;

export function ScannerResults({ scanResults, onSaveSuccess }: IpScannerResultsAndSaveProps) {
    const [ipsPerRegion, setIpsPerRegion] = useState<string>(String(DEFAULT_IPS_PER_REGION));
    const [ipsPerRegionError, setIpsPerRegionError] = useState<string>('');
    const [isLatencyFilterEnabled, setIsLatencyFilterEnabled] = useState(false);
    const [isRegionLimitEnabled, setIsRegionLimitEnabled] = useState(false);
    const [latencyFilterValue, setLatencyFilterValue] = useState<string>('300');
    const [latencyFilterError, setLatencyFilterError] = useState<string>('');
    const [isSaving, setIsSaving] = useState(false);
    const [sceneName, setSceneName] = useState('');
    const [scenes, setScenes] = useState<string[]>([]);
    const [sceneDropdownOpen, setSceneDropdownOpen] = useState(false);
    const sceneInputRef = useRef<HTMLDivElement>(null);
    const [saveMode, setSaveMode] = useState<'overwrite' | 'append'>('overwrite');
    const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());
    const [selectedPorts, setSelectedPorts] = useState<Set<string>>(new Set());
    const filterInitialized = useRef(false);

    const uniqueRegions: string[] = Array.from(new Set(scanResults.map(r => r.colo))).filter((r): r is string => !!r).sort();
    const uniquePorts: number[] = Array.from(new Set(scanResults.map(r => r.port))).sort((a, b) => a - b);

    // 结果首次就绪时，默认将全部地区/端口选入集合（真正全选，而非空集代表全选）
    useEffect(() => {
        if (!filterInitialized.current && uniqueRegions.length > 0) {
            setSelectedRegions(new Set(uniqueRegions));
            setSelectedPorts(new Set(uniquePorts.map(String)));
            filterInitialized.current = true;
        }
    }, [uniqueRegions, uniquePorts]);

    // 加载已保存场景名列表，供场景录入框快速选择
    useEffect(() => {
        const load = async () => {
            try {
                const data = await getScenes();
                setScenes(data.map((s) => s.name));
            } catch {
                // 加载失败不影响录入
            }
        };
        load();
    }, []);

    // 点击下拉外部时关闭场景选择浮层
    useEffect(() => {
        if (!sceneDropdownOpen) return;
        const handler = (e: MouseEvent) => {
            if (sceneInputRef.current && !sceneInputRef.current.contains(e.target as Node)) {
                setSceneDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [sceneDropdownOpen]);

    // 已保存场景列表，不进行过滤，全部展示为标签
    const sceneOptions = scenes;

    const latencyTrim = latencyFilterValue.trim();
    const isLatencyFormatValid = /^\d+$/.test(latencyTrim);
    const effectiveLatencyValue = isLatencyFormatValid ? parseInt(latencyTrim, 10) : 0;

    const ipsPerRegionTrim = ipsPerRegion.trim();
    const isIpsPerRegionFormatValid = /^\d+$/.test(ipsPerRegionTrim) && parseInt(ipsPerRegionTrim, 10) >= 1;
    const effectiveIpsPerRegion = isIpsPerRegionFormatValid ? parseInt(ipsPerRegionTrim, 10) : DEFAULT_IPS_PER_REGION;

    const baseFilteredResults = scanResults.filter(r => isLatencyFilterEnabled
        ? (isLatencyFormatValid && r.latency > -1 && r.latency <= effectiveLatencyValue)
        : true
    );

    const portCounts = baseFilteredResults.reduce((acc, r) => {
        const key = String(r.port);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    // 按端口筛选：仅保留 selectedPorts 中的端口
    const portFilteredResults = baseFilteredResults.filter(r =>
        selectedPorts.has(String(r.port))
    );

  const regionCounts = portFilteredResults.reduce((acc, r) => {
        if (r.colo) {
            acc[r.colo] = (acc[r.colo] || 0) + 1;
        }
        return acc;
    }, {} as Record<string, number>);

    const filteredResults = portFilteredResults.filter(r =>
        r.colo ? selectedRegions.has(r.colo) : true
    );

    let limitedResults = [...filteredResults];
    if (isRegionLimitEnabled) {
        const regionCountsForLimit: { [key: string]: number } = {};
        limitedResults = filteredResults.filter(r => {
            const colo = r.colo || 'Unknown';
            regionCountsForLimit[colo] = (regionCountsForLimit[colo] || 0) + 1;
            return regionCountsForLimit[colo] <= effectiveIpsPerRegion;
        });
    }

    const { showToast } = useToast();

    const handleSave = async () => {
        if (filteredResults.length === 0) {
            showToast('没有可保存的结果。', 'warning');
            return;
        }

        if (!sceneName.trim()) {
            showToast('请输入场景名称', 'warning');
            return;
        }

        setIsSaving(true);
        try{
            const dataToSave = limitedResults.map(({ isAvailable, ...rest }) => rest);
            await saveResults(sceneName.trim(), dataToSave as ScanResult[], saveMode);
            showToast(`场景 "${sceneName.trim()}" 保存成功！\n共 ${limitedResults.length} 个IP/域名\n模式: ${saveMode === 'overwrite' ? '覆盖' : '追加'}`, 'success');
            if (onSaveSuccess) onSaveSuccess();
        } catch (error) {
            console.error('Failed to save results:', error);
            showToast(`保存失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        
        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 mb-8">
            <div className="flex items-center gap-3 mb-4">
                <ListFilter className="w-7 h-7 text-purple-500" />
                <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-200">IP/域名优选测速结果</h2>
            </div>
            {scanResults.length > 0 ? (
                <>
                    <div className="p-3 mb-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div className="flex items-center gap-4 mb-4 pb-3 border-b border-gray-200 dark:border-gray-600">
                            <div className="flex items-center gap-4 flex-wrap">
                                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200">筛选与操作:</h3>
                                <div className="flex items-center gap-2">
                                    <input
                                        id="latency-filter-enable"
                                        type="checkbox"
                                        checked={isLatencyFilterEnabled}
                                        onChange={(e) => {
                                            if (e.target.checked && !isLatencyFormatValid) {
                                                setLatencyFilterError('请输入有效的正整数');
                                                return;
                                            }
                                            setLatencyFilterError('');
                                            setIsLatencyFilterEnabled(e.target.checked);
                                        }}
                                        className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                    />
                                    <label htmlFor="latency-filter-enable" className="text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none">延迟 ≤</label>
                                </div>                                
                                 <div className="flex items-center gap-2">
                                    <input
                                        id="latency-filter-value"
                                        type="text"
                                        value={latencyFilterValue}
                                        onChange={(e) => { setLatencyFilterValue(e.target.value); if (latencyFilterError) setLatencyFilterError(''); }}
                                        className="p-1 border rounded-md w-20 text-sm dark:bg-gray-600 dark:border-gray-500 dark:text-white disabled:bg-gray-200 dark:disabled:bg-gray-800"
                                        disabled={!isLatencyFilterEnabled}
                                    />
                                    <span className="text-sm text-gray-600 dark:text-gray-300">ms</span>
                                    {latencyFilterError && <span className="text-red-500 text-xs">{latencyFilterError}</span>}
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        id="region-limit-enable"
                                        type="checkbox"
                                        checked={isRegionLimitEnabled}
                                        onChange={(e) => {
                                            if (e.target.checked && !isIpsPerRegionFormatValid) {
                                                setIpsPerRegionError('请输入大于等于1的整数');
                                                return;
                                            }
                                            setIpsPerRegionError('');
                                            setIsRegionLimitEnabled(e.target.checked);
                                        }}
                                        className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                    />
                                    <label htmlFor="region-limit-enable" className="text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none">每个地区保留</label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        id="ips-per-region"
                                        type="text"
                                        value={ipsPerRegion}
                                        onChange={(e) => { setIpsPerRegion(e.target.value); if (ipsPerRegionError) setIpsPerRegionError(''); }}
                                        className="p-1 border rounded-md w-20 text-sm dark:bg-gray-600 dark:border-gray-500 dark:text-white disabled:bg-gray-200 dark:disabled:bg-gray-800"
                                        disabled={!isRegionLimitEnabled}
                                    />
                                    <span className="text-sm text-gray-600 dark:text-gray-300">个</span>
                                    {ipsPerRegionError && <span className="text-red-500 text-xs">{ipsPerRegionError}</span>}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200">按地区筛选</h3>
                            <div className="flex items-center gap-3">
                                <button 
                                    onClick={() => setSelectedRegions(new Set(uniqueRegions))}
                                    className="px-3 py-1 text-xs font-medium text-blue-800 bg-blue-100 rounded-full hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800 transition-colors"
                                >
                                    全选
                                </button>
                                <button 
                                    onClick={() => setSelectedRegions(new Set())}
                                    className="px-3 py-1 text-xs font-medium text-gray-800 bg-gray-100 rounded-full hover:bg-gray-200 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500 transition-colors"
                                >
                                    清空
                                </button>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {uniqueRegions.map(region => {
                                const countForRegion = regionCounts[region] || 0;
                                const displayCount = isRegionLimitEnabled ? Math.min(countForRegion, effectiveIpsPerRegion) : countForRegion;
                                const isSelected = selectedRegions.has(region);
                                return (
                                    <button
                                        key={region}
                                        type="button"
                                        onClick={() => {
                                            const newSet = new Set(selectedRegions);
                                            if (newSet.has(region)) {
                                                newSet.delete(region);
                                            } else {
                                                newSet.add(region);
                                            }
                                            setSelectedRegions(newSet);
                                        }}
                                        className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                                            isSelected
                                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-900/40 dark:text-indigo-200 dark:border-indigo-700/60 dark:hover:bg-indigo-800/60'
                                                : 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600'
                                        }`}
                                    >
                                        <RegionDisplay colo={region} flagSize="xs" /> <span>({displayCount})</span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex items-center justify-between mb-2 mt-4">
                            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200">按端口筛选</h3>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setSelectedPorts(new Set(uniquePorts.map(String)))}
                                    className="px-3 py-1 text-xs font-medium text-blue-800 bg-blue-100 rounded-full hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800 transition-colors"
                                >
                                    全选
                                </button>
                                <button
                                    onClick={() => setSelectedPorts(new Set())}
                                    className="px-3 py-1 text-xs font-medium text-gray-800 bg-gray-100 rounded-full hover:bg-gray-200 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500 transition-colors"
                                >
                                    清空
                                </button>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {uniquePorts.map((port) => {
                                const portStr = String(port);
                                const isSelected = selectedPorts.has(portStr);
                                return (
                                    <button
                                        key={port}
                                        type="button"
                                        onClick={() => {
                                            const newSet = new Set(selectedPorts);
                                            if (newSet.has(portStr)) {
                                                newSet.delete(portStr);
                                            } else {
                                                newSet.add(portStr);
                                            }
                                            setSelectedPorts(newSet);
                                        }}
                                        className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                                            isSelected
                                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-900/40 dark:text-indigo-200 dark:border-indigo-700/60 dark:hover:bg-indigo-800/60'
                                                : 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600'
                                        }`}
                                    >
                                        {port} <span className="opacity-60">({portCounts[portStr] || 0})</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">IP/域名</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">端口</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">延迟 (ms)</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">地区</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {limitedResults.map(({ ip, port, latency, colo, domain }) => (
                                <tr key={`${ip}:${port}`} className="hover:bg-gray-100 dark:hover:bg-gray-700">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-white">
                                        {ip}
                                        {domain && <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">域名</span>}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{port}</td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold ${getLatencyColor(latency)}`}>{latency > -1 ? `${latency}ms` : 'N/A'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{colo ? <RegionDisplay colo={colo} flagSize="sm" /> : '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
           
                <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                    <div className="flex items-center gap-3 mb-4">
                        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">保存结果</h3>
                        <span className="px-2.5 py-0.5 bg-green-100 text-green-800 text-sm font-semibold rounded-full dark:bg-green-900 dark:text-green-300">IP {limitedResults.filter(r => !r.domain).length} 个</span>
                        <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-800 text-sm font-semibold rounded-full dark:bg-indigo-900 dark:text-indigo-300">域名 {limitedResults.filter(r => r.domain).length} 个</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="relative" ref={sceneInputRef}>
                            <input 
                                id="scene-name"
                                type="text" 
                                value={sceneName}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    setSceneName(v);
                                    // 自行输入内容后隐藏下拉，清空则重新展开
                                    setSceneDropdownOpen(v.trim() === '');
                                }}
                                onFocus={() => setSceneDropdownOpen(true)}
                                placeholder="场景名称，例如: 家庭电信"
                                className="p-2 border rounded-md w-64 dark:bg-gray-600 dark:border-gray-500 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            {sceneDropdownOpen && (
                                <div className="absolute z-30 mt-1 w-64 max-h-56 overflow-auto rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg p-2">
                                    {sceneOptions.length > 0 ? (
                                        <div className="flex flex-wrap gap-1.5">
                                            {sceneOptions.map((name) => (
                                                <button
                                                    key={name}
                                                    type="button"
                                                    onClick={() => { setSceneName(name); setSceneDropdownOpen(false); }}
                                                    className="px-2.5 py-1 text-xs font-medium rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 hover:border-indigo-300 dark:bg-indigo-900/40 dark:text-indigo-200 dark:border-indigo-700/60 dark:hover:bg-indigo-800/60 transition-colors"
                                                >
                                                    {name}
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="px-1 py-2 text-xs text-gray-400 dark:text-gray-500">
                                            暂无已保存场景
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        
                        <div className="relative flex w-fit items-center rounded-lg bg-gray-100 p-1 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
                            <button
                                onClick={() => setSaveMode('overwrite')}
                                className={`relative z-10 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                                    saveMode === 'overwrite'
                                        ? 'bg-white text-gray-800 shadow-sm dark:bg-gray-900 dark:text-white'
                                        : 'text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white'
                                }`}
                            >
                                覆盖同场景数据
                            </button>
                            <button
                                onClick={() => setSaveMode('append')}
                                className={`relative z-10 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                                    saveMode === 'append'
                                        ? 'bg-white text-gray-800 shadow-sm dark:bg-gray-900 dark:text-white'
                                        : 'text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white'
                                }`}
                            >
                                追加到旧数据
                            </button>
                        </div>

                        <button
                            onClick={handleSave}
                            disabled={isSaving || filteredResults.length === 0 || !sceneName.trim()}
                            className="flex items-center bg-blue-600 text-white font-bold py-2 px-6 rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                            <Save className="w-4 h-4 mr-2" />
                            {isSaving ? '保存中...' : '保存'}
                        </button>
                    </div>
                </div>
                </>
            ) : (
                <p className="text-gray-500 dark:text-gray-400 text-center">暂无测试结果数据</p>
            )}
        </div>
    );
}
