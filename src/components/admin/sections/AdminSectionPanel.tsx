import { useMemo } from "react";
import type { AdminSectionId } from "../../../lib/adminCatalog";
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
import { formatBool } from "../../../lib/adminFormatters";
import { rowStatusFromRow } from "../shared/AdminStatusBadge";

type SectionMeta = {
  title: string;
  subtitle: string;
  breadcrumb: string;
  searchPlaceholder: string;
  filters?: { id: string; label: string }[];
  computeKpis?: (rows: Record<string, unknown>[]) => {
    label: string;
    value: string | number;
    accent?: "default" | "success" | "warning" | "danger";
  }[];
  filterFn?: (
    rows: Record<string, unknown>[],
    filter: string,
    search: string,
  ) => Record<string, unknown>[];
};

const META: Partial<Record<AdminSectionId, SectionMeta>> = {
  sessions: {
    title: "Sessions",
    subtitle: "Monitor active sign-ins and revoke compromised sessions.",
    breadcrumb: "Staff console / Sessions",
    searchPlaceholder: "Search by user or IP…",
    filters: [
      { id: "all", label: "All" },
      { id: "active", label: "Active" },
      { id: "expired", label: "Expired" },
    ],
    computeKpis: (rows) => [
      { label: "Total sessions", value: rows.length },
      {
        label: "Active",
        value: rows.filter((r) => {
          const s = String(r.status ?? "").toLowerCase();
          return !s.includes("expir") && !s.includes("revok");
        }).length,
        accent: "success",
      },
      {
        label: "Unique users",
        value: new Set(rows.map((r) => r.user_id ?? r.username)).size,
      },
    ],
    filterFn: (rows, filter, search) => {
      let list = rows;
      const q = search.trim().toLowerCase();
      if (q) {
        list = list.filter((r) =>
          Object.values(r).some((v) => String(v).toLowerCase().includes(q)),
        );
      }
      if (filter === "active") {
        list = list.filter((r) => {
          const s = String(r.status ?? "active").toLowerCase();
          return s.includes("active") || s.includes("online");
        });
      } else if (filter === "expired") {
        list = list.filter((r) => {
          const s = String(r.status ?? "").toLowerCase();
          return s.includes("expir") || s.includes("revok");
        });
      }
      return list;
    },
  },
  reports: {
    title: "Reports",
    subtitle: "Browse moderation reports and run scheduled report jobs — no inline resolve or escalate API.",
    breadcrumb: "Staff console / Reports",
    searchPlaceholder: "Search reports…",
    filters: [
      { id: "all", label: "All" },
      { id: "pending", label: "Pending" },
      { id: "resolved", label: "Resolved" },
    ],
    computeKpis: (rows) => [
      { label: "Total reports", value: rows.length },
      {
        label: "Pending",
        value: rows.filter((r) => rowStatusFromRow(r) === "pending").length,
        accent: "warning",
      },
      {
        label: "Resolved",
        value: rows.filter((r) => rowStatusFromRow(r) === "resolved").length,
        accent: "success",
      },
    ],
    filterFn: (rows, filter, search) => {
      let list = rows;
      const q = search.trim().toLowerCase();
      if (q) {
        list = list.filter((r) =>
          Object.values(r).some((v) => String(v).toLowerCase().includes(q)),
        );
      }
      if (filter !== "all") {
        list = list.filter(
          (r) => String(r.status ?? "").toLowerCase().includes(filter),
        );
      }
      return list;
    },
  },
  guilds: {
    title: "Guilds",
    subtitle: "Platform-wide guild registry. Row actions appear as labeled buttons (Unlist, Flags, …) — step up first if they are disabled.",
    breadcrumb: "Staff console / Guilds",
    searchPlaceholder: "Search guilds by name or tag…",
    computeKpis: (rows) => [
      { label: "Total guilds", value: rows.length },
      {
        label: "Active",
        value: rows.filter((r) => formatBool(r.is_active) || r.status === "active").length,
        accent: "success",
      },
    ],
  },
  notifications: {
    title: "Notifications",
    subtitle: "Outbound notification delivery queue and status.",
    breadcrumb: "Staff console / Notifications",
    searchPlaceholder: "Search notifications…",
    filters: [
      { id: "all", label: "All" },
      { id: "pending", label: "Pending" },
      { id: "sent", label: "Sent" },
      { id: "failed", label: "Failed" },
    ],
    computeKpis: (rows) => [
      { label: "Total", value: rows.length },
      {
        label: "Pending",
        value: rows.filter((r) => rowStatusFromRow(r) === "pending").length,
        accent: "warning",
      },
      {
        label: "Failed",
        value: rows.filter((r) => rowStatusFromRow(r) === "failed").length,
        accent: "danger",
      },
    ],
  },
  mail: {
    title: "Mail",
    subtitle: "Send-only — compose transactional email; delivery is logged to audit, not listed here.",
    breadcrumb: "Staff console / Mail",
    searchPlaceholder: "Search audit mail events…",
    filters: [
      { id: "all", label: "All" },
      { id: "pending", label: "Pending" },
      { id: "sent", label: "Sent" },
      { id: "failed", label: "Failed" },
    ],
    computeKpis: (rows) => [
      { label: "Total sent", value: rows.filter((r) => rowStatusFromRow(r) === "sent").length, accent: "success" },
      { label: "Pending", value: rows.filter((r) => rowStatusFromRow(r) === "pending").length, accent: "warning" },
      { label: "Failed", value: rows.filter((r) => rowStatusFromRow(r) === "failed").length, accent: "danger" },
    ],
  },
  invites: {
    title: "Invites",
    subtitle: "Invite codes and pending guild invitations.",
    breadcrumb: "Staff console / Invites",
    searchPlaceholder: "Search invites…",
    computeKpis: (rows) => [{ label: "Total invites", value: rows.length }],
  },
  auth: {
    title: "Auth policy",
    subtitle: "OAuth clients, roles, and authentication configuration.",
    breadcrumb: "Staff console / Auth",
    searchPlaceholder: "Search auth records…",
    computeKpis: (rows) => [{ label: "Configured", value: rows.length }],
  },
  "rate-limits": {
    title: "Rate limits",
    subtitle: "Create overrides by IP, user (search picker), or API path — then delete when done. No row-edit API.",
    breadcrumb: "Staff console / Rate limits",
    searchPlaceholder: "Search by scope, key, or reason…",
    computeKpis: (rows) => [{ label: "Policies", value: rows.length }],
  },
  hotfixes: {
    title: "Hotfixes & updates",
    subtitle: "Global update pipeline and hotfix release management.",
    breadcrumb: "Staff console / Hotfixes",
    searchPlaceholder: "Search releases…",
    computeKpis: (rows) => [
      { label: "Releases", value: rows.length },
      {
        label: "Published",
        value: rows.filter((r) => String(r.status ?? "").includes("publish")).length,
        accent: "success",
      },
    ],
  },
};

type Props = {
  sectionId: AdminSectionId;
};

export function AdminSectionPanel({ sectionId }: Props) {
  const meta = META[sectionId];
  const panel = useAdminSectionPanel(sectionId);

  const filtered = useMemo(() => {
    if (meta?.filterFn) {
      return meta.filterFn(panel.rows, panel.filter, panel.search);
    }
    const q = panel.search.trim().toLowerCase();
    if (!q) return panel.rows;
    return panel.rows.filter((r) =>
      Object.values(r).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [panel.rows, panel.search, panel.filter, meta]);

  const kpis = useMemo(
    () => meta?.computeKpis?.(panel.rows) ?? [{ label: "Records", value: panel.rows.length }],
    [meta, panel.rows],
  );

  if (!meta) return null;

  return (
    <div>
      <AdminPageHeader
        breadcrumb={meta.breadcrumb}
        title={meta.title}
        subtitle={meta.subtitle}
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
        searchPlaceholder={meta.searchPlaceholder}
        filters={meta.filters}
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
          sectionId={sectionId}
          actions={panel.rowActions}
          onRowClick={panel.openDrawer}
          onAction={panel.openAction}
        />
      )}

      <AdminEntityDrawer
        open={panel.drawerOpen}
        record={panel.selectedRow}
        detail={panel.detail}
        sectionId={sectionId}
        actions={panel.rowActions}
        onAction={panel.openAction}
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
