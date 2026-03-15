import { useState, useEffect } from 'react';
import { Globe, Save } from 'lucide-react';
import { useToast } from './Toast';
import { getThirdPartySources, saveThirdPartySources } from '../api';

export function ThirdPartySource() {
    const [urls, setUrls] = useState('');
    const [loading, setLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
        const loadSources = async () => {
            setLoading(true);
            try {
                const data = await getThirdPartySources();
                if (Array.isArray(data)) {
                    setUrls(data.join('\n'));
                }
            } catch (error) {
                console.error('Failed to load third-party sources:', error);
            } finally {
                setLoading(false);
            }
        };
        loadSources();
    }, []);

    const handleSave = async () => {
        if (loading) return;
        setIsSaving(true);
        try {
            const urlList = urls.split('\n')
                .map(url => url.trim())
                .filter(url => url !== '');
            
            await saveThirdPartySources(urlList);
            showToast('第三方源保存成功', 'success');
        } catch (error) {
            console.error('Failed to save third-party sources:', error);
            showToast('保存失败', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 mb-8">
            <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                    <Globe className="w-7 h-7 text-indigo-500" />
                    <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-200">第三方 IP 源</h2>
                </div>
                <button
                    onClick={handleSave}
                    disabled={isSaving || loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-100 rounded-full hover:bg-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-300 dark:hover:bg-indigo-800/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Save className="w-3.5 h-3.5" />
                    {isSaving ? '保存中...' : '保存'}
                </button>
            </div>
            <textarea
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                placeholder="请输入接口地址，例如：&#10;https://api.example.com/ips&#10;https://other.source/list"
                className="w-full h-32 p-3 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm resize-none transition-colors"
                disabled={loading || isSaving}
            />
        </div>
    );
}