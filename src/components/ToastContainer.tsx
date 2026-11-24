import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useLedger } from '../contexts/LedgerContext';

export function ToastContainer() {
  const { toasts, dismissToast } = useLedger();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2.5 w-[calc(100vw-2rem)] max-w-sm no-print"
    >
      {toasts.map((toast) => {
        const icon =
          toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : toast.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          ) : (
            <Info className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
          );

        const borderClass =
          toast.type === 'success'
            ? 'border-emerald-500/30'
            : toast.type === 'error'
            ? 'border-rose-500/35'
            : 'border-[#D4AF37]/30';

        return (
          <div
            key={toast.id}
            role="status"
            className={`bg-[#0D1424] border ${borderClass} rounded-lg px-4 py-3 shadow-xl flex items-start gap-3 transition-all duration-150`}
          >
            {icon}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-100">{toast.title}</p>
              {toast.detail && (
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  {toast.detail}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
              className="text-slate-500 hover:text-slate-200 p-0.5 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
