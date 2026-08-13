'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

export interface ConfirmOptions {
  title?: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export type ConfirmFn = (title: string, options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext);
}

interface Pending {
  title: string;
  options: ConfirmOptions;
  resolve: (val: boolean) => void;
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>((title, options = {}) => {
    return new Promise<boolean>(resolve => {
      setPending({ title, options, resolve });
    });
  }, []);

  function respond(val: boolean) {
    pending?.resolve(val);
    setPending(null);
  }

  // Keyboard: Escape → cancel
  useEffect(() => {
    if (!pending) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); respond(false); }
    }
    window.addEventListener('keydown', onKey);
    // focus cancel button when dialog opens
    setTimeout(() => cancelRef.current?.focus(), 0);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      {pending && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          className="fixed inset-0 z-[250] flex items-center justify-center"
          style={{ animation: 'backdrop-in 0.15s ease-out' }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => respond(false)}
          />

          {/* Panel */}
          <div
            className="relative z-10 bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4"
            style={{ animation: 'dialog-in 0.2s ease-out' }}
          >
            <div className="px-6 pt-6 pb-2">
              <h2 id="confirm-title" className="text-base font-semibold text-slate-900">
                {pending.title}
              </h2>
              {pending.options.body && (
                <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">
                  {pending.options.body}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 px-6 py-4">
              <button
                ref={cancelRef}
                onClick={() => respond(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                {pending.options.cancelLabel ?? 'Cancel'}
              </button>
              <button
                onClick={() => respond(true)}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                  pending.options.destructive
                    ? 'bg-red-600 hover:bg-red-700 focus:ring-red-300'
                    : 'bg-slate-800 hover:bg-slate-700 focus:ring-slate-300'
                } focus:outline-none focus:ring-2 focus:ring-offset-1`}
              >
                {pending.options.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes backdrop-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes dialog-in {
          from { opacity: 0; transform: scale(0.96) translateY(-6px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
      `}</style>
    </ConfirmContext.Provider>
  );
}
