import { useMemo } from "react";
import { useAdminSectionPanel } from "../../../hooks/useAdminSectionPanel";
import { AdminErrorBanner } from "../shared/AdminErrorBanner";
import { AdminFilterBar } from "../shared/AdminFilterBar";
import { AdminLoadingSkeleton } from "../shared/AdminLoadingSkeleton";
import { AdminPageHeader } from "../shared/AdminPageHeader";
import { AdminSummaryStrip } from "../shared/AdminSummaryStrip";
import { AdminTimeline } from "../shared/AdminTimeline";
import { AdminEntityDrawer } from "../shared/AdminEntityDrawer";
import { AdminActionDialog } from "../shared/AdminActionDialog";
import { AdminChartCard } from "../shared/AdminChartCard";
import { AdminLineChart } from "../shared/AdminLineChart";
import type { TimeSeriesPoint } from "../../../lib/adminParse";

export function AdminAuditPanel() {
  const panel = useAdminSectionPanel("audit");

  const sorted = useMemo(
    () => [...panel.rows].reverse(),
    [panel.rows],
  );

  const filtered = useMemo(() => {
    const q = panel.search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((r) =>
      Object.values(r).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [sorted, panel.search]);

  const sparkline = useMemo((): TimeSeriesPoint[] => {
    const buckets = new Map<string, number>();
    for (const row of panel.rows) {
      const t = String(row.timestamp ?? row.created_at ?? "");
      if (!t) continue;
      const hour = t.slice(0, 13);
      buckets.set(hour, (buckets.get(hour) ?? 0) + 1);
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-24)
      .map(([x, y]) => ({ x: x.slice(11) + "h", y }));
  }, [panel.rows]);

  const kpis = useMemo(
    () => [
      { label: "Total events", value: panel.rows.length },
      {
        label: "Last 24h",
        value: sparkline.reduce((s, p) => s + p.y, 0),
      },
      {
        label: "Unique actors",
        value: new Set(panel.rows.map((r) => r.actor ?? r.user_id)).size,
      },
    ],
    [panel.rows, sparkline],
  );

  return (
    <div>
      <AdminPageHeader
        breadcrumb="Staff console / Audit"
        title="Audit log"
        subtitle="Complete staff and system activity trail. Newest events first."
      />

      <AdminSummaryStrip items={kpis} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="lg:col-span-2 cf-panel rounded-xl border border-white/10 p-4">
          <AdminFilterBar
            search={panel.search}
            onSearchChange={panel.setSearch}
            searchPlaceholder="Filter by actor, action, or resource…"
          />
          {panel.error ? (
            <AdminErrorBanner message={panel.error} onRetry={() => void panel.refetch()} />
          ) : panel.loading ? (
            <AdminLoadingSkeleton />
          ) : (
            <AdminTimeline
              rows={filtered.slice(0, 50)}
              onItemClick={panel.openDrawer}
            />
          )}
        </div>
        <AdminChartCard title="Activity" subtitle="Events per hour">
          <AdminLineChart data={sparkline} height={220} />
        </AdminChartCard>
      </div>

      <AdminEntityDrawer
        open={panel.drawerOpen}
        record={panel.selectedRow}
        detail={panel.detail}
        sectionId="audit"
        onClose={() => panel.setDrawerOpen(false)}
      />

      <AdminActionDialog
        open={Boolean(panel.pendingAction)}
        action={panel.pendingAction}
        row={panel.actionRow}
        onClose={panel.closeAction}
        onSuccess={() => void panel.refetch()}
      />
    </div>
  );
}
