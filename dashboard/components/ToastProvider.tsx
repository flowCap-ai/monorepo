'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number; // ms, default 5000
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

// ─── Context ─────────────────────────────────────────────────

const ToastContext = createContext<ToastContextType>({
  toasts: [],
  addToast: () => {},
  removeToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

// ─── Provider ────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

// ─── Toast Container ─────────────────────────────────────────

function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: Toast[];
  onRemove: (id: string) => void;
}) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse gap-2 max-w-md">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

// ─── Individual Toast ────────────────────────────────────────

function ToastItem({
  toast,
  onRemove,
}: {
  toast: Toast;
  onRemove: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onRemove(toast.id);
    }, toast.duration ?? 5000);

    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onRemove]);

  const styles: Record<ToastType, { icon: React.ReactNode; border: string; bg: string }> = {
    success: {
      icon: <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />,
      border: 'border-emerald-500/20',
      bg: 'bg-emerald-500/[0.06]',
    },
    error: {
      icon: <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />,
      border: 'border-red-500/20',
      bg: 'bg-red-500/[0.06]',
    },
    warning: {
      icon: <AlertTriangle className="w-4 h-4 text-orange-400 flex-shrink-0" />,
      border: 'border-orange-500/20',
      bg: 'bg-orange-500/[0.06]',
    },
    info: {
      icon: <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />,
      border: 'border-blue-500/20',
      bg: 'bg-blue-500/[0.06]',
    },
  };

  const s = styles[toast.type];

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-xl border ${s.border} ${s.bg} backdrop-blur-xl shadow-lg shadow-black/20 animate-in slide-in-from-right-5 duration-200`}
      role="alert"
    >
      <div className="mt-0.5">{s.icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{toast.title}</p>
        {toast.description && (
          <p className="text-xs text-zinc-400 mt-0.5">{toast.description}</p>
        )}
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        className="p-1 rounded-md hover:bg-white/5 transition-colors flex-shrink-0"
      >
        <X className="w-3.5 h-3.5 text-zinc-500" />
      </button>
    </div>
  );
}

export default ToastProvider;
