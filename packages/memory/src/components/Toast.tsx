import { useState, useCallback, createContext, useContext } from "react";

type ToastType = "success" | "error" | "info" | "warning";
interface Toast { id: number; type: ToastType; title: string; message?: string; leaving?: boolean; }

let _nextId = 0;
let _addToast: ((type: ToastType, title: string, message?: string) => void) | null = null;

export const toast = {
  success: (title: string, msg?: string) => _addToast?.("success", title, msg),
  error: (title: string, msg?: string) => _addToast?.("error", title, msg),
  info: (title: string, msg?: string) => _addToast?.("info", title, msg),
  warning: (title: string, msg?: string) => _addToast?.("warning", title, msg),
};

const ICONS: Record<ToastType, string> = { success: "✓", error: "✕", info: "ℹ", warning: "⚠" };

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, leaving: true } : t));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 200);
  }, []);

  _addToast = useCallback((type: ToastType, title: string, message?: string) => {
    const id = ++_nextId;
    setToasts(prev => [...prev.slice(-4), { id, type, title, message }]);
    setTimeout(() => remove(id), 4000);
  }, [remove]);

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}${t.leaving ? " leaving" : ""}`}>
          <span className="toast-icon">{ICONS[t.type]}</span>
          <div className="toast-body">
            <div className="toast-title">{t.title}</div>
            {t.message && <div className="toast-msg">{t.message}</div>}
          </div>
          <button className="toast-close" onClick={() => remove(t.id)}>×</button>
        </div>
      ))}
    </div>
  );
}
