import { useMemo, useState } from "react";
import { formatBool } from "../../../lib/adminFormatters";
import { useAdminSectionPanel } from "../../../hooks/useAdminSectionPanel";
import { AdminActionDialog } from "../shared/AdminActionDialog";
import { AdminEntityDrawer } from "../shared/AdminEntityDrawer";
import { AdminErrorBanner } from "../shared/AdminErrorBanner";
import { AdminFilterBar } from "../shared/AdminFilterBar";
import { AdminLoadingSkeleton } from "../shared/AdminLoadingSkeleton";
import { AdminPageHeader } from "../shared/AdminPageHeader";
import { AdminRecordTable } from "../shared/AdminRecordTable";
import { AdminSummaryStrip } from "../shared/AdminSummaryStrip";
import { AdminGlobalActions } from "../shared/AdminGlobalActions";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "banned", label: "Banned" },
  { id: "staff", label: "Staff" },
];

export function AdminUsersPanel() {
  const panel = useAdminSectionPanel("users");
  const [drawerRefresh, setDrawerRefresh] = useState(0);

  const filtered = useMemo(() => {
    let list = panel.rows;
    const q = panel.search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        ["username", "display_name", "email", "id"].some((k) =>
          String(r[k] ?? "").toLowerCase().includes(q),
        ),
      );
    }
    if (panel.filter === "active") {
      list = list.filter((r) => !formatBool(r.is_banned) && formatBool(r.is_active));
    } else if (panel.filter === "banned") {
      list = list.filter((r) => formatBool(r.is_banned));
    } else if (panel.filter === "staff") {
      list = list.filter((r) => {
        const rank = String(r.ext_rank ?? r.role ?? "").toLowerCase();
        return rank.includes("admin") || rank.includes("staff");
      });
    }
    return list;
  }, [panel.rows, panel.search, panel.filter]);

  const kpis = useMemo(() => {
    const total = panel.rows.length;
    const banned = panel.rows.filter((r) => formatBool(r.is_banned)).length;
    const active = panel.rows.filter(
      (r) => !formatBool(r.is_banned) && (formatBool(r.is_active) || r.is_active === undefined),
    ).length;
    const staff = panel.rows.filter((r) => {
      const rank = String(r.ext_rank ?? r.role ?? "").toLowerCase();
      return rank.includes("admin") || rank.includes("staff");
    }).length;
    return [
      { label: "Total users", value: total },
      { label: "Active", value: active, accent: "success" as const },
      { label: "Banned", value: banned, accent: banned > 0 ? "danger" as const : "default" as const },
      { label: "Staff", value: staff },
    ];
  }, [panel.rows]);

  return (
    <div>
      <AdminPageHeader
        breadcrumb="Staff console / Users"
        title="User management"
        subtitle="Search accounts, review status, and take moderation actions. Actions apply immediately and are logged to audit."
        actions={
          <AdminGlobalActions
            actions={panel.globalActions}
            onAction={panel.openGlobalAction}
          />
        }
      />

      <AdminSummaryStrip items={kpis} />

      <AdminFilterBar
        search={panel.search}
        onSearchChange={panel.setSearch}
        searchPlaceholder="Search by username, email, or ID…"
        filters={FILTERS}
        activeFilter={panel.filter}
        onFilterChange={panel.setFilter}
      />

      {panel.error ? (
        <AdminErrorBanner message={panel.error} onRetry={() => void panel.refetch()} />
      ) : panel.loading ? (
        <AdminLoadingSkeleton />
      ) : (
        <AdminRecordTable
          rows={filtered}
          columns={panel.columns}
          sectionId="users"
          actions={panel.rowActions}
          onRowClick={panel.openDrawer}
          onAction={panel.openAction}
          emptyTitle="No users match your filters"
        />
      )}

      <AdminEntityDrawer
        open={panel.drawerOpen}
        record={panel.selectedRow}
        detail={panel.detail}
        sectionId="users"
        actions={panel.rowActions}
        onAction={panel.openAction}
        onClose={() => panel.setDrawerOpen(false)}
        refreshToken={drawerRefresh}
      />

      <AdminActionDialog
        open={Boolean(panel.pendingAction)}
        action={panel.pendingAction}
        row={panel.actionRow}
        onClose={panel.closeAction}
        onSuccess={() => {
          setDrawerRefresh((n) => n + 1);
          void panel.refetch();
        }}
      />
    </div>
  );
}
