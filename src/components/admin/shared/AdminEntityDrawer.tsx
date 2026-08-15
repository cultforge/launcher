import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { userDisplayName, userInitials, formatBool, formatDate } from "../../../lib/adminFormatters";
import { AdminStatusBadge, userStatusFromRow } from "./AdminStatusBadge";
import type { AdminAction } from "../../../lib/adminActionRegistry";
import { buildActionsFromCatalog, resolveActionsForRow } from "../../../lib/adminActionRegistry";
import { adminRequest } from "../../../lib/adminApi";
import { extractRows } from "../../../lib/adminParse";
import { entriesForSection, pickListEndpoint, resolvePathTemplate } from "../../../lib/adminCatalog";
import { useAdminSessionStore } from "../../../stores/adminSession";

type Tab = "overview" | "sessions" | "activity" | "raw";

type Props = {
  open: boolean;
  title?: string;
  record: Record<string, unknown> | null;
  detail?: unknown;
  sectionId?: string;
  actions?: AdminAction[];
  onAction?: (action: AdminAction, row: Record<string, unknown>) => void;
  onClose: () => void;
  refreshToken?: number;
};

const SKIP_KEYS = new Set(["password", "token", "secret"]);

function hasAdminRole(row: Record<string, unknown>): boolean {
  const roles = row.roles;
  if (Array.isArray(roles)) {
    return roles.some((r) => String(r).toLowerCase().includes("admin"));
  }
  return false;
}

export function AdminEntityDrawer({
  open,
  title,
  record,
  detail,
  sectionId,
  actions = [],
  onAction,
  onClose,
  refreshToken = 0,
}: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [userSessions, setUserSessions] = useState<Record<string, unknown>[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [activityRows, setActivityRows] = useState<Record<string, unknown>[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) setTab("overview");
  }, [open, record]);

  const groupedCatalog = useAdminSessionStore((s) => s.groupedCatalog);
  const sessionRevokeAction = groupedCatalog
    ? buildActionsFromCatalog(
        "sessions",
        entriesForSection(groupedCatalog, "sessions"),
      ).find((a) => a.entry.path === "/v1/admin/sessions/{session_id}/revoke")
    : undefined;

  const sessionsListPath = groupedCatalog
    ? entriesForSection(groupedCatalog, "users").find(
        (e) =>
          e.method === "GET" &&
          e.path.includes("/users/") &&
          e.path.includes("/sessions"),
      )?.path ?? "/v1/admin/users/{id}/sessions"
    : "/v1/admin/users/{id}/sessions";

  const auditListPath = groupedCatalog
    ? pickListEndpoint("audit", entriesForSection(groupedCatalog, "audit"))?.path ?? null
    : null;

  const userId = record ? String(record.id ?? record.user_id ?? "") : "";

  useEffect(() => {
    if (!open || sectionId !== "users" || !userId || tab !== "sessions") return;
    let cancelled = false;
    setSessionsLoading(true);
    setSessionsError(null);
    const path = resolvePathTemplate(sessionsListPath, { id: userId, user_id: userId });
    void adminRequest({
      method: "GET",
      path,
      query: { include_revoked: "true" },
    })
      .then((data) => {
        if (!cancelled) setUserSessions(extractRows(data));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setUserSessions([]);
          setSessionsError(err instanceof Error ? err.message : "Failed to load sessions");
        }
      })
      .finally(() => {
        if (!cancelled) setSessionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, sectionId, userId, tab, refreshToken, sessionsListPath]);

  useEffect(() => {
    if (!open || !userId || tab !== "activity" || !auditListPath) return;
    let cancelled = false;
    setActivityLoading(true);
    setActivityError(null);
    void adminRequest({
      method: "GET",
      path: auditListPath,
      query: { limit: "100" },
    })
      .then((data) => {
        if (cancelled) return;
        const rows = extractRows(data);
        const filtered = rows.filter((row) => {
          const actor = String(row.actor ?? row.actor_id ?? row.user_id ?? "");
          const target = String(row.target_id ?? row.subject_id ?? row.resource_id ?? "");
          return actor === userId || target === userId;
        });
        setActivityRows(filtered);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setActivityRows([]);
          setActivityError(err instanceof Error ? err.message : "Failed to load activity");
        }
      })
      .finally(() => {
        if (!cancelled) setActivityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, userId, tab, auditListPath, refreshToken]);

  if (!open || !record) return null;

  const display = (detail && typeof detail === "object" ? detail : record) as Record<string, unknown>;
  const name = userDisplayName(record);
  const initials = userInitials(record);
  const rowActions = resolveActionsForRow(actions, record);
  const status = sectionId === "users" ? userStatusFromRow(record) : undefined;

  const tabs: Tab[] =
    sectionId === "users"
      ? ["overview", "sessions", "activity", "raw"]
      : ["overview", "activity", "raw"];

  const fields = Object.entries(display).filter(
    ([k]) => !SKIP_KEYS.has(k.toLowerCase()) && typeof display[k] !== "object",
  );

  const roles = Array.isArray(display.roles) ? display.roles : [];

  return createPortal(
    <div className="fixed inset-0 z-250 flex justify-end" role="presentation">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-lg flex-col cf-panel border-l border-white/12 shadow-2xl">
        <div className="shrink-0 border-b border-white/8 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-base/15 text-[12px] font-bold text-primary-base">
                {initials}
              </div>
              <div className="min-w-0">
                <h2 className="font-sora text-[15px] font-bold text-text-primary truncate">
                  {title ?? name}
                </h2>
                {record.username ? (
                  <p className="text-[11px] text-text-muted">@{String(record.username)}</p>
                ) : null}
                {status ? (
                  <div className="mt-1.5">
                    <AdminStatusBadge status={status} />
                  </div>
                ) : null}
                {sectionId === "users" && hasAdminRole(display) ? (
                  <div className="mt-1.5">
                    <span className="inline-flex rounded-full border border-primary-base/35 bg-primary-base/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary-base">
                      Platform admin
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-[10px] uppercase tracking-wide text-text-muted hover:text-white cursor-pointer shrink-0"
            >
              Close
            </button>
          </div>

          {rowActions.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {rowActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => onAction?.(action, record)}
                  className={`rounded-lg px-3 py-1.5 text-[10px] font-semibold cursor-pointer ${
                    action.severity === "danger"
                      ? "border border-state-error/35 text-state-error hover:bg-state-error/10"
                      : action.severity === "warning"
                        ? "border border-state-warning/35 text-state-warning hover:bg-state-warning/10"
                        : "border border-white/10 text-text-secondary hover:bg-white/6"
                  }`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-4 flex gap-1 border-b border-white/8 -mb-px">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-[10px] font-medium capitalize cursor-pointer border-b-2 -mb-px ${
                  tab === t
                    ? "border-primary-base text-primary-base"
                    : "border-transparent text-text-muted hover:text-text-secondary"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scroll-hidden p-5">
          {tab === "overview" ? (
            <>
              {roles.length > 0 ? (
                <div className="mb-4">
                  <div className="text-[9px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                    Roles
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {roles.map((r) => (
                      <span
                        key={String(r)}
                        className="rounded-full border border-white/10 bg-black/25 px-2.5 py-0.5 text-[10px] text-text-secondary"
                      >
                        {String(r)}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <dl className="grid grid-cols-1 gap-2">
                {fields.map(([key, val]) => (
                  <div
                    key={key}
                    className="rounded-lg border border-white/8 bg-black/20 px-3 py-2.5"
                  >
                    <dt className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">
                      {key.replace(/_/g, " ")}
                    </dt>
                    <dd className="mt-0.5 text-[12px] text-text-primary break-all">
                      {key.includes("at") || key.includes("date")
                        ? formatDate(val)
                        : typeof val === "boolean"
                          ? val
                            ? "Yes"
                            : "No"
                          : String(val ?? "—")}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}

          {tab === "sessions" && sectionId === "users" ? (
            <div className="flex flex-col gap-2">
              {sessionsLoading ? (
                <p className="text-[12px] text-text-muted">Loading sessions…</p>
              ) : sessionsError ? (
                <p className="text-[12px] text-state-error">{sessionsError}</p>
              ) : userSessions.length === 0 ? (
                <p className="text-[12px] text-text-muted">No sessions for this user.</p>
              ) : (
                userSessions.map((s) => {
                  const sessionRow = { ...s, user_id: userId, id: s.id };
                  const revoked = formatBool(s.is_revoked);
                  return (
                    <div
                      key={String(s.id)}
                      className="rounded-lg border border-white/8 bg-black/20 px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-text-primary">
                          {String(s.platform ?? "Unknown platform")}
                        </span>
                        <AdminStatusBadge status={revoked ? "failed" : "active"} />
                      </div>
                      <div className="mt-1 text-[10px] text-text-muted">
                        {String(s.ip_address ?? "—")} · {String(s.cf_ipcountry ?? "—")}
                      </div>
                      <div className="mt-1 text-[10px] text-text-disabled">
                        Started {formatDate(s.created_at)} · Expires {formatDate(s.expires_at)}
                      </div>
                      {!revoked && sessionRevokeAction ? (
                        <button
                          type="button"
                          onClick={() => onAction?.(sessionRevokeAction, sessionRow)}
                          className="mt-2 rounded-md border border-state-warning/35 px-2 py-1 text-[10px] font-semibold text-state-warning cursor-pointer hover:bg-state-warning/10"
                        >
                          Revoke session
                        </button>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          ) : null}

          {tab === "activity" ? (
            <div className="flex flex-col gap-2">
              {activityLoading ? (
                <p className="text-[12px] text-text-muted">Loading activity…</p>
              ) : activityError ? (
                <p className="text-[12px] text-state-error">{activityError}</p>
              ) : !auditListPath ? (
                <p className="text-[12px] text-text-muted">
                  Audit list endpoint not available in staff catalog.
                </p>
              ) : activityRows.length === 0 ? (
                <p className="text-[12px] text-text-muted">No audit events for this user.</p>
              ) : (
                activityRows.map((row, i) => (
                  <div
                    key={String(row.id ?? i)}
                    className="rounded-lg border border-white/8 bg-black/20 px-3 py-2.5"
                  >
                    <div className="text-[11px] font-medium text-text-primary">
                      {String(row.action ?? row.event ?? row.type ?? "Event")}
                    </div>
                    <div className="mt-1 text-[10px] text-text-muted">
                      {formatDate(row.created_at ?? row.timestamp)}
                    </div>
                    {row.detail || row.message ? (
                      <div className="mt-1 text-[10px] text-text-secondary break-all">
                        {String(row.detail ?? row.message)}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          ) : null}

          {tab === "raw" ? (
            <pre className="rounded-lg bg-black/40 border border-white/8 p-3 text-[10px] text-text-secondary overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(display, null, 2)}
            </pre>
          ) : null}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
