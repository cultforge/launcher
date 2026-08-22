import { useEffect, useState, type ReactNode } from "react";
import { cn } from "../../../lib/cn";

export function OpsStatusPill({
  state,
  label,
}: {
  state: "ok" | "warn" | "err" | "muted";
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        state === "ok" && "bg-primary-base/15 text-primary-base",
        state === "warn" && "bg-state-warning/15 text-state-warning",
        state === "err" && "bg-state-error/15 text-state-error",
        state === "muted" && "bg-white/8 text-text-muted",
      )}
    >
      {label}
    </span>
  );
}

export function OpsEmpty({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 px-4 py-10 text-center">
      <p className="text-[13px] font-medium text-text-secondary">{title}</p>
      {hint ? (
        <p className="mt-1 text-[11px] text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function OpsError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-lg border border-state-error/30 bg-state-error/8 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
      <p className="text-[12px] text-state-error">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="text-[11px] font-semibold text-state-error underline cursor-pointer"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function OpsPageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-sora text-[16px] font-bold text-text-primary tracking-tight">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-0.5 text-[12px] text-text-muted max-w-2xl leading-snug">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export function OpsToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">{children}</div>
  );
}

export function OpsInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-8 rounded-md border border-white/12 bg-black/35 px-2.5 text-[12px] text-text-primary outline-none placeholder:text-text-disabled focus:border-primary-base/40",
        props.className,
      )}
    />
  );
}

export function OpsSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-8 rounded-md border border-white/12 bg-black/35 px-2 text-[12px] text-text-primary outline-none focus:border-primary-base/40",
        props.className,
      )}
    />
  );
}

export function OpsTextarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea
      {...props}
      className={cn(
        "rounded-md border border-white/12 bg-black/35 px-2.5 py-2 text-[12px] text-text-primary outline-none placeholder:text-text-disabled focus:border-primary-base/40 resize-y min-h-[72px]",
        props.className,
      )}
    />
  );
}

export function OpsButton({
  variant = "ghost",
  children,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
}) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        "h-8 rounded-md px-3 text-[11px] font-semibold cursor-pointer disabled:opacity-40",
        variant === "primary" && "cf-btn-primary",
        variant === "ghost" &&
          "border border-white/12 text-text-secondary hover:bg-white/4 hover:text-text-primary",
        variant === "danger" &&
          "border border-state-error/40 text-state-error hover:bg-state-error/10",
        className,
      )}
    >
      {children}
    </button>
  );
}

export type OpsColumn<T> = {
  key: string;
  header: string;
  className?: string;
  render: (row: T) => ReactNode;
};

export function OpsTable<T extends { id?: string }>({
  columns,
  rows,
  onRowClick,
  empty,
}: {
  columns: OpsColumn<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  empty?: string;
}) {
  if (!rows.length) {
    return <OpsEmpty title={empty ?? "No rows"} />;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr className="border-b border-white/10 bg-white/3">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-text-disabled",
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={String(row.id ?? i)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "border-b border-white/6 last:border-0",
                onRowClick && "cursor-pointer hover:bg-white/4",
              )}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "px-3 py-2 text-[12px] text-text-secondary align-middle",
                    c.className,
                  )}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OpsConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  confirmText,
  danger,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  /** If set, user must type this exact string. */
  confirmText?: string;
  danger?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (open) setTyped("");
  }, [open]);
  if (!open) return null;
  const ok = !confirmText || typed === confirmText;
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-xl border border-white/12 bg-bg-card p-5 shadow-2xl">
        <h3 className="font-sora text-[15px] font-bold text-text-primary">
          {title}
        </h3>
        <p className="mt-2 text-[12px] text-text-muted leading-relaxed">{body}</p>
        {confirmText ? (
          <div className="mt-3">
            <p className="mb-1 text-[10px] text-text-disabled">
              Type <span className="font-mono text-text-secondary">{confirmText}</span>{" "}
              to confirm
            </p>
            <OpsInput
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full font-mono"
              autoFocus
            />
          </div>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <OpsButton onClick={onCancel} disabled={busy}>
            Cancel
          </OpsButton>
          <OpsButton
            variant={danger ? "danger" : "primary"}
            disabled={!ok || busy}
            onClick={onConfirm}
          >
            {busy ? "Working…" : confirmLabel}
          </OpsButton>
        </div>
      </div>
    </div>
  );
}

export function OpsDrawer({
  open,
  title,
  onClose,
  children,
  widthClass = "max-w-lg",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  widthClass?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[480] flex justify-end bg-black/50">
      <button
        type="button"
        className="flex-1 cursor-default"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <aside
        className={cn(
          "h-full w-full border-l border-white/10 bg-bg-app p-4 overflow-y-auto scroll-hidden",
          widthClass,
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="font-sora text-[14px] font-bold text-text-primary">
            {title}
          </h3>
          <OpsButton onClick={onClose}>Close</OpsButton>
        </div>
        {children}
      </aside>
    </div>
  );
}

export function OpsStatGrid({
  items,
}: {
  items: { label: string; value: string | number }[];
}) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-white/10 bg-black/25 px-3 py-2.5"
        >
          <div className="text-[9px] uppercase tracking-wider text-text-disabled">
            {item.label}
          </div>
          <div className="mt-0.5 font-sora text-[18px] font-bold tabular-nums text-text-primary">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
