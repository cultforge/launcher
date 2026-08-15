import { useMemo } from "react";
import {
  entriesForSection,
  pickListEndpoint,
  visibleSections,
} from "../../../lib/adminCatalog";
import {
  extractPieSlices,
  extractRows,
  extractTimeSeries,
} from "../../../lib/adminParse";
import { formatBool } from "../../../lib/adminFormatters";
import { useAdminQuery } from "../../../hooks/useAdminQuery";
import { useAdminSessionStore } from "../../../stores/adminSession";
import { useAdminRouteStore } from "../../../stores/adminRoute";
import { AdminChartCard } from "../shared/AdminChartCard";
import { AdminErrorBanner } from "../shared/AdminErrorBanner";
import { AdminLineChart } from "../shared/AdminLineChart";
import { AdminLoadingSkeleton } from "../shared/AdminLoadingSkeleton";
import { AdminPageHeader } from "../shared/AdminPageHeader";
import { AdminPieChart } from "../shared/AdminPieChart";
import { AdminSummaryStrip } from "../shared/AdminSummaryStrip";
import { AdminTimeline } from "../shared/AdminTimeline";

export function AdminOverview() {
  const groupedCatalog = useAdminSessionStore((s) => s.groupedCatalog);
  const setSection = useAdminRouteStore((s) => s.setSection);

  const usersEndpoint = groupedCatalog
    ? pickListEndpoint("users", entriesForSection(groupedCatalog, "users"))
    : null;
  const reportsEndpoint = groupedCatalog
    ? pickListEndpoint("reports", entriesForSection(groupedCatalog, "reports"))
    : null;
  const auditEndpoint = groupedCatalog
    ? pickListEndpoint("audit", entriesForSection(groupedCatalog, "audit"))
    : null;
  const authOverviewEndpoint = groupedCatalog
    ? entriesForSection(groupedCatalog, "auth").find(
        (e) => e.path === "/v1/admin/auth/overview",
      ) ?? null
    : null;
  const metricsEntries = groupedCatalog
    ? entriesForSection(groupedCatalog, "overview").filter((e) =>
        e.path.includes("/metrics"),
      )
    : [];
  const metricsEndpoint =
    metricsEntries.find((e) => !e.path.includes("{")) ?? metricsEntries[0] ?? null;

  const { data: usersData, loading: usersLoading } = useAdminQuery({
    path: usersEndpoint?.path ?? null,
    enabled: Boolean(usersEndpoint),
  });
  const { data: authOverviewData } = useAdminQuery({
    path: authOverviewEndpoint?.path ?? null,
    enabled: Boolean(authOverviewEndpoint),
  });
  const { data: reportsData } = useAdminQuery({
    path: reportsEndpoint?.path ?? null,
    enabled: Boolean(reportsEndpoint),
  });
  const { data: auditData } = useAdminQuery({
    path: auditEndpoint?.path ?? null,
    enabled: Boolean(auditEndpoint),
  });
  const { data: metricsData, error, refetch } = useAdminQuery({
    path: metricsEndpoint?.path ?? null,
    enabled: Boolean(metricsEndpoint),
  });

  const users = useMemo(() => extractRows(usersData), [usersData]);
  const reports = useMemo(() => extractRows(reportsData), [reportsData]);
  const auditRows = useMemo(
    () => [...extractRows(auditData)].reverse().slice(0, 8),
    [auditData],
  );

  const bannedCount = users.filter((u) => formatBool(u.is_banned)).length;
  const pendingReports = reports.filter((r) =>
    String(r.status ?? "").toLowerCase().includes("pending"),
  ).length;
  const activeSessions = useMemo(() => {
    if (!authOverviewData || typeof authOverviewData !== "object") return 0;
    const obj = authOverviewData as Record<string, unknown>;
    const data = obj.data && typeof obj.data === "object" ? obj.data : obj;
    const count = (data as Record<string, unknown>).active_sessions;
    return typeof count === "number" ? count : 0;
  }, [authOverviewData]);

  const signups7d = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86400000;
    return users.filter((u) => {
      const t = new Date(String(u.created_at ?? "")).getTime();
      return !Number.isNaN(t) && t >= weekAgo;
    }).length;
  }, [users]);

  const timeSeries = useMemo(() => extractTimeSeries(metricsData), [metricsData]);
  const pieSlices = useMemo(() => {
    if (users.length) {
      const active = users.filter(
        (u) => !formatBool(u.is_banned) && (formatBool(u.is_active) || u.is_active === undefined),
      ).length;
      const banned = users.filter((u) => formatBool(u.is_banned)).length;
      const inactive = users.length - active - banned;
      return [
        { id: "active", label: "Active", value: active },
        { id: "banned", label: "Banned", value: banned },
        { id: "inactive", label: "Inactive", value: Math.max(0, inactive) },
      ].filter((s) => s.value > 0);
    }
    return extractPieSlices(metricsData);
  }, [users, metricsData]);

  const kpis = [
    { label: "Total users", value: users.length || "—", accent: "default" as const },
    { label: "Active sessions", value: activeSessions || "—", accent: "success" as const },
    { label: "Pending reports", value: pendingReports || "—", accent: pendingReports > 0 ? "warning" as const : "default" as const },
    { label: "Banned users", value: bannedCount || "—", accent: bannedCount > 0 ? "danger" as const : "default" as const },
    { label: "Signups (7d)", value: signups7d || "—" },
  ];

  const sections = groupedCatalog ? visibleSections(groupedCatalog) : [];
  const quickLinks = sections.filter((s) =>
    ["users", "sessions", "reports", "audit"].includes(String(s.id)),
  );

  const loading = usersLoading && Boolean(usersEndpoint);

  return (
    <div className="flex flex-col gap-5">
      <AdminPageHeader
        breadcrumb="Staff console"
        title="Platform overview"
        subtitle="Live platform health, moderation queue depth, and recent staff activity."
      />

      {error ? (
        <AdminErrorBanner message={error} onRetry={() => void refetch()} />
      ) : null}

      {loading ? (
        <AdminLoadingSkeleton rows={2} />
      ) : (
        <AdminSummaryStrip items={kpis} />
      )}

      {quickLinks.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {quickLinks.map((s) => (
            <button
              key={String(s.id)}
              type="button"
              onClick={() => setSection(s.id)}
              className="rounded-full border border-white/10 px-3.5 py-1.5 text-[10px] font-medium text-text-secondary hover:border-primary-base/35 hover:text-primary-base cursor-pointer transition-colors"
            >
              Open {s.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AdminChartCard title="Platform activity" subtitle="Request and event trends">
          <AdminLineChart data={timeSeries} />
        </AdminChartCard>
        <AdminChartCard title="User status" subtitle="Active vs banned vs inactive">
          <AdminPieChart data={pieSlices} />
        </AdminChartCard>
      </div>

      {auditRows.length > 0 ? (
        <div className="cf-panel rounded-xl border border-white/10 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-sora text-[14px] font-semibold text-text-primary">
              Recent audit activity
            </h3>
            <button
              type="button"
              onClick={() => setSection("audit")}
              className="text-[10px] font-medium text-primary-base hover:underline cursor-pointer"
            >
              View full log
            </button>
          </div>
          <AdminTimeline rows={auditRows} />
        </div>
      ) : null}
    </div>
  );
}
