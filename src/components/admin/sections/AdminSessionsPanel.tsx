import { useMemo, useState } from "react";
import { formatDate } from "../../../lib/adminFormatters";
import { useAdminSessionsAggregate } from "../../../hooks/useAdminSessionsAggregate";
import { useAdminSectionPanel } from "../../../hooks/useAdminSectionPanel";
import { AdminActionDialog } from "../shared/AdminActionDialog";
import { AdminEntityDrawer } from "../shared/AdminEntityDrawer";
import { AdminErrorBanner } from "../shared/AdminErrorBanner";
import { AdminFilterBar } from "../shared/AdminFilterBar";
import { AdminLoadingSkeleton } from "../shared/AdminLoadingSkeleton";
import { AdminPageHeader } from "../shared/AdminPageHeader";
import { AdminRecordTable } from "../shared/AdminRecordTable";
import { AdminSummaryStrip } from "../shared/AdminSummaryStrip";
import { AdminStatusBadge } from "../shared/AdminStatusBadge";
import { AdminUserPicker } from "../shared/AdminUserPicker";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "expired", label: "Expired" },
  { id: "revoked", label: "Revoked" },
];

export function AdminSessionsPanel() {
  const panel = useAdminSectionPanel("sessions");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const aggregate = useAdminSessionsAggregate(selectedUserId);

  const filtered = useMemo(() => {
    let list = aggregate.sessions;
    const q = panel.search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q)),
      );
    }
    if (panel.filter === "active") {
      list = list.filter((r) => r.status === "active");
    } else if (panel.filter === "expired") {
      list = list.filter((r) => r.status === "expired");
    } else if (panel.filter === "revoked") {
      list = list.filter((r) => r.status === "revoked");
    }
    return list;
  }, [aggregate.sessions, panel.search, panel.filter]);

  const kpis = useMemo(
    () => [
      {
        label: "Loaded",
        value: aggregate.sessions.length,
      },
      {
        label: "Active",
        value: aggregate.sessions.filter((r) => r.status === "active").length,
        accent: "success" as const,
      },
      ...(aggregate.activeCount !== null
        ? [{ label: "Platform active", value: aggregate.activeCount }]
        : []),
    ],
    [aggregate.sessions, aggregate.activeCount],
  );

  const columns = useMemo(
    () => [
      {
        id: "platform",
        label: "Platform",
        sortable: true,
        render: (row: Record<string, unknown>) =>
          String(row.platform ?? row.user_agent ?? "—").slice(0, 40),
      },
      {
        id: "ip",
        label: "IP",
        sortable: true,
        render: (row: Record<string, unknown>) =>
          String(row.ip_address ?? row.ip ?? "—"),
      },
      {
        id: "country",
        label: "Country",
        sortable: true,
        render: (row: Record<string, unknown>) =>
          String(row.cf_ipcountry ?? "—"),
      },
      {
        id: "created_at",
        label: "Started",
        sortable: true,
        render: (row: Record<string, unknown>) => formatDate(row.created_at),
      },
      {
        id: "expires_at",
        label: "Expires",
        sortable: true,
        render: (row: Record<string, unknown>) => formatDate(row.expires_at),
      },
      {
        id: "status",
        label: "Status",
        sortable: true,
        render: (row: Record<string, unknown>) => (
          <AdminStatusBadge
            status={
              row.status === "active"
                ? "active"
                : row.status === "revoked"
                  ? "failed"
                  : "pending"
            }
          />
        ),
      },
    ],
    [],
  );

  const error = aggregate.error ?? panel.error;

  return (
    <div>
      <AdminPageHeader
        breadcrumb="Staff console / Sessions"
        title="Sessions"
        subtitle="Sessions are loaded per user on purpose — there is no global dump of millions of rows. Search a member, then filter their sign-ins. Platform Active is a live total from auth overview."
        actions={
          selectedUserId ? (
            <button
              type="button"
              onClick={() => void aggregate.refetch()}
              disabled={aggregate.loading}
              className="rounded-lg border border-white/10 px-3.5 py-2 text-[11px] font-semibold text-text-secondary hover:bg-white/6 cursor-pointer disabled:opacity-40"
            >
              {aggregate.loading ? "Refreshing…" : "Refresh"}
            </button>
          ) : null
        }
      />

      <div className="cf-panel rounded-xl border border-white/10 p-5 mb-4 max-w-xl">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Load sessions for user
        </label>
        <AdminUserPicker
          value={selectedUserId ?? ""}
          onChange={(id) => setSelectedUserId(id.trim() || null)}
          placeholder="Search by username, email, or ID…"
          allowManual={false}
        />
      </div>

      {aggregate.fetchWarnings ? (
        <div className="mb-4 rounded-lg border border-state-warning/30 bg-state-warning/8 px-4 py-3 text-[12px] text-state-warning">
          {aggregate.fetchWarnings}
        </div>
      ) : null}

      <AdminSummaryStrip items={kpis} />

      <AdminFilterBar
        search={panel.search}
        onSearchChange={panel.setSearch}
        searchPlaceholder="Filter loaded sessions…"
        filters={FILTERS}
        activeFilter={panel.filter}
        onFilterChange={panel.setFilter}
      />

      {error ? (
        <AdminErrorBanner
          message={error}
          onRetry={() => void aggregate.refetch()}
        />
      ) : !selectedUserId ? (
        <div className="cf-panel rounded-xl border border-white/10 p-8 text-center">
          <p className="text-[13px] text-text-secondary">
            Select a user above to load their session history.
          </p>
          <p className="mt-2 text-[11px] text-text-muted max-w-md mx-auto">
            This stays fast at scale: we never try to render every platform
            session at once. Search finds the account, then only that user&apos;s
            records load (paginated in the table).
          </p>
          {aggregate.activeCount !== null ? (
            <p className="mt-2 text-[11px] text-text-muted">
              {aggregate.activeCount} active session
              {aggregate.activeCount === 1 ? "" : "s"} platform-wide.
            </p>
          ) : null}
        </div>
      ) : aggregate.loading ? (
        <AdminLoadingSkeleton />
      ) : (
        <AdminRecordTable
          rows={filtered}
          columns={columns}
          sectionId="sessions"
          actions={panel.rowActions}
          onRowClick={panel.openDrawer}
          onAction={panel.openAction}
          emptyTitle="No sessions for this user"
        />
      )}

      <AdminEntityDrawer
        open={panel.drawerOpen}
        record={panel.selectedRow}
        detail={panel.selectedRow}
        sectionId="sessions"
        actions={panel.rowActions}
        onAction={panel.openAction}
        onClose={() => panel.setDrawerOpen(false)}
      />

      <AdminActionDialog
        open={Boolean(panel.pendingAction)}
        action={panel.pendingAction}
        row={panel.actionRow}
        onClose={panel.closeAction}
        onSuccess={() => void aggregate.refetch()}
      />
    </div>
  );
}
