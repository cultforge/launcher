import type { ReactNode } from "react";
import { cn } from "../../../lib/cn";
import type { ContentFilter } from "../../../data/buildContent";

type ContentListShellProps = {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters: ContentFilter[];
  filter: ContentFilter;
  onFilterChange: (filter: ContentFilter) => void;
  secondaryAction?: { label: string; onClick?: () => void };
  primaryAction?: { label: string; onClick?: () => void };
  note?: ReactNode;
  empty?: boolean;
  emptyLabel?: string;
  children: ReactNode;
};

export function ContentListShell({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  filters,
  filter,
  onFilterChange,
  secondaryAction,
  primaryAction,
  note,
  empty,
  emptyLabel = "Nothing matches this filter",
  children,
}: ContentListShellProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full sm:max-w-xs px-3 py-2 rounded-lg text-[12px] bg-black/30 border border-white/10 text-text-primary placeholder:text-text-disabled outline-none focus:border-primary-base/40"
        />
        <div className="flex items-center gap-2 shrink-0">
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="px-3 py-2 text-[11px] font-semibold rounded-lg border border-white/10 text-text-secondary hover:text-text-primary hover:bg-white/4 cursor-pointer"
            >
              {secondaryAction.label}
            </button>
          )}
          {primaryAction && (
            <button
              type="button"
              onClick={primaryAction.onClick}
              className="cf-btn-primary px-3.5 py-2 rounded-lg text-[11px] cursor-pointer"
            >
              {primaryAction.label}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {filters.map((f) => {
          const active = filter === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => onFilterChange(f)}
              className={cn(
                "px-2.5 py-1 text-[11px] font-semibold rounded-lg border cursor-pointer transition-colors",
                active
                  ? "border-primary-base/40 bg-primary-base/12 text-primary-base"
                  : "border-white/8 text-text-muted hover:text-text-primary hover:bg-white/3",
              )}
            >
              {f}
            </button>
          );
        })}
      </div>

      {note}

      {empty ? (
        <div className="cf-panel rounded-xl flex items-center justify-center min-h-45 text-[13px] text-text-muted">
          {emptyLabel}
        </div>
      ) : (
        <div className="cf-panel rounded-xl p-1.5 flex flex-col gap-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

export function EnableToggle({
  enabled,
  onChange,
  label = "Enabled",
}: {
  enabled: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={() => onChange(!enabled)}
      className={cn(
        "relative h-5 w-9 rounded-full border transition-colors cursor-pointer shrink-0",
        enabled
          ? "bg-primary-base/30 border-primary-base/50"
          : "bg-white/6 border-white/12",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all",
          enabled
            ? "left-4.5 bg-primary-base"
            : "left-0.5 bg-text-muted",
        )}
      />
    </button>
  );
}
