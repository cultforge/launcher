import { useEffect } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  title: string;
  record: Record<string, unknown> | null;
  rawJson?: unknown;
  onClose: () => void;
};

export function AdminJsonDrawer({
  open,
  title,
  record,
  rawJson,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const display = rawJson ?? record;

  return createPortal(
    <div className="fixed inset-0 z-250 flex justify-end" role="presentation">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside className="relative w-full max-w-md h-full cf-panel border-l border-white/12 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/8 shrink-0">
          <h2 className="font-sora text-[14px] font-semibold text-text-primary truncate">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[10px] uppercase tracking-wide text-text-muted hover:text-white cursor-pointer"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scroll-hidden p-4">
          {record ? (
            <dl className="flex flex-col gap-2 mb-4">
              {Object.entries(record).map(([key, val]) => (
                <div key={key} className="rounded-lg bg-black/25 px-3 py-2">
                  <dt className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">
                    {key.replace(/_/g, " ")}
                  </dt>
                  <dd className="mt-0.5 text-[11px] text-text-primary break-all">
                    {typeof val === "object" && val !== null
                      ? JSON.stringify(val, null, 2)
                      : String(val ?? "—")}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          {display ? (
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                Raw JSON
              </div>
              <pre className="rounded-lg bg-black/40 border border-white/8 p-3 text-[10px] text-text-secondary overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(display, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
