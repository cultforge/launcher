import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
import type { AdminAction } from "../../../lib/adminActionRegistry";
import { useAdminSessionStore } from "../../../stores/adminSession";

type Props = {
  actions: AdminAction[];
  onAction: (action: AdminAction) => void;
};

/** Inline buttons when few actions; kebab only when the list would crowd the row. */
export function AdminRowActions({ actions, onAction }: Props) {
  const capabilityActive = useAdminSessionStore((s) => s.capabilityActive);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!actions.length) return null;

  const useInline = actions.length <= 2;

  if (useInline) {
    return (
      <div
        className="flex flex-wrap items-center justify-end gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={!capabilityActive}
            title={
              capabilityActive
                ? action.description
                : "Step up to unlock admin actions"
            }
            onClick={() => onAction(action)}
            className={`rounded-lg border px-2.5 py-1 text-[10px] font-semibold cursor-pointer disabled:opacity-40 ${
              action.severity === "danger"
                ? "border-state-error/35 text-state-error hover:bg-state-error/10"
                : action.severity === "warning"
                  ? "border-state-warning/35 text-state-warning hover:bg-state-warning/10"
                  : "border-white/12 text-text-secondary hover:bg-white/6"
            }`}
          >
            {action.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 items-center gap-1 rounded-lg border border-white/10 px-2 text-[10px] font-semibold text-text-muted hover:bg-white/6 hover:text-text-primary cursor-pointer"
        aria-label="More actions"
      >
        Actions
        <MoreVertical size={12} />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-xl border border-white/12 bg-[#0a0f0c] py-1 shadow-xl">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={!capabilityActive}
              title={
                capabilityActive
                  ? action.description
                  : "Step up to unlock admin actions"
              }
              onClick={() => {
                setOpen(false);
                onAction(action);
              }}
              className={`w-full px-3 py-2 text-left text-[11px] cursor-pointer disabled:opacity-40 ${
                action.severity === "danger"
                  ? "text-state-error hover:bg-state-error/10"
                  : action.severity === "warning"
                    ? "text-state-warning hover:bg-state-warning/10"
                    : "text-text-secondary hover:bg-white/6"
              }`}
            >
              <div className="font-medium">{action.label}</div>
              {action.description ? (
                <div className="mt-0.5 text-[9px] text-text-muted line-clamp-2">
                  {action.description}
                </div>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
