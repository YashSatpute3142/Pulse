import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { uuid } from '../../utils/uuid.js';

const ToastContext = createContext(null);
const MAX = 3;
const TTL = 5000;

/** Toasts: --s2, border-strong, radius 12, shadow-float. 5s auto-dismiss (pauses on hover/focus). Max 3. role=status / alert. */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((toast) => {
    const id = uuid();
    setToasts((t) => [...t, { id, kind: 'info', ...toast }].slice(-MAX));
    return id;
  }, []);
  const api = useMemo(() => ({
    show: (message, opts) => push({ message, ...opts }),
    error: (message, opts) => push({ message, kind: 'error', ...opts }),
    dismiss,
  }), [push, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom)+12px)] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-4 md:left-4 md:right-auto md:items-start md:px-0">
          {toasts.map((t) => <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />)}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }) {
  const [paused, setPaused] = useState(false);
  const timer = useRef(null);
  useEffect(() => {
    if (paused) return undefined;
    timer.current = setTimeout(onDismiss, TTL);
    return () => clearTimeout(timer.current);
  }, [paused, onDismiss]);
  const isError = toast.kind === 'error';
  const Icon = isError ? AlertTriangle : CheckCircle2;
  return (
    <div
      role={isError ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      className="animate-rise pointer-events-auto flex max-w-[420px] items-center gap-3 rounded-lg border border-line-strong bg-s2 py-2.5 pl-3 pr-2 text-sm text-ink shadow-float"
    >
      <Icon size={18} strokeWidth={1.5} aria-hidden="true" className={isError ? 'text-danger' : 'text-live'} />
      <span className="min-w-0 flex-1">{toast.message}</span>
      {toast.action && (
        <button type="button" onClick={() => { toast.action.onClick(); onDismiss(); }} className="rounded-sm px-2 py-1 font-medium text-accent-text">{toast.action.label}</button>
      )}
      <button type="button" aria-label="Dismiss" onClick={onDismiss} className="hit-44 grid size-6 place-items-center rounded-sm text-ink-muted [@media(hover:hover)]:hover:bg-s3">
        <X size={14} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
