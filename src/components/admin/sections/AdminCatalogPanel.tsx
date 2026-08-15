import { useMemo, useState } from "react";
import { useAdminSessionStore } from "../../../stores/adminSession";
import { AdminPageHeader } from "../shared/AdminPageHeader";
import { AdminFilterBar } from "../shared/AdminFilterBar";
import { AdminSummaryStrip } from "../shared/AdminSummaryStrip";

/**
 * Browse the staff command map returned by GET /v1/admin/catalog.
 * This is NOT a CRUD table of game/content catalog records.
 */
export function AdminCatalogPanel() {
  const catalog = useAdminSessionStore((s) => s.catalog) ?? [];
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(() => {
    let list = catalog;
    if (filter === "reads") list = list.filter((e) => !e.mutate);
    if (filter === "mutates") list = list.filter((e) => e.mutate);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          e.path.toLowerCase().includes(q) ||
          e.method.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => a.path.localeCompare(b.path));
  }, [catalog, search, filter]);

  const kpis = [
    { label: "Total commands", value: catalog.length },
    {
      label: "Reads",
      value: catalog.filter((e) => !e.mutate).length,
      accent: "success" as const,
    },
    {
      label: "Mutates",
      value: catalog.filter((e) => e.mutate).length,
      accent: "warning" as const,
    },
  ];

  return (
    <div>
      <AdminPageHeader
        breadcrumb="Staff console / Catalog"
        title="Staff API catalog"
        subtitle="Every admin HTTP command this launcher can bind to. This is the platform staff API map — not builds, mods, or store content. Use API Explorer for unmatched leftover routes."
      />

      <AdminSummaryStrip items={kpis} />

      <AdminFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Filter by method or path…"
        filters={[
          { id: "all", label: "All" },
          { id: "reads", label: "Reads" },
          { id: "mutates", label: "Mutates" },
        ]}
        activeFilter={filter}
        onFilterChange={setFilter}
      />

      {!catalog.length ? (
        <div className="cf-panel rounded-xl border border-white/10 p-8 text-center text-[13px] text-text-muted">
          No catalog loaded. Step up / refresh data from the top bar.
        </div>
      ) : (
        <div className="cf-panel overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-left">
            <thead className="border-b border-white/8 text-[8px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-3 py-2.5 font-medium w-20">Method</th>
                <th className="px-3 py-2.5 font-medium w-24">Kind</th>
                <th className="px-3 py-2.5 font-medium">Path</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr
                  key={`${entry.method}:${entry.path}`}
                  className="border-b border-white/5 last:border-0"
                >
                  <td className="px-3 py-2 font-mono text-[11px] text-primary-base">
                    {entry.method}
                  </td>
                  <td className="px-3 py-2 text-[10px]">
                    <span
                      className={
                        entry.mutate
                          ? "rounded-md border border-state-warning/30 bg-state-warning/10 px-1.5 py-0.5 text-state-warning"
                          : "rounded-md border border-white/10 bg-white/4 px-1.5 py-0.5 text-text-muted"
                      }
                    >
                      {entry.mutate ? "Mutate" : "Read"}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-text-secondary break-all">
                    {entry.path}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length ? (
            <p className="px-4 py-6 text-center text-[12px] text-text-muted">
              No commands match this filter.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
