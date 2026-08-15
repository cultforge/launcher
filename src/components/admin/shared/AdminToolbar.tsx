import type { ReactNode } from "react";
import type { AdminCatalogEntry } from "../../../lib/adminApi";
import { useAdminSessionStore } from "../../../stores/adminSession";

type Props = {
  title: string;
  description?: string;
  search?: string;
  onSearchChange?: (value: string) => void;
  filters?: ReactNode;
  mutates?: AdminCatalogEntry[];
  onMutateClick?: (entry: AdminCatalogEntry) => void;
  actions?: ReactNode;
};

export function AdminToolbar({
  title,
  description,
  search,
  onSearchChange,
  filters,
  mutates,
  onMutateClick,
  actions,
}: Props) {
  const capabilityActive = useAdminSessionStore((s) => s.capabilityActive);

  return (
    <div className="flex flex-col gap-3 mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-sora text-[15px] font-bold text-text-primary">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-[11px] text-text-muted max-w-2xl">
              {description}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {mutates?.map((entry) => (
            <button
              key={`${entry.method}:${entry.path}`}
              type="button"
              disabled={!capabilityActive}
              title={
                capabilityActive
                  ? entry.path
                  : "Step up to unlock mutating commands"
              }
              onClick={() => onMutateClick?.(entry)}
              className="cf-btn-primary rounded-lg px-3 py-1.5 text-[10px] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {entry.method} {entry.path.split("/").pop()}
            </button>
          ))}
        </div>
      </div>

      {(onSearchChange || filters) && (
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          {onSearchChange ? (
            <input
              type="search"
              value={search ?? ""}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filter…"
              className="w-full sm:max-w-xs px-3 py-2 rounded-lg text-[12px] bg-black/30 border border-white/10 text-text-primary placeholder:text-text-disabled outline-none focus:border-primary-base/40"
            />
          ) : null}
          {filters}
        </div>
      )}
    </div>
  );
}
