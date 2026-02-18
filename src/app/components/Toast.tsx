'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Toast as ToastType } from '@/hooks/useToast';

const typeStyles = {
    success: {
        bg: 'bg-emerald-900/90',
        border: 'border-emerald-500/30',
        text: 'text-emerald-100',
        icon: '✓',
    },
    error: {
        bg: 'bg-red-900/90',
        border: 'border-red-500/30',
        text: 'text-red-100',
        icon: '✕',
    },
    info: {
        bg: 'bg-blue-900/90',
        border: 'border-blue-500/30',
        text: 'text-blue-100',
        icon: 'ℹ',
    },
};

interface ToastContainerProps {
    toasts: ToastType[];
    onDismiss: (id: string) => void;
}

export default function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-full max-w-sm px-4">
            <AnimatePresence>
                {toasts.map(toast => {
                    const style = typeStyles[toast.type];
                    return (
                        <motion.div
                            key={toast.id}
                            initial={{ opacity: 0, y: 30, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            transition={{ duration: 0.3, ease: 'easeOut' }}
                            onClick={() => onDismiss(toast.id)}
                            className={`${style.bg} ${style.border} ${style.text} backdrop-blur-xl border rounded-2xl px-5 py-3 text-sm font-light tracking-wide flex items-center gap-3 cursor-pointer shadow-2xl`}
                        >
                            <span className="text-lg flex-shrink-0">{style.icon}</span>
                            <span>{toast.message}</span>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}
