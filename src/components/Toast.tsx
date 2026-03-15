import { useState, createContext, useContext, ReactNode, useCallback } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3000);
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed top-5 left-1/2 transform -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-sm pointer-events-none">
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        className={`mx-4 p-4 rounded-lg shadow-lg text-white text-sm font-medium transition-all duration-300 pointer-events-auto flex items-center justify-between ${
                            toast.type === 'success' ? 'bg-green-600 dark:bg-green-700' :
                            toast.type === 'error' ? 'bg-red-600 dark:bg-red-700' :
                            toast.type === 'warning' ? 'bg-yellow-500 dark:bg-yellow-600' :
                            'bg-blue-600 dark:bg-blue-700'
                        }`}
                    >
                        <span className="whitespace-pre-wrap">{toast.message}</span>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}