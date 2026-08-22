import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** When true (default), backdrop clicks do not dismiss. */
  closeOnOutside?: boolean;
  /**
   * When true, Close / Escape asks for confirmation first.
   * Pass a function to only confirm when the form is dirty.
   */
  confirmClose?: boolean | (() => boolean);
  confirmCloseMessage?: string;
};

export function ModalShell({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
  closeOnOutside = false,
  confirmClose = false,
  confirmCloseMessage = "Discard unsaved changes and close this dialog?",
}: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const requestClose = () => {
    const needsConfirm =
      typeof confirmClose === "function" ? confirmClose() : confirmClose;
    if (needsConfirm) {
      setConfirmOpen(true);
      return;
    }
    onClose();
  };

  useEffect(() => {
    if (!open) {
      setConfirmOpen(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (confirmOpen) {
          setConfirmOpen(false);
          return;
        }
        requestClose();
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestClose closes over latest confirmClose
  }, [open, confirmOpen, confirmClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-300 flex items-center justify-center p-6 sm:p-8 bg-black/75 backdrop-blur-[2px]"
      style={{ position: "fixed" }}
      onClick={closeOnOutside ? requestClose : undefined}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cf-modal-title"
        onClick={(e) => e.stopPropagation()}
        className={
          wide
            ? "relative w-full max-w-3xl cf-panel rounded-2xl border border-white/12 overflow-hidden flex flex-col max-h-[min(90vh,760px)]"
            : "relative w-full max-w-md cf-panel rounded-2xl border border-white/12 overflow-hidden flex flex-col max-h-[min(85vh,560px)]"
        }
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/8 shrink-0">
          <h2
            id="cf-modal-title"
            className="font-sora text-[16px] font-semibold text-text-primary truncate"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close dialog"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-[16px] leading-none text-text-muted hover:text-white hover:bg-white/6 cursor-pointer shrink-0"
          >
            ×
          </button>
        </div>
        <div className="px-5 py-5 overflow-y-auto scroll-hidden flex-1 min-h-0">
          {children}
        </div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-white/8 shrink-0">
            {footer}
          </div>
        )}
      </div>

      {confirmOpen ? (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/55 p-6"
          role="presentation"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cf-modal-confirm-title"
            className="w-full max-w-sm rounded-2xl border border-white/12 bg-bg-elevated p-5 shadow-xl"
          >
            <h3
              id="cf-modal-confirm-title"
              className="font-sora text-[15px] font-semibold text-text-primary"
            >
              Close dialog?
            </h3>
            <p className="mt-2 text-[12px] text-text-secondary leading-relaxed">
              {confirmCloseMessage}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-white/10 px-3 py-2 text-[11px] font-semibold text-text-secondary hover:text-text-primary cursor-pointer"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  onClose();
                }}
                className="rounded-lg border border-state-error/40 bg-state-error/15 px-3 py-2 text-[11px] font-semibold text-state-error cursor-pointer"
              >
                Close anyway
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
