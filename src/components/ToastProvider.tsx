'use client';

import { createContext, useContext, useState, useCallback, useRef } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

export interface ToastAPI {
  success: (message: string) => void;
  error:   (message: string) => void;
  warning: (message: string) => void;
  info:    (message: string) => void;
}

const ToastContext = createContext<ToastAPI>({
  success: () => {},
  error:   () => {},
  warning: () => {},
  info:    () => {},
});

export function useToast(): ToastAPI {
  return useContext(ToastContext);
}

const DURATION: Record<ToastType, number> = {
  success: 3500,
  error:   6000,
  warning: 5000,
  info:    4000,
};

const CONFIG: Record<ToastType, { icon: string; bar: string; bg: string; border: string; text: string }> = {
  success: { icon: '✓', bar: 'bg-green-500',  bg: 'bg-white', border: 'border-green-200', text: 'text-slate-800' },
  error:   { icon: '✕', bar: 'bg-red-500',    bg: 'bg-white', border: 'border-red-200',   text: 'text-slate-800' },
  warning: { icon: '⚠', bar: 'bg-amber-400',  bg: 'bg-white', border: 'border-amber-200', text: 'text-slate-800' },
  info:    { icon: 'ℹ', bar: 'bg-blue-500',   bg: 'bg-white', border: 'border-blue-200',  text: 'text-slate-800' },
};

const ICON_COLOR: Record<ToastType, string> = {
  success: 'text-green-600',
  error:   'text-red-500',
  warning: 'text-amber-500',
  info:    'text-blue-500',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const add = useCallback((message: string, type: ToastType) => {
    const id = String(++counter.current);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => remove(id), DURATION[type]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function remove(id: string) {
    setToasts(prev => prev.filter(t => t.id !== id));
  }

  const api: ToastAPI = {
    success: m => add(m, 'success'),
    error:   m => add(m, 'error'),
    warning: m => add(m, 'warning'),
    info:    m => add(m, 'info'),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/* Toast stack — bottom-right */}
      <div
        aria-live="polite"
        aria-label="Notifications"
        className="fixed bottom-5 right-5 z-[300] flex flex-col-reverse gap-2 pointer-events-none"
      >
        {toasts.map(toast => {
          const c = CONFIG[toast.type];
          return (
            <div
              key={toast.id}
              role="status"
              className={`pointer-events-auto relative flex items-start gap-3 pr-4 pl-0 py-3 rounded-lg border shadow-lg max-w-xs text-sm overflow-hidden ${c.bg} ${c.border} ${c.text}`}
              style={{ animation: 'toast-in 0.22s ease-out' }}
            >
              {/* left colour bar */}
              <span className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${c.bar}`} />
              {/* icon */}
              <span className={`pl-4 shrink-0 font-bold text-sm leading-none mt-0.5 ${ICON_COLOR[toast.type]}`}>
                {c.icon}
              </span>
              {/* message */}
              <span className="flex-1 leading-snug">{toast.message}</span>
              {/* close */}
              <button
                onClick={() => remove(toast.id)}
                className="shrink-0 text-slate-400 hover:text-slate-700 leading-none text-base"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
