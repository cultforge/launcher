import { useEffect, useMemo, useState } from "react";
import { ProgressBar } from "@heroui/react";
import {
  entriesForSection,
  pickListEndpoint,
  resolvePathTemplate,
} from "../../../lib/adminCatalog";
import {
  buildActionsFromCatalog,
  splitActions,
  type AdminAction,
} from "../../../lib/adminActionRegistry";
import { useAdminQuery } from "../../../hooks/useAdminQuery";
import { useAdminSessionStore } from "../../../stores/adminSession";
import { userDisplayName, userInitials } from "../../../lib/adminFormatters";
import { AdminActionDialog } from "../shared/AdminActionDialog";
import { AdminErrorBanner } from "../shared/AdminErrorBanner";
import { AdminLoadingSkeleton } from "../shared/AdminLoadingSkeleton";
import { AdminGlobalActions } from "../shared/AdminGlobalActions";
import { AdminPageHeader } from "../shared/AdminPageHeader";
import { AdminUserPicker } from "../shared/AdminUserPicker";

const PCT_KEYS = /(?:^|_)(pct|percent|percentage|usage_ratio)$/i;

export function AdminChloePanel() {
  const groupedCatalog = useAdminSessionStore((s) => s.groupedCatalog);
  const entries = groupedCatalog
    ? entriesForSection(groupedCatalog, "chloe")
    : [];

  const quotaEndpoint = useMemo(() => {
    const templated = entries.find(
      (e) =>
        e.method === "GET" &&
        e.path.includes("quota") &&
        e.path.includes("{"),
    );
    return templated ?? pickListEndpoint("chloe", entries);
  }, [entries]);

  const { rowActions, globalActions } = useMemo(
    () => splitActions(buildActionsFromCatalog("chloe", entries)),
    [entries],
  );

  const [userId, setUserId] = useState("");
  const [resolvedPath, setResolvedPath] = useState<string | null>(null);
  const [lookupQuery, setLookupQuery] = useState<
    Record<string, string> | undefined
  >();
  const [pendingAction, setPendingAction] = useState<AdminAction | null>(null);

  const openGlobalAction = (action: AdminAction) => setPendingAction(action);
  const openRowAction = (action: AdminAction) => setPendingAction(action);

  const { data, error, loading, refetch } = useAdminQuery({
    path: resolvedPath,
    query: lookupQuery,
    enabled: Boolean(resolvedPath),
  });

  const quotaRecord = useMemo(() => {
    if (!data || typeof data !== "object") return null;
    const obj = data as Record<string, unknown>;
    const inner = obj.data && typeof obj.data === "object" ? obj.data : obj;
    return inner as Record<string, unknown>;
  }, [data]);

  const runLookup = (id: string) => {
    if (!quotaEndpoint || !id.trim()) return;
    if (quotaEndpoint.path.includes("{")) {
      setResolvedPath(
        resolvePathTemplate(quotaEndpoint.path, { user_id: id.trim() }),
      );
      setLookupQuery(undefined);
    } else {
      setResolvedPath(quotaEndpoint.path);
      setLookupQuery({ user_id: id.trim() });
    }
  };

  useEffect(() => {
    if (!userId.trim()) {
      setResolvedPath(null);
      setLookupQuery(undefined);
      return;
    }
    runLookup(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lookup when picker changes
  }, [userId, quotaEndpoint?.path]);

  const mockRow = {
    user_id: userId,
    id: userId,
    username: userId,
  };

  return (
    <div>
      <AdminPageHeader
        breadcrumb="Staff console / Chloe"
        title="Chloe admin"
        subtitle="Look up a member with search — you do not need to memorize user IDs. Quota loads automatically when you pick someone."
        actions={
          <AdminGlobalActions
            actions={globalActions}
            onAction={openGlobalAction}
          />
        }
      />

      <div className="cf-panel rounded-xl border border-white/10 p-5 mb-5 max-w-xl">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Find a user
        </label>
        <p className="mt-1 text-[11px] text-text-muted">
          Search by username, email, or CultForge ID. Selecting a result loads
          their Chloe quota.
        </p>
        <div className="mt-2">
          <AdminUserPicker
            value={userId}
            onChange={setUserId}
            placeholder="Search users by name, email, or ID…"
            allowManual={false}
          />
        </div>
        {userId ? (
          <p className="mt-2 font-mono text-[10px] text-text-disabled">
            Selected id: {userId}
          </p>
        ) : null}
        {!quotaEndpoint ? (
          <p className="mt-3 text-[11px] text-state-warning">
            No Chloe quota endpoint is published in the staff catalog.
          </p>
        ) : null}
      </div>

      {error ? (
        <AdminErrorBanner message={error} onRetry={() => void refetch()} />
      ) : loading ? (
        <AdminLoadingSkeleton rows={3} />
      ) : quotaRecord ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="cf-panel rounded-xl border border-white/10 p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-base/15 text-[12px] font-bold text-primary-base">
                {userInitials(mockRow)}
              </div>
              <div>
                <div className="font-sora text-[14px] font-semibold text-text-primary">
                  {userDisplayName(mockRow)}
                </div>
                <div className="text-[10px] text-text-muted font-mono">
                  {userId}
                </div>
              </div>
            </div>

            {Object.entries(quotaRecord).map(([key, val]) => {
              if (typeof val === "number" && PCT_KEYS.test(key) && val <= 100) {
                return (
                  <ProgressBar
                    key={key}
                    value={val}
                    minValue={0}
                    maxValue={100}
                    className="mb-3"
                  >
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-text-muted capitalize">
                        {key.replace(/_/g, " ")}
                      </span>
                      <ProgressBar.Output>{val}%</ProgressBar.Output>
                    </div>
                    <ProgressBar.Track className="h-1.5 rounded-full bg-black/30">
                      <ProgressBar.Fill className="bg-linear-to-r from-primary-muted to-primary-base rounded-full" />
                    </ProgressBar.Track>
                  </ProgressBar>
                );
              }
              return (
                <div
                  key={key}
                  className="rounded-lg bg-black/20 border border-white/8 px-3 py-2 mb-2"
                >
                  <div className="text-[9px] uppercase tracking-wider text-text-muted">
                    {key.replace(/_/g, " ")}
                  </div>
                  <div className="text-[12px] text-text-primary mt-0.5">
                    {String(val ?? "—")}
                  </div>
                </div>
              );
            })}
          </div>

          {rowActions.length > 0 && userId.trim() ? (
            <div className="cf-panel rounded-xl border border-white/10 p-5">
              <h3 className="font-sora text-[13px] font-semibold text-text-primary mb-3">
                Admin actions
              </h3>
              <div className="flex flex-col gap-2">
                {rowActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => openRowAction(action)}
                    className={`rounded-lg px-4 py-2.5 text-left text-[11px] font-medium cursor-pointer border ${
                      action.severity === "danger"
                        ? "border-state-error/30 text-state-error hover:bg-state-error/10"
                        : "border-white/10 text-text-secondary hover:bg-white/6"
                    }`}
                  >
                    <div>{action.label}</div>
                    <div className="text-[10px] text-text-muted mt-0.5">
                      {action.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="cf-panel rounded-xl border border-white/10 p-8 text-center max-w-xl">
          <p className="text-[13px] text-text-secondary">
            Select a user above to load Chloe quota.
          </p>
          <p className="mt-2 text-[11px] text-text-muted">
            Tip: start typing a username — results come from the Users admin
            list, same picker as Sessions.
          </p>
        </div>
      )}

      <AdminActionDialog
        open={Boolean(pendingAction)}
        action={pendingAction}
        row={
          pendingAction?.global || !userId.trim() ? null : mockRow
        }
        onClose={() => setPendingAction(null)}
        onSuccess={() => void refetch()}
      />
    </div>
  );
}
