import { useState, createContext, useContext, ReactNode, useCallback, useRef } from 'react';

interface ConfirmDialogContextType {
    confirm: (message: string, options?: ConfirmDialogOptions) => Promise<boolean>;
}

interface ConfirmDialogOptions {
    confirmText?: string;
    cancelText?: string;
    cancelButtonColor?: string;
    confirmButtonColor?: string;
}

const ConfirmDialogContext = createContext<ConfirmDialogContextType | undefined>(undefined);

export function useConfirm() {
    const context = useContext(ConfirmDialogContext);
    if (!context) {
        throw new Error('useConfirm must be used within a ConfirmDialogProvider');
    }
    return context;
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const [message, setMessage] = useState('');
    const resolveRef = useRef<(value: boolean) => void>(() => {});

    const [confirmText, setConfirmText] = useState('确定');
    const [cancelText, setCancelText] = useState('取消');
    const [cancelColor, setCancelColor] = useState('bg-gray-600 hover:bg-gray-700 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600');
    const [confirmColor, setConfirmColor] = useState('bg-red-600 hover:bg-red-700 focus:ring-red-500');

    const confirm = useCallback((msg: string, options: ConfirmDialogOptions = {}) => {
        setMessage(msg);
        setConfirmText(options.confirmText || '确定');
        setCancelText(options.cancelText || '取消');
        setCancelColor(options.cancelButtonColor || 'bg-gray-600 hover:bg-gray-700 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600');
        setConfirmColor(options.confirmButtonColor || 'bg-red-600 hover:bg-red-700 focus:ring-red-500');
                setIsOpen(true);
        return new Promise<boolean>((resolve) => {
            resolveRef.current = resolve;
        });
    }, []);

    const handleConfirm = () => {
        setIsOpen(false);
        resolveRef.current(true);
    };

    const handleCancel = () => {
        setIsOpen(false);
        resolveRef.current(false);
    };

    return (
        <ConfirmDialogContext.Provider value={{ confirm }}>
            {children}
            {isOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm transition-opacity">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4 transform transition-all scale-100 border border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">确认操作</h3>
                        <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm">{message}</p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={handleCancel}
                                className={`px-4 py-2 text-sm font-medium text-white rounded-md transition-colors ${cancelColor}`}
                            >
                                {cancelText}
                            </button>
                            <button
                                onClick={handleConfirm}
                                className={`px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${confirmColor}`}
                            >
                                {confirmText}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmDialogContext.Provider>
    );
}