import { useState } from 'react';
import { saveResults } from '../api';
import {
  getColoName,
  ScanResult,
  getLatencyColor,
} from '../utils/scanner';
import { useToast } from './Toast';
import { ListFilter, Save } from 'lucide-react';

export { ScannerResults };
interface IpScannerResultsAndSaveProps {
    scanResults: ScanResult[];
    onSaveSuccess?: () => void;
}

const DEFAULT_IPS_PER_REGION = 20;

function ScannerResults({ scanResults, onSaveSuccess }: IpScannerResultsAndSaveProps) {
    const [ipsPerRegion, setIpsPerRegion] = useState(DEFAULT_IPS_PER_REGION);
    const [isLatencyFilterEnabled, setIsLatencyFilterEnabled] = useState(false);
    const [isRegionLimitEnabled, setIsRegionLimitEnabled] = useState(false);
    const [latencyFilterValue, setLatencyFilterValue] = useState(300);
    const [isSaving, setIsSaving] = useState(false);
    const [sceneName, setSceneName] = useState('');
    const [saveMode, setSaveMode] = useState<'overwrite' | 'append'>('overwrite');
    const [unselectedRegions, setUnselectedRegions] = useState<Set<string>>(new Set());

    const uniqueRegions: string[] = Array.from(new Set(scanResults.map(r => r.colo))).filter((r): r is string => !!r).sort();
  
    const baseFilteredResults = scanResults.filter(r => isLatencyFilterEnabled ? (r.latency > -1 && r.latency < latencyFilterValue) : true);
  
  const regionCounts = baseFilteredResults.reduce((acc, r) => {
        if (r.colo) {
            acc[r.colo] = (acc[r.colo] || 0) + 1;
        }
        return acc;
    }, {} as Record<string, number>);

    const filteredResults = baseFilteredResults.filter(r => !r.colo || !unselectedRegions.has(r.colo));

    let limitedResults = [...filteredResults];
    if (isRegionLimitEnabled) {
        const regionCountsForLimit: { [key: string]: number } = {};
        limitedResults = filteredResults.filter(r => {
            const colo = r.colo || 'Unknown';
            regionCountsForLimit[colo] = (regionCountsForLimit[colo] || 0) + 1;
            return regionCountsForLimit[colo] <= ipsPerRegion;
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
            showToast(`场景 "${sceneName.trim()}" 保存成功！\n共 ${limitedResults.length} 个IP\n模式: ${saveMode === 'overwrite' ? '覆盖' : '追加'}`, 'success');
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
                <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-200">IP优选测速结果</h2>
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
                                        onChange={(e) => setIsLatencyFilterEnabled(e.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                    />
                                    <label htmlFor="latency-filter-enable" className="text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none">延迟 &lt;</label>
                                </div>                                
                                 <div className="flex items-center gap-2">
                                    <input
                                        id="latency-filter-value"
                                        type="number"
                                        value={latencyFilterValue}
                                        onChange={(e) => setLatencyFilterValue(parseInt(e.target.value, 10) || 0)}
                                        className="p-1 border rounded-md w-20 text-sm dark:bg-gray-600 dark:border-gray-500 dark:text-white disabled:bg-gray-200 dark:disabled:bg-gray-800"
                                        disabled={!isLatencyFilterEnabled}
                                    />
                                    <span className="text-sm text-gray-600 dark:text-gray-300">ms</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        id="region-limit-enable"
                                        type="checkbox"
                                        checked={isRegionLimitEnabled}
                                        onChange={(e) => setIsRegionLimitEnabled(e.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                    />
                                    <label htmlFor="region-limit-enable" className="text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none">地区IP &lt;=</label>
                                </div>
                                <input
                                    id="ips-per-region"
                                    type="number"
                                    value={ipsPerRegion}
                                    onChange={(e) => setIpsPerRegion(parseInt(e.target.value, 10) || DEFAULT_IPS_PER_REGION)}
                                    className="p-1 border rounded-md w-20 text-sm dark:bg-gray-600 dark:border-gray-500 dark:text-white disabled:bg-gray-200 dark:disabled:bg-gray-800"
                                    disabled={!isRegionLimitEnabled}
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200">按地区筛选</h3>
                            <div className="flex items-center gap-3">
                                <button 
                                    onClick={() => setUnselectedRegions(new Set())}
                                    className="px-3 py-1 text-xs font-medium text-blue-800 bg-blue-100 rounded-full hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800 transition-colors"
                                >
                                    全选
                                </button>
                                <button 
                                    onClick={() => setUnselectedRegions(new Set(uniqueRegions))}
                                    className="px-3 py-1 text-xs font-medium text-gray-800 bg-gray-100 rounded-full hover:bg-gray-200 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500 transition-colors"
                                >
                                    清空
                                </button>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {uniqueRegions.map(region => {
                                const countForRegion = regionCounts[region] || 0;
                                const displayCount = isRegionLimitEnabled ? Math.min(countForRegion, ipsPerRegion) : countForRegion;
                                return (
                                    <label key={region} className="inline-flex items-center space-x-1 bg-white dark:bg-gray-600 px-2 py-1 rounded border border-gray-200 dark:border-gray-500 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-500 transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={!unselectedRegions.has(region)}
                                            onChange={(e) => {
                                                const newSet = new Set(unselectedRegions);
                                                if (e.target.checked) {
                                                    newSet.delete(region);
                                                } else {
                                                    newSet.add(region);
                                                }
                                                setUnselectedRegions(newSet);
                                            }}
                                            className="rounded text-purple-600 focus:ring-purple-500 h-3 w-3"
                                        />
                                        <span className="text-xs text-gray-700 dark:text-gray-200">{getColoName(region)} ({displayCount})</span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">IP 地址</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">端口</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">延迟 (ms)</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">地区</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {limitedResults.map(({ ip, port, latency, colo }) => (
                                <tr key={`${ip}:${port}`} className="hover:bg-gray-100 dark:hover:bg-gray-700">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-white">{ip}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{port}</td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold ${getLatencyColor(latency)}`}>{latency > -1 ? `${latency}ms` : 'N/A'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{colo ? getColoName(colo) : '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
           
                <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                    <div className="flex items-center gap-3 mb-4">
                        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">保存结果</h3>
                        <span className="px-2.5 py-0.5 bg-green-100 text-green-800 text-sm font-semibold rounded-full dark:bg-green-900 dark:text-green-300">{limitedResults.length} 个IP</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                        <div>
                            <input 
                                id="scene-name"
                                type="text" 
                                value={sceneName}
                                onChange={(e) => setSceneName(e.target.value)}
                                placeholder="场景名称，例如: 家庭电信"
                                className="p-2 border rounded-md w-64 dark:bg-gray-600 dark:border-gray-500 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            />
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
