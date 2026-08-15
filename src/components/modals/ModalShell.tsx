import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
};

export function ModalShell({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-300 flex items-center justify-center p-6 sm:p-8 bg-black/75 backdrop-blur-[2px]"
      style={{ position: "fixed" }}
      onClick={onClose}
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
            onClick={onClose}
            className="text-[11px] uppercase tracking-wide text-text-muted hover:text-white cursor-pointer shrink-0"
          >
            Close
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
    </div>,
    document.body,
  );
}
