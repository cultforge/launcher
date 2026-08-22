import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../ico";
import { AppIcons } from "../icons";

type Props = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** When false, body fills viewport and does not scroll (editor supplies internal scroll). */
  bodyScroll?: boolean;
  confirmClose?: boolean | (() => boolean);
  confirmCloseMessage?: string;
};

export function FullScreenShell({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  bodyScroll = true,
  confirmClose = true,
  confirmCloseMessage = "Discard unsaved changes and close?",
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, confirmOpen, confirmClose]);

  if (!open) return null;

  return createPortal(
    <div className="cf-fullscreen fixed inset-0 z-300 flex flex-col bg-bg-app">
      <header className="cf-fullscreen-header shrink-0">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-sora text-[20px] font-bold text-text-primary">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 max-w-2xl text-[13px] text-text-muted">
              {subtitle}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close"
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-white/10 text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary"
        >
          <Icon icon={AppIcons.Close} size={18} />
        </button>
      </header>

      <main
        className={
          bodyScroll
            ? "cf-fullscreen-body min-h-0 flex-1 overflow-y-auto scroll-hidden"
            : "cf-fullscreen-body flex min-h-0 flex-1 flex-col overflow-hidden"
        }
      >
        <div
          className={
            bodyScroll
              ? "mx-auto w-full max-w-5xl px-6 py-6 pb-10"
              : "mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col px-6 py-5"
          }
        >
          {children}
        </div>
      </main>

      {footer ? (
        <footer className="cf-fullscreen-footer shrink-0 border-t border-white/8 bg-bg-app/95 px-6 py-4 backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
            {footer}
          </div>
        </footer>
      ) : null}

      {confirmOpen ? (
        <div className="fixed inset-0 z-310 flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-sm rounded-xl border border-white/10 bg-bg-card p-5 shadow-xl">
            <p className="text-[14px] text-text-secondary">{confirmCloseMessage}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="cursor-pointer rounded-lg border border-white/10 px-3 py-2 text-[12px] text-text-secondary hover:bg-white/4"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  onClose();
                }}
                className="cursor-pointer rounded-lg border border-state-error/30 px-3 py-2 text-[12px] text-state-error hover:bg-state-error/10"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
