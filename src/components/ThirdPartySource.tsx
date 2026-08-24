import { useState, useEffect, useRef } from 'react';
import { Globe, Save } from 'lucide-react';
import { useToast } from './Toast';
import { getThirdPartySources, saveThirdPartySources } from '../api';

const LINE_HEIGHT = 24;

export function ThirdPartySource() {
    const [urls, setUrls] = useState('');
    const [loading, setLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [scrollTop, setScrollTop] = useState(0);
    const taRef = useRef<HTMLTextAreaElement>(null);
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

    // 行数 = 内容行数（至少 1 行，保证空内容也有一行阴影）
    const lineCount = Math.max(urls.split('\n').length, 1);

    return (
        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 mb-8">
            <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                    <Globe className="w-7 h-7 text-indigo-500" />
                    <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-200">第三方 IP/域名 源</h2>
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
            <div className="line-editor flex rounded-md border dark:border-gray-600 overflow-hidden font-mono text-sm" style={{ height: 10 * LINE_HEIGHT + 8 }}>
                <div
                    className="gutter flex-none select-none text-right text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900/40 border-r dark:border-gray-600 pb-2 px-2 overflow-hidden"
                    aria-hidden
                >
                    <div style={{ transform: `translateY(${-scrollTop}px)` }}>
                        {Array.from({ length: lineCount }, (_, i) => (
                            <div key={i} style={{ height: LINE_HEIGHT, lineHeight: `${LINE_HEIGHT}px` }}>
                                {i + 1}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="editor-area relative flex-1 overflow-hidden">
                    <div
                        className="line-shades absolute pointer-events-none"
                        aria-hidden
                        style={{ top: 0, left: 0, right: 0, bottom: 0, transform: `translateY(${-scrollTop}px)` }}
                    >
                        {Array.from({ length: lineCount }, (_, i) => (
                            <div
                                key={i}
                                className="shade-line"
                                style={{
                                    height: LINE_HEIGHT,
                                    background: i % 2 === 0 ? 'rgba(99,102,241,0.06)' : 'transparent',
                                }}
                            />
                        ))}
                    </div>
                    <textarea
                        ref={taRef}
                        value={urls}
                        onChange={(e) => setUrls(e.target.value)}
                        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
                        placeholder="请输入接口地址，例如：&#10;https://api.example.com/ips&#10;https://other.source/list"
                        className="relative w-full h-full pb-2 pl-3 pr-3 border-0 bg-transparent dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none resize-none overflow-auto transition-colors"
                        style={{ lineHeight: `${LINE_HEIGHT}px` }}
                        disabled={loading || isSaving}
                    />
                </div>
            </div>
        </div>
    );
}