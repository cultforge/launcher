type Props = {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  filters?: { id: string; label: string }[];
  activeFilter?: string;
  onFilterChange?: (id: string) => void;
};

export function AdminFilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  filters,
  activeFilter = "all",
  onFilterChange,
}: Props) {
  return (
    <div className="mb-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
      <input
        type="search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={searchPlaceholder}
        className="w-full sm:max-w-sm px-3 py-2 rounded-lg text-[12px] bg-black/30 border border-white/10 text-text-primary placeholder:text-text-disabled outline-none focus:border-primary-base/40"
      />
      {filters && filters.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onFilterChange?.(f.id)}
              className={`rounded-full px-3 py-1 text-[10px] font-medium cursor-pointer transition-colors ${
                activeFilter === f.id
                  ? "bg-primary-base/14 text-primary-base border border-primary-base/25"
                  : "text-text-muted border border-white/8 hover:bg-white/4 hover:text-text-secondary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
