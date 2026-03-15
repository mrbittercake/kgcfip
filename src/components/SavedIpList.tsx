import { useState, useEffect } from 'react';
import { getScenes, getSceneResults, saveResults } from '../api';
import { getLatencyColor, ScanResult } from '../utils/scanner';
import { getColoName } from '../utils/colo';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog'; // Import Trash2 and RotateCw
import { ListChecks, Trash2, RotateCw, FileText, File, Copy } from 'lucide-react';

// Type for data stored in KV, which does not include `isAvailable`
interface SavedIpData {
    ip: string;
    port: number;
    latency: number;
    colo?: string;
}
interface FlatIpItem extends SavedIpData {
    sceneName: string;
}

export function SavedIpList() {
    const [items, setItems] = useState<FlatIpItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedScenes, setSelectedScenes] = useState<Set<string>>(new Set());
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const { showToast } = useToast();
    const { confirm } = useConfirm();

    const loadData = async () => {
        setLoading(true);
        setItems([]); // Clear items before loading to avoid confusion
        try {
            // 1. 获取所有场景名
            const scenes = await getScenes();
            
            // 2. 并行获取所有场景的详细数据
            const promises = scenes.map(async (scene) => {
                try {
                    const results = await getSceneResults(scene.name);
                    return results.map(r => ({ ...r, sceneName: scene.name }));
                } catch (e) {
                    console.error(`Failed to load scene ${scene.name}`, e);
                    return [];
                }
            });

            const resultsArray = await Promise.all(promises);
            // 3. 扁平化数组
            const allItems = resultsArray.flat();
            setItems(allItems);
            setSelectedScenes(new Set(allItems.map(i => i.sceneName)));
        } catch (e) {
            console.error('Failed to load saved IPs', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const uniqueScenes = Array.from(new Set(items.map(i => i.sceneName))).sort();
    const filteredItems = items.filter(i => selectedScenes.has(i.sceneName));
    const filteredItemsSorted = [...filteredItems].sort((a, b) => {
        return a.latency - b.latency;
    });

    const handleCheckboxChange = (id: string, checked: boolean) => {
        const newSet = new Set(selectedItems);
        if (checked) newSet.add(id);
        else newSet.delete(id);
        setSelectedItems(newSet);
    };

    const handleSelectAll = (checked: boolean) => {
        const newSet = new Set(selectedItems);
        filteredItems.forEach(item => {
            const id = `${item.ip}:${item.port}#${item.sceneName}`;
            if (checked) newSet.add(id);
            else newSet.delete(id);
        });
        setSelectedItems(newSet);
    };

    const handleDeleteSelected = async () => {
        if (selectedItems.size === 0) return;
        const isConfirmed = await confirm(`确定要删除选中的 ${selectedItems.size} 个IP吗？`, {
            confirmText: '确定删除',
        });
        if (!isConfirmed) return;

        setLoading(true);
        try {
            const scenesToUpdate = new Set<string>();
            items.forEach(item => {
                if (selectedItems.has(`${item.ip}:${item.port}#${item.sceneName}`)) {
                    scenesToUpdate.add(item.sceneName);
                }
            });

            for (const scene of scenesToUpdate) {
                const sceneItems = items.filter(i => i.sceneName === scene);
                const keepItems = sceneItems.filter(item => !selectedItems.has(`${item.ip}:${item.port}#${item.sceneName}`));

                const resultsToSave = keepItems.map(({ sceneName, ...rest }) => rest);
                await saveResults(scene, resultsToSave as ScanResult[], 'overwrite');
            }
            setSelectedItems(new Set());
            await loadData();
        } catch (e) {
            showToast('删除失败', 'error');
            setLoading(false);
        }
    };

    const handleExportCsv = () => {
        if (filteredItemsSorted.length === 0) {
            showToast('没有可导出的数据', 'warning');
            return;
        }

        const headers = ['IP地址', '端口', '延迟(ms)', '地区代码', '地区名称', '场景'];
        const csvContent = [
            headers.join(','),
            ...filteredItemsSorted.map(item => [
                item.ip,
                item.port,
                item.latency,
                item.colo || '',
                getColoName(item.colo || ''),
                item.sceneName
            ].map(field => {
                const stringField = String(field);
                // Escape quotes and wrap in quotes if contains comma, quote or newline
                if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
                    return `"${stringField.replace(/"/g, '""')}"`;
                }
                return stringField;
            }).join(','))
        ].join('\n');

        // Add BOM for Excel compatibility
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `ip_list_export_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleExportTxt = async () => {
        if (filteredItemsSorted.length === 0) {
            showToast('没有可导出的数据', 'warning');
            return;
        }

        try {
            let txtContent = '';
            for (const item of filteredItemsSorted) {
                const regionName = getColoName(item.colo || '');
                const sceneName = item.sceneName;
                const latency = `${item.latency}ms`;
                const comment = `${regionName}|${sceneName}|${latency}`;
                txtContent += `${item.ip}:${item.port}#${comment}\n`;
            }

            // Create a new file with the TXT data.
            const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `ip_list_export_${new Date().toISOString().slice(0, 10)}.txt`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            console.error('Failed to export to TXT:', error);
            showToast(`导出TXT失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
        }
    };

    const handleCopyToClipboard = () => {
        if (filteredItemsSorted.length === 0) {
            showToast('没有可复制的数据', 'warning');
            return;
        }

        let txtContent = '';
        for (const item of filteredItemsSorted) {
            const regionName = getColoName(item.colo || '');
            const sceneName = item.sceneName;
            const latency = `${item.latency}ms`;
            const comment = `${regionName}|${sceneName}|${latency}`;
            txtContent += `${item.ip}:${item.port}#${comment}\n`;
        }

        navigator.clipboard.writeText(txtContent).then(() => {
            showToast('已复制到剪贴板', 'success');
        }).catch(err => {
            console.error('Failed to copy to clipboard:', err);
            showToast('复制失败，请检查浏览器权限', 'error');
        });
    };


    const isAllSelected = filteredItems.length > 0 && filteredItems.every(item => selectedItems.has(`${item.ip}:${item.port}#${item.sceneName}`));

    return (
        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 mb-8">
            <div className="flex flex-col gap-4 mb-4">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                        <ListChecks className="w-7 h-7 text-green-500" />
                        <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-200">已保存的 IP 列表</h2>
                        <span className="px-2.5 py-0.5 bg-green-100 text-green-800 text-sm font-semibold rounded-full dark:bg-green-900 dark:text-green-300">{items.length} 个IP</span>
                    </div>
                    <div className="flex items-center gap-4">
                        {selectedItems.size > 0 && (
                            <button
                                onClick={handleDeleteSelected}
                                className="px-4 py-1.5 text-sm font-medium text-red-800 bg-red-100 rounded-full hover:bg-red-200 dark:bg-red-900 dark:text-red-300 dark:hover:bg-red-800 transition-colors"
                            >
                                <Trash2 className="w-4 h-4 mr-1 inline-block" />
                                删除选中 ({selectedItems.size})
                            </button>
                        )}
                        <button
                            onClick={loadData}
                            className="px-4 py-1.5 text-sm font-medium text-blue-800 bg-blue-100 rounded-full hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800 transition-colors"
                        >
                            <RotateCw className="w-4 h-4 mr-1 inline-block" />
                            刷新
                        </button>
                    </div>
                </div>

                <div className="flex flex-col gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="flex items-start gap-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-1 whitespace-nowrap">场景过滤:</span>
                        <div className="flex flex-wrap gap-2">
                            {uniqueScenes.map(scene => (
                                <label key={scene} className={`inline-flex items-center space-x-1 px-2 py-1 rounded border cursor-pointer select-none transition-colors ${selectedScenes.has(scene) ? 'bg-blue-100 border-blue-300 dark:bg-blue-900 dark:border-blue-700' : 'bg-white dark:bg-gray-600 border-gray-200 dark:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-500'}`}>
                                    <input
                                        type="checkbox"
                                        checked={selectedScenes.has(scene)}
                                        onChange={(e) => {
                                            const newSet = new Set(selectedScenes);
                                            if (e.target.checked) newSet.add(scene);
                                            else newSet.delete(scene);
                                            setSelectedScenes(newSet);
                                        }}
                                        className="rounded text-blue-600 focus:ring-blue-500 h-3 w-3"
                                    />
                                    <span className="text-xs text-gray-700 dark:text-gray-200">{scene}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                </div>
            </div>

            <div className="overflow-auto" style={{ maxHeight: '600px' }}>
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0 z-10">
                        <tr>
                            <th className="px-4 py-3 text-left">
                                <input 
                                    type="checkbox" 
                                    checked={isAllSelected}
                                    onChange={(e) => handleSelectAll(e.target.checked)}
                                    className="rounded text-purple-600 focus:ring-purple-500 h-4 w-4"
                                />
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">IP</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">端口</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">延迟</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">地区代码</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">地区</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">场景</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {loading ? (
                            <tr><td colSpan={7} className="px-4 py-4 text-center text-gray-500">加载中...</td></tr>
                        ) : filteredItems.length === 0 ? (
                            <tr><td colSpan={7} className="px-4 py-4 text-center text-gray-500">暂无数据</td></tr>
                        ) : (
                            filteredItemsSorted.map((item) => (
                                <tr key={`${item.ip}-${item.port}-${item.sceneName}`} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                    <td className="px-4 py-2">
                                        <input 
                                            type="checkbox"
                                            checked={selectedItems.has(`${item.ip}:${item.port}#${item.sceneName}`)}
                                            onChange={(e) => handleCheckboxChange(`${item.ip}:${item.port}#${item.sceneName}`, e.target.checked)}
                                            className="rounded text-purple-600 focus:ring-purple-500 h-4 w-4"
                                        />
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-white">{item.ip}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{item.port}</td>
                                    <td className={`px-4 py-2 whitespace-nowrap text-sm font-semibold ${getLatencyColor(item.latency)}`}>
                                        {item.latency > -1 ? `${item.latency}ms` : 'N/A'}
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{item.colo || '-'}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{getColoName(item.colo || '')}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{item.sceneName}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>

            </div>
            <div className="mt-8 flex justify-center gap-4">
                    <button onClick={handleExportCsv} className="flex items-center px-4 py-2 font-bold text-white bg-green-600 rounded hover:bg-green-700 transition-colors">
                        <File className="w-4 h-4 mr-2" />
                        导出 CSV
                    </button>
                    <button onClick={handleExportTxt} className="flex items-center px-4 py-2 font-bold text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors">
                         <FileText className="w-4 h-4 mr-2" />
                        导出 TXT
                    </button>
                    <button onClick={handleCopyToClipboard} className="flex items-center px-4 py-2 font-bold text-white bg-purple-600 rounded hover:bg-purple-700 transition-colors">
                        <Copy className="w-4 h-4 mr-2" />
                        复制
                    </button>
            </div>
        </div>
    );
}