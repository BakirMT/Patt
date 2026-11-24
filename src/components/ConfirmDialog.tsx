import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-[2px] flex items-center justify-center p-4 no-print"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-md bg-[#0D1424] border border-slate-800 rounded-xl p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`p-2 rounded-lg shrink-0 ${
                variant === 'danger'
                  ? 'bg-rose-500/10 text-rose-400'
                  : 'bg-amber-500/10 text-amber-400'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="confirm-dialog-title"
                className="text-base font-semibold text-slate-100"
              >
                {title}
              </h2>
              <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
                {description}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            aria-label="Close dialog"
            className="text-slate-500 hover:text-slate-200 p-1 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-800/80">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 ${
              variant === 'danger'
                ? 'bg-rose-600 text-white hover:bg-rose-500'
                : 'bg-[#D4AF37] text-[#070B14] hover:bg-[#E5C55C]'
            }`}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
