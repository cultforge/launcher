import { formatDate, formatRelativeTime } from "../../../lib/adminFormatters";
import { AdminStatusBadge, rowStatusFromRow } from "./AdminStatusBadge";

type Props = {
  rows: Record<string, unknown>[];
  onItemClick?: (row: Record<string, unknown>) => void;
};

export function AdminTimeline({ rows, onItemClick }: Props) {
  if (!rows.length) {
    return (
      <p className="text-[12px] text-text-muted py-6 text-center">
        No activity recorded yet.
      </p>
    );
  }

  return (
    <div className="relative flex flex-col gap-0">
      <div className="absolute left-[11px] top-2 bottom-2 w-px bg-white/10" />
      {rows.map((row, i) => {
        const time = row.timestamp ?? row.created_at;
        const actor = row.actor ?? row.username ?? row.admin_id ?? "System";
        const action = row.action ?? row.event ?? row.type ?? "Event";
        const summary =
          row.summary ?? row.message ?? row.details ?? row.resource ?? "";

        return (
          <button
            key={i}
            type="button"
            onClick={() => onItemClick?.(row)}
            className="relative flex gap-4 py-3 pl-8 text-left w-full cursor-pointer hover:bg-white/3 rounded-lg transition-colors"
          >
            <div className="absolute left-2 top-4 h-2 w-2 rounded-full bg-primary-base ring-4 ring-black/40" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-medium text-text-primary">
                  {String(action)}
                </span>
                <AdminStatusBadge
                  status={rowStatusFromRow(row)}
                  label={String(row.status ?? "")}
                />
              </div>
              <div className="mt-0.5 text-[10px] text-text-muted">
                {String(actor)} · {formatRelativeTime(time)}
              </div>
              {summary ? (
                <p className="mt-1 text-[11px] text-text-secondary line-clamp-2">
                  {String(summary)}
                </p>
              ) : null}
              <div className="mt-0.5 text-[9px] text-text-disabled">
                {formatDate(time)}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
