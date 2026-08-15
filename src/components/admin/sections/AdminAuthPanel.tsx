import { useMemo, useState } from "react";
import { useAdminQuery } from "../../../hooks/useAdminQuery";
import {
  entriesForSection,
  pickListEndpoint,
} from "../../../lib/adminCatalog";
import {
  buildActionsFromCatalog,
  splitActions,
  type AdminAction,
} from "../../../lib/adminActionRegistry";
import { useAdminSessionStore } from "../../../stores/adminSession";
import { AdminActionDialog } from "../shared/AdminActionDialog";
import { AdminErrorBanner } from "../shared/AdminErrorBanner";
import { AdminGlobalActions } from "../shared/AdminGlobalActions";
import { AdminLoadingSkeleton } from "../shared/AdminLoadingSkeleton";
import { AdminPageHeader } from "../shared/AdminPageHeader";
import { AdminSummaryStrip } from "../shared/AdminSummaryStrip";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Auth admin is mostly overview KPIs + global session revoke — not a fake
 * OAuth-client table when the only GET is /auth/overview.
 */
export function AdminAuthPanel() {
  const groupedCatalog = useAdminSessionStore((s) => s.groupedCatalog);
  const entries = groupedCatalog
    ? entriesForSection(groupedCatalog, "auth")
    : [];

  const overviewPath = useMemo(() => {
    const overview = entries.find(
      (e) =>
        e.method === "GET" &&
        !e.mutate &&
        e.path.includes("/auth/overview"),
    );
    return overview?.path ?? "/v1/admin/auth/overview";
  }, [entries]);

  const listEndpoint = useMemo(() => {
    const reads = entries.filter(
      (e) =>
        e.method === "GET" &&
        !e.mutate &&
        !e.path.includes("{") &&
        !e.path.includes("/overview"),
    );
    return pickListEndpoint("auth", reads) ?? reads[0] ?? null;
  }, [entries]);

  const { globalActions } = useMemo(
    () => splitActions(buildActionsFromCatalog("auth", entries)),
    [entries],
  );

  const [pendingAction, setPendingAction] = useState<AdminAction | null>(null);

  const overview = useAdminQuery({
    path: overviewPath,
    enabled: Boolean(overviewPath),
  });

  const overviewData = useMemo(() => {
    const root = asRecord(overview.data);
    if (!root) return null;
    const data = asRecord(root.data) ?? root;
    return data;
  }, [overview.data]);

  const kpis = useMemo(() => {
    if (!overviewData) return [{ label: "Overview", value: "—" }];
    const items: {
      label: string;
      value: string | number;
      accent?: "default" | "success" | "warning" | "danger";
    }[] = [];
    for (const [key, label] of [
      ["active_sessions", "Active sessions"],
      ["total_users", "Users"],
      ["oauth_clients", "OAuth clients"],
      ["providers", "Providers"],
    ] as const) {
      const v = overviewData[key];
      if (v !== undefined && v !== null) {
        items.push({
          label,
          value: typeof v === "number" ? v : String(v),
          accent: key === "active_sessions" ? "success" : "default",
        });
      }
    }
    if (!items.length) {
      items.push({
        label: "Keys returned",
        value: Object.keys(overviewData).length,
      });
    }
    return items;
  }, [overviewData]);

  return (
    <div>
      <AdminPageHeader
        breadcrumb="Staff console / Auth"
        title="Auth policy"
        subtitle="Platform authentication overview and session controls. OAuth client CRUD is only shown when the staff catalog exposes a list endpoint — overview alone is not a client registry."
        actions={
          <AdminGlobalActions
            actions={globalActions}
            onAction={(action) => setPendingAction(action)}
          />
        }
      />

      {overview.error ? (
        <AdminErrorBanner
          message={overview.error}
          onRetry={() => void overview.refetch()}
        />
      ) : overview.loading && !overviewData ? (
        <AdminLoadingSkeleton rows={3} />
      ) : (
        <>
          <AdminSummaryStrip items={kpis} />

          <div className="cf-panel rounded-xl border border-white/10 p-5 max-w-2xl">
            <h3 className="font-sora text-[13px] font-semibold text-text-primary">
              What you can do here
            </h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[12px] text-text-secondary">
              <li>
                Review live auth KPIs from{" "}
                <span className="font-mono text-[11px] text-text-muted">
                  /v1/admin/auth/overview
                </span>
                .
              </li>
              <li>
                Use <span className="text-text-primary">Revoke user sessions</span>{" "}
                (top actions) to force a user to sign in again — pick them from
                the user search, you do not need to memorize IDs.
              </li>
              <li>
                {listEndpoint
                  ? `A list endpoint is available (${listEndpoint.path}) — open Users or API Explorer if you need raw client rows.`
                  : "No OAuth client/role list is published in the staff catalog yet, so this page stays overview-first."}
              </li>
            </ul>

            {overviewData ? (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(overviewData)
                  .slice(0, 12)
                  .map(([key, val]) => (
                    <div
                      key={key}
                      className="rounded-lg border border-white/8 bg-black/20 px-3 py-2"
                    >
                      <div className="text-[9px] uppercase tracking-wider text-text-muted">
                        {key.replace(/_/g, " ")}
                      </div>
                      <div className="mt-0.5 text-[12px] text-text-primary break-all">
                        {typeof val === "object"
                          ? JSON.stringify(val)
                          : String(val ?? "—")}
                      </div>
                    </div>
                  ))}
              </div>
            ) : null}
          </div>
        </>
      )}

      <AdminActionDialog
        open={Boolean(pendingAction)}
        action={pendingAction}
        row={null}
        onClose={() => setPendingAction(null)}
        onSuccess={() => void overview.refetch()}
      />
    </div>
  );
}
