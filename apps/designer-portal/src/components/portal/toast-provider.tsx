'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type ToastVariant = 'success' | 'warning' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const variantBorderColor: Record<ToastVariant, string> = {
  success: 'border-l-[var(--color-sage)]',
  warning: 'border-l-[var(--color-golden-hour)]',
  error: 'border-l-[var(--color-terracotta)]',
  info: 'border-l-[var(--color-dusty-blue)]',
};

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}

      {/* Toast container */}
      <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-3">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex max-w-[380px] items-center gap-3 rounded-md border border-[var(--border-subtle)] border-l-[3px] bg-[var(--bg-surface)] px-5 py-3.5 ${variantBorderColor[t.variant]}`}
            style={{
              animation: 'fade-in 200ms var(--ease-default)',
            }}
          >
            <span className="font-body text-[0.85rem] text-[var(--text-primary)]">
              {t.message}
            </span>
            <button
              className="ml-auto shrink-0 cursor-pointer border-0 bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              onClick={() => removeToast(t.id)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
