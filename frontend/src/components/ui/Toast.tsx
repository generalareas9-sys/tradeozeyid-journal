import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastOptions {
  variant?: ToastVariant;
  title: string;
  message?: string;
  /** Milliseconds before auto-dismissal. Omit for a toast that stays until dismissed. */
  duration?: number;
}

export interface ToastRecord extends Required<Pick<ToastOptions, 'title'>> {
  id: string;
  variant: ToastVariant;
  message?: string;
}

interface ToastContextValue {
  toasts: ToastRecord[];
  show: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANTS: Record<ToastVariant, { container: string; glyph: string }> = {
  success: { container: 'border-positive bg-positive-soft text-positive', glyph: '✓' },
  error: { container: 'border-negative bg-negative-soft text-negative', glyph: '!' },
  info: { container: 'border-border bg-card text-text-muted', glyph: 'i' },
};

/**
 * One toast. Meaning never rests on colour: the variant is announced by the
 * glyph and by the live-region role, and the title is always visible text.
 */
export function Toast({
  variant = 'info',
  title,
  message,
  onDismiss,
  dismissLabel = 'Dismiss',
}: {
  variant?: ToastVariant;
  title: string;
  message?: string;
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  const { container, glyph } = VARIANTS[variant];

  return (
    <div
      // `alert` for errors so it interrupts; `status` is polite for the rest.
      role={variant === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-card ${container}`}
    >
      <span aria-hidden="true" className="font-semibold">
        {glyph}
      </span>

      <div className="flex flex-1 flex-col gap-1">
        <span className="font-medium text-text">{title}</span>
        {message ? <span className="text-xs text-text-muted">{message}</span> : null}
      </div>

      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className="shrink-0 rounded-md px-1.5 py-1 text-text-muted hover:text-text focus:outline-none focus-visible:ring-2"
        >
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
    </div>
  );
}

/**
 * Minimal toast state. Intentionally not a notification system: no transport,
 * no backend coupling, no persistence. Callers decide when to raise and dismiss.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((options: ToastOptions) => {
    const id = `${Date.now()}-${toasts.length}`;
    const record: ToastRecord = {
      id,
      variant: options.variant ?? 'info',
      title: options.title,
      ...(options.message ? { message: options.message } : {}),
    };

    setToasts((current) => [...current, record]);

    if (options.duration !== undefined) {
      setTimeout(() => dismiss(id), options.duration);
    }

    return id;
  }, [dismiss, toasts.length]);

  const value = useMemo(() => ({ toasts, show, dismiss }), [toasts, show, dismiss]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used inside a <ToastProvider>.');
  }

  return context;
}