import { useMemo, useState } from "react";
import { Chip } from "@heroui/react";
import {
  formatCellValue,
  inferColumns,
} from "../../../lib/adminParse";
import { AdminEmptyState } from "./AdminEmptyState";

const PAGE_SIZE = 20;

type Props = {
  rows: Record<string, unknown>[];
  columns?: string[];
  onRowClick?: (row: Record<string, unknown>) => void;
  highlightColumn?: string;
  highlightValue?: string;
  searchKeys?: string[];
};

export function AdminDataTable({
  rows,
  columns: columnsProp,
  onRowClick,
  highlightColumn,
  highlightValue,
  searchKeys,
}: Props) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const columns = columnsProp ?? inferColumns(rows);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    const keys = searchKeys ?? columns;
    return rows.filter((row) =>
      keys.some((key) =>
        formatCellValue(row[key]).toLowerCase().includes(q),
      ),
    );
  }, [rows, search, searchKeys, columns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = formatCellValue(a[sortKey]);
      const bv = formatCellValue(b[sortKey]);
      const cmp = av.localeCompare(bv, undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  if (!rows.length) {
    return <AdminEmptyState title="No records" description="This endpoint returned an empty list." />;
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(0);
        }}
        placeholder="Search records…"
        className="w-full sm:max-w-xs px-3 py-2 rounded-lg text-[12px] bg-black/30 border border-white/10 text-text-primary placeholder:text-text-disabled outline-none focus:border-primary-base/40"
      />

      <div className="rounded-xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[11px]">
            <thead>
              <tr className="border-b border-white/8 bg-black/30">
                {columns.map((col) => (
                  <th
                    key={col}
                    className="px-3 py-2.5 font-semibold uppercase tracking-wider text-[9px] text-text-muted cursor-pointer select-none hover:text-text-secondary"
                    onClick={() => toggleSort(col)}
                  >
                    {col.replace(/_/g, " ")}
                    {sortKey === col ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, i) => (
                <tr
                  key={i}
                  onClick={() => onRowClick?.(row)}
                  className={`border-b border-white/5 ${
                    onRowClick
                      ? "cursor-pointer hover:bg-white/4 transition-colors"
                      : ""
                  }`}
                >
                  {columns.map((col) => {
                    const val = row[col];
                    const isHighlight =
                      highlightColumn === col &&
                      highlightValue &&
                      String(val).toLowerCase() === highlightValue.toLowerCase();

                    return (
                      <td key={col} className="px-3 py-2.5 text-text-secondary">
                        {isHighlight ? (
                          <Chip size="sm" variant="soft" color="success">
                            <Chip.Label className="text-[9px]">
                              {formatCellValue(val)}
                            </Chip.Label>
                          </Chip>
                        ) : col === "status" && typeof val === "string" ? (
                          <Chip
                            size="sm"
                            variant="soft"
                            color={
                              val === "active" || val === "online"
                                ? "success"
                                : val === "pending"
                                  ? "warning"
                                  : "default"
                            }
                          >
                            <Chip.Label className="text-[9px]">{val}</Chip.Label>
                          </Chip>
                        ) : (
                          formatCellValue(val)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-[10px] text-text-muted">
          <span>
            {sorted.length} record{sorted.length !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="px-2 py-1 rounded border border-white/10 disabled:opacity-40 cursor-pointer"
            >
              Prev
            </button>
            <span>
              {page + 1} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="px-2 py-1 rounded border border-white/10 disabled:opacity-40 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
