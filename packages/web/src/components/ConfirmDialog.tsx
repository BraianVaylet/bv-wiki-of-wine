import { useEffect } from 'react';
import { Button } from './ui';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmación para acciones destructivas. Cierra con Escape. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  loading,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex touch-none items-center justify-center overscroll-contain bg-black/50 p-4">
      {/* <dialog open> da la semántica de modal sin showModal() imperativo. */}
      <dialog
        open
        aria-labelledby="confirm-title"
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 text-fg"
      >
        <h2 id="confirm-title" className="font-semibold text-fg text-lg">
          {title}
        </h2>
        <p className="mt-1 text-muted text-sm">{message}</p>
        <div className="mt-4 flex gap-2">
          <Button variant="danger" className="flex-1" loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </dialog>
    </div>
  );
}
