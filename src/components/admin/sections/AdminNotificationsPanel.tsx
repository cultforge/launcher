import { useMemo } from "react";
import { formatDate } from "../../../lib/adminFormatters";
import { useAdminSectionPanel } from "../../../hooks/useAdminSectionPanel";
import { AdminActionDialog } from "../shared/AdminActionDialog";
import { AdminEntityDrawer } from "../shared/AdminEntityDrawer";
import { AdminErrorBanner } from "../shared/AdminErrorBanner";
import { AdminFilterBar } from "../shared/AdminFilterBar";
import { AdminGlobalActions } from "../shared/AdminGlobalActions";
import { AdminLoadingSkeleton } from "../shared/AdminLoadingSkeleton";
import { AdminPageHeader } from "../shared/AdminPageHeader";
import { AdminRecordTable } from "../shared/AdminRecordTable";
import { AdminSummaryStrip } from "../shared/AdminSummaryStrip";
import { AdminStatusBadge } from "../shared/AdminStatusBadge";

export function AdminNotificationsPanel() {
  const panel = useAdminSectionPanel("notifications");

  const filtered = useMemo(() => {
    const q = panel.search.trim().toLowerCase();
    if (!q) return panel.rows;
    return panel.rows.filter((r) =>
      Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q)),
    );
  }, [panel.rows, panel.search]);

  const kpis = useMemo(
    () => [
      { label: "Recent sent", value: panel.rows.length },
      {
        label: "Unread",
        value: panel.rows.filter((r) => r.is_read === false).length,
        accent: "warning" as const,
      },
    ],
    [panel.rows],
  );

  const columns = useMemo(
    () => [
      {
        id: "title",
        label: "Title",
        sortable: true,
        render: (row: Record<string, unknown>) => String(row.title ?? "—"),
      },
      {
        id: "kind",
        label: "Kind",
        sortable: true,
        render: (row: Record<string, unknown>) => String(row.kind ?? "—"),
      },
      {
        id: "user_id",
        label: "User",
        sortable: true,
        render: (row: Record<string, unknown>) => String(row.user_id ?? "—"),
      },
      {
        id: "created_at",
        label: "Sent",
        sortable: true,
        render: (row: Record<string, unknown>) => formatDate(row.created_at),
      },
      {
        id: "is_read",
        label: "Read",
        sortable: true,
        render: (row: Record<string, unknown>) => (
          <AdminStatusBadge status={row.is_read ? "resolved" : "pending"} />
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <AdminPageHeader
        breadcrumb="Staff console / Notifications"
        title="Notifications"
        subtitle="Send platform notifications and review recently delivered admin notices."
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
        searchPlaceholder="Search notifications…"
      />

      {panel.error ? (
        <AdminErrorBanner message={panel.error} onRetry={() => void panel.refetch()} />
      ) : panel.loading ? (
        <AdminLoadingSkeleton />
      ) : (
        <AdminRecordTable
          rows={filtered}
          columns={columns}
          sectionId="notifications"
          onRowClick={panel.openDrawer}
          emptyTitle="No notifications yet"
        />
      )}

      <AdminEntityDrawer
        open={panel.drawerOpen}
        record={panel.selectedRow}
        detail={panel.selectedRow}
        sectionId="notifications"
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
