import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ColumnDef } from "../../../lib/adminColumnRegistry";
import {
  formatDate,
  formatRelativeTime,
  truncateId,
  userDisplayName,
  userInitials,
} from "../../../lib/adminColumnRegistry";
import type { AdminAction } from "../../../lib/adminActionRegistry";
import { resolveActionsForRow } from "../../../lib/adminActionRegistry";
import {
  AdminStatusBadge,
  rowStatusFromRow,
  userStatusFromRow,
} from "./AdminStatusBadge";
import { AdminRowActions } from "./AdminRowActions";
import { AdminEmptyState } from "./AdminEmptyState";

const PAGE_SIZE = 20;

type Props = {
  rows: Record<string, unknown>[];
  columns: ColumnDef[];
  sectionId?: string;
  actions?: AdminAction[];
  onRowClick?: (row: Record<string, unknown>) => void;
  onAction?: (action: AdminAction, row: Record<string, unknown>) => void;
  emptyTitle?: string;
};

function renderCell(
  col: ColumnDef,
  row: Record<string, unknown>,
  sectionId?: string,
): ReactNode {
  if (col.id === "identity" && sectionId === "users") {
    const name = userDisplayName(row);
    const initials = userInitials(row);
    return (
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-base/15 text-[10px] font-bold text-primary-base">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[12px] font-medium text-text-primary">
            {name}
          </div>
          <div className="truncate text-[10px] text-text-muted font-mono">
            {truncateId(row.id ?? row.user_id)}
          </div>
        </div>
      </div>
    );
  }

  if (col.id === "status") {
    const kind =
      sectionId === "users" ? userStatusFromRow(row) : rowStatusFromRow(row);
    return <AdminStatusBadge status={kind} />;
  }

  if (col.id === "created_at" || col.id === "timestamp" || col.id === "sent_at" || col.id === "published_at" || col.id === "last_seen" || col.id === "expires_at") {
    const val = row[col.id] ?? row.created_at ?? row.timestamp;
    return (
      <span title={formatDate(val)}>
        {formatRelativeTime(val)}
      </span>
    );
  }

  if (col.render) return col.render(row);

  // Prefer explicit sortValue keys, then the column id itself (inferred columns).
  const keys = col.sortValue ? [col.id] : [col.id];
  for (const key of keys) {
    const v = row[key];
    if (v !== null && v !== undefined && v !== "") {
      if (typeof v === "boolean") return v ? "Yes" : "No";
      return String(v);
    }
  }

  return "—";
}

export function AdminRecordTable({
  rows,
  columns,
  sectionId,
  actions = [],
  onRowClick,
  onAction,
  emptyTitle = "No records found",
}: Props) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.id === sortKey);
    if (!col) return rows;
    return [...rows].sort((a, b) => {
      const av = col.sortValue ? col.sortValue(a) : String(a[sortKey] ?? "");
      const bv = col.sortValue ? col.sortValue(b) : String(b[sortKey] ?? "");
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const hasActions = actions.length > 0;

  if (!rows.length) {
    return <AdminEmptyState title={emptyTitle} />;
  }

  const toggleSort = (col: ColumnDef) => {
    if (!col.sortable) return;
    if (sortKey === col.id) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.id);
      setSortDir("desc");
    }
  };

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden bg-black/15">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="border-b border-white/8 bg-black/30">
              {columns.map((col) => (
                <th
                  key={col.id}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={() => toggleSort(col)}
                  className={`px-4 py-3 text-[9px] font-semibold uppercase tracking-wider text-text-muted ${
                    col.sortable ? "cursor-pointer select-none hover:text-text-secondary" : ""
                  }`}
                >
                  {col.label}
                  {sortKey === col.id ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                </th>
              ))}
              {hasActions ? (
                <th className="px-4 py-3 w-12 text-[9px] font-semibold uppercase tracking-wider text-text-muted">
                  Actions
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => {
              const rowActions = resolveActionsForRow(actions, row);
              return (
                <tr
                  key={i}
                  onClick={() => onRowClick?.(row)}
                  className={`border-b border-white/5 transition-colors ${
                    onRowClick ? "cursor-pointer hover:bg-white/4" : ""
                  }`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.id}
                      className="px-4 py-3 text-[11px] text-text-secondary"
                    >
                      {renderCell(col, row, sectionId)}
                    </td>
                  ))}
                  {hasActions ? (
                    <td className="px-4 py-3">
                      <AdminRowActions
                        actions={rowActions}
                        onAction={(a) => onAction?.(a, row)}
                      />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between border-t border-white/8 px-4 py-2.5 text-[10px] text-text-muted">
          <span>{sorted.length} records</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="rounded border border-white/10 px-2 py-0.5 disabled:opacity-40 cursor-pointer"
            >
              Prev
            </button>
            <span>{page + 1} / {totalPages}</span>
            <button
              type="button"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-white/10 px-2 py-0.5 disabled:opacity-40 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
