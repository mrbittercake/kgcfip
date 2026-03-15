import { useState, useEffect } from 'react';
import { CloudflareIps } from './api';
import { SavedIpList } from './components/SavedIpList';
import { Login } from './components/Login';
import { CloudflareIpList } from './components/CloudflareIpList';
import { ApiDocs } from './components/ApiDocs';
import { ThirdPartySource } from './components/ThirdPartySource';
import { LogOut, Sun, Moon, Shirt } from 'lucide-react';
import { ScanResult } from './utils/scanner'; import { ScannerResults } from './components/ScannerResults';import { ScannerConfig } from './components/ScannerConfig';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [publicApiToken, setPublicApiToken] = useState('');
  const [cfIps, setCfIps] = useState<CloudflareIps | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');

  useEffect(() => {
    const savedAuth = localStorage.getItem('auth_token');
    if (savedAuth === 'true') {
      setIsLoggedIn(true);
      setPublicApiToken(localStorage.getItem('APITOKEN') || '');
    }
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | 'system';
    if (savedTheme) setTheme(savedTheme);
  }, []);

  useEffect(() => {
    const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
    (link as HTMLLinkElement).type = 'image/svg+xml';
    (link as HTMLLinkElement).rel = 'icon';
    (link as HTMLLinkElement).href = '/img/logo.svg';
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    const applyTheme = () => {
      if (theme === 'system') {
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.classList.toggle('dark', systemDark);
      } else {
        root.classList.toggle('dark', theme === 'dark');
      }
    };
    applyTheme();

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme();
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [theme]);

  const handleLogin = () => {
    setIsLoggedIn(true);
    localStorage.setItem('auth_token', 'true');
    setPublicApiToken(localStorage.getItem('APITOKEN') || '');
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('JWT_SECRET');
    localStorage.removeItem('APITOKEN');
    setPublicApiToken('');
  };

  const toggleTheme = () => {
    const nextTheme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
  };

  if (!isLoggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 py-8 px-4 transition-colors duration-200">
      <style>{`
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background-color: #cbd5e1;
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background-color: #94a3b8;
        }
        .dark ::-webkit-scrollbar-thumb {
          background-color: #4b5563;
        }
        .dark ::-webkit-scrollbar-thumb:hover {
          background-color: #6b7280;
        }
        ::-webkit-scrollbar-corner {
          background: transparent;
        }
      `}</style>
      <div className="max-w-6xl mx-auto">
        <header className="relative flex items-center justify-center mb-8">
          <div className="flex items-center gap-4">
            <img src="/img/logo.svg" alt="Logo" className="w-12 h-12" />
            <h1 className="text-4xl font-bold text-gray-800 dark:text-white">私人优选IP管理</h1>
          </div>
          <button
            onClick={toggleTheme}
            className="absolute right-0 top-1/2 -translate-y-1/2 p-2 rounded-lg text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-all border border-transparent hover:border-gray-300 dark:hover:border-gray-600"
            title={`当前主题: ${theme === 'system' ? '跟随系统' : theme === 'dark' ? '深色' : '浅色'}`}
          >
            {theme === 'light' && <Sun className="w-5 h-5" />}
            {theme === 'dark' && <Moon className="w-5 h-5" />}
            {theme === 'system' && <Shirt className="w-5 h-5" />}
          </button>
        </header>

        <main>
          <CloudflareIpList onDataLoaded={setCfIps} />
          
          <ThirdPartySource />
          
          <ScannerConfig cfIps={cfIps} onScanComplete={setScanResults} />
          <ScannerResults scanResults={scanResults} onSaveSuccess={() => setRefreshKey(k => k + 1)} />

          <SavedIpList key={refreshKey} />

          <ApiDocs apiToken={publicApiToken} />
        </main>
        
        <footer className="text-center mt-12 pb-8">
          <button 
            onClick={handleLogout}
            className="mb-6 bg-red-600 text-white font-medium text-sm py-2 px-4 rounded-md hover:bg-red-700 transition-colors flex items-center gap-2 mx-auto"
          >
            <LogOut className="w-4 h-4" />
            退出登录
          </button>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            &copy; {new Date().getFullYear()} 本系统仅用于个人学习和研究目的，禁止用于任何商业用途。请勿将优选IP用于任何违反Cloudflare服务条款和违反法律法规的活动。
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;