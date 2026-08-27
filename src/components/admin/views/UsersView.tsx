import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AdminClient,
  extractAdminRows,
  isAdminCapabilityError,
  unwrapAdminData,
} from "../../../lib/adminClient";
import { useAdminSessionStore } from "../../../stores/adminSession";
import { useAdminRouteStore } from "../../../stores/adminRoute";
import {
  OpsButton,
  OpsConfirmDialog,
  OpsDrawer,
  OpsEmpty,
  OpsError,
  OpsInput,
  OpsPageHeader,
  OpsSelect,
  OpsTable,
  OpsToolbar,
  OpsStatusPill,
  type OpsColumn,
} from "../ui/ops";
import { OpsJsonBlock } from "../ui/OpsJsonBlock";
import {
  formatRelativeTime,
  userDisplayName,
} from "../../../lib/adminFormatters";
import { CopyButton } from "../../CopyButton";

type UserRow = Record<string, unknown> & { id: string };

function rowId(r: Record<string, unknown>): string {
  return String(r.id ?? r.user_id ?? r.uuid ?? "");
}

export function UsersView() {
  const capabilityActive = useAdminSessionStore((s) => s.capabilityActive);
  const handleUnauthorized = useAdminSessionStore(
    (s) => s.handleCapabilityUnauthorized,
  );
  const detailId = useAdminRouteStore((s) => s.detailId);
  const setDetailId = useAdminRouteStore((s) => s.setDetailId);

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [sessions, setSessions] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | {
    title: string;
    body: string;
    confirmText?: string;
    run: () => Promise<void>;
  }>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query: Record<string, string | number | boolean> = { limit: 100, q };
      if (filter === "banned") query.banned = true;
      if (filter === "admin") query.admin = true;
      const raw = await AdminClient.listUsers(query);
      const list = extractAdminRows(raw)
        .map((r) => ({ ...r, id: rowId(r) }))
        .filter((r) => r.id);
      setRows(list as UserRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [q, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (id: string) => {
    setDetailId(id);
    setDetail(null);
    setSessions([]);
    try {
      const [u, s] = await Promise.all([
        AdminClient.getUser(id),
        AdminClient.listUserSessions(id).catch(() => null),
      ]);
      const data = unwrapAdminData(u);
      setDetail(
        (data && typeof data === "object"
          ? (data as Record<string, unknown>)
          : null) ?? { id },
      );
      setSessions(extractAdminRows(s));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load user");
    }
  };

  useEffect(() => {
    if (detailId) void openDetail(detailId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailId]);

  const runMutate = async (fn: () => Promise<unknown>, okMsg: string) => {
    if (!capabilityActive) {
      toast.error("Step up required for this action.");
      return;
    }
    setBusy(true);
    try {
      await fn();
      toast.success(okMsg);
      setConfirm(null);
      await load();
      if (detailId) await openDetail(detailId);
    } catch (err) {
      if (isAdminCapabilityError(err)) handleUnauthorized();
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const columns: OpsColumn<UserRow>[] = useMemo(
    () => [
      {
        key: "name",
        header: "User",
        render: (r) => (
          <div>
            <div className="text-text-primary font-medium">
              {userDisplayName(r)}
            </div>
            <div className="font-mono text-[10px] text-text-disabled">{r.id}</div>
          </div>
        ),
      },
      {
        key: "email",
        header: "Email",
        render: (r) => (
          <span className="text-[11px]">{String(r.email ?? "—")}</span>
        ),
      },
      {
        key: "account",
        header: "Account",
        render: (r) => (
          <span className="text-[11px] capitalize">
            {String(r.account_type ?? r.type ?? "—")}
          </span>
        ),
      },
      {
        key: "joined",
        header: "Joined",
        render: (r) => (
          <span className="text-[11px] text-text-muted">
            {formatRelativeTime(r.created_at ?? r.joined_at) || "—"}
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (r) =>
          r.is_banned || r.banned ? (
            <OpsStatusPill state="err" label="Banned" />
          ) : r.is_active === false ? (
            <OpsStatusPill state="warn" label="Inactive" />
          ) : (
            <OpsStatusPill state="ok" label="Active" />
          ),
      },
      {
        key: "role",
        header: "Role",
        render: (r) => {
          const roles = Array.isArray(r.roles)
            ? r.roles.map(String).join(", ")
            : "";
          return (
            <span className="text-[11px]">
              {roles ||
                String(r.ext_rank ?? r.role ?? (r.admin ? "admin" : "—"))}
            </span>
          );
        },
      },
    ],
    [],
  );

  return (
    <div>
      <OpsPageHeader
        title="Users"
        subtitle="Search accounts, moderate, manage roles and sessions."
      />
      <OpsToolbar>
        <OpsInput
          placeholder="Search name, email, or id"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-56"
          onKeyDown={(e) => {
            if (e.key === "Enter") void load();
          }}
        />
        <OpsSelect
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All</option>
          <option value="banned">Banned</option>
          <option value="admin">Admins</option>
        </OpsSelect>
        <OpsButton variant="primary" onClick={() => void load()} disabled={loading}>
          {loading ? "…" : "Search"}
        </OpsButton>
      </OpsToolbar>
      {error ? <OpsError message={error} onRetry={() => void load()} /> : null}
      <OpsTable
        columns={columns}
        rows={rows}
        onRowClick={(r) => void openDetail(r.id)}
        empty={loading ? "Loading…" : "No users"}
      />

      <OpsDrawer
        open={Boolean(detailId)}
        title="User detail"
        onClose={() => {
          setDetailId(null);
          setDetail(null);
        }}
        widthClass="max-w-xl"
      >
        {!detail ? (
          <OpsEmpty title="Loading…" />
        ) : (
          <div className="space-y-4">
            <div>
              <div className="font-sora text-[15px] font-bold text-text-primary">
                {userDisplayName(detail)}
              </div>
              <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-text-muted">
                <span>{detailId}</span>
                <CopyButton
                  text={String(detailId ?? "")}
                  label="Copy id"
                  className="py-0.5"
                />
              </div>
              <div className="mt-1 text-[12px] text-text-secondary">
                {String(detail.email ?? "")}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <OpsButton
                variant="danger"
                disabled={!capabilityActive}
                onClick={() =>
                  setConfirm({
                    title: "Ban user",
                    body: "This user will lose access until unbanned.",
                    confirmText: "ban",
                    run: () =>
                      runMutate(
                        () => AdminClient.banUser(detailId!),
                        "User banned",
                      ),
                  })
                }
              >
                Ban
              </OpsButton>
              <OpsButton
                disabled={!capabilityActive}
                onClick={() =>
                  void runMutate(
                    () => AdminClient.unbanUser(detailId!),
                    "User unbanned",
                  )
                }
              >
                Unban
              </OpsButton>
              <OpsButton
                disabled={!capabilityActive}
                onClick={() =>
                  setConfirm({
                    title: "Grant platform admin",
                    body: "This grants full platform admin role.",
                    confirmText: "grant",
                    run: () =>
                      runMutate(
                        () =>
                          AdminClient.setUserRoles(detailId!, {
                            grant_admin: true,
                          }),
                        "Admin granted",
                      ),
                  })
                }
              >
                Grant admin
              </OpsButton>
              <OpsButton
                variant="danger"
                disabled={!capabilityActive}
                onClick={() =>
                  setConfirm({
                    title: "Revoke platform admin",
                    body: "Cannot strip the last platform admin.",
                    confirmText: "revoke",
                    run: () =>
                      runMutate(
                        () =>
                          AdminClient.setUserRoles(detailId!, {
                            revoke_admin: true,
                          }),
                        "Admin revoked",
                      ),
                  })
                }
              >
                Revoke admin
              </OpsButton>
              <OpsButton
                variant="danger"
                disabled={!capabilityActive}
                onClick={() =>
                  setConfirm({
                    title: "Revoke all sessions",
                    body: "Signs this user out everywhere.",
                    confirmText: "revoke-all",
                    run: () =>
                      runMutate(
                        () => AdminClient.revokeAllUserSessions(detailId!),
                        "Sessions revoked",
                      ),
                  })
                }
              >
                Revoke all sessions
              </OpsButton>
            </div>
            <div>
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-disabled">
                Sessions
              </h4>
              {!sessions.length ? (
                <OpsEmpty title="No sessions" />
              ) : (
                <ul className="space-y-1">
                  {sessions.map((s, i) => {
                    const sid = String(
                      s.id ?? s.session_id ?? s.jti ?? i,
                    );
                    const fp = String(
                      s.token_fingerprint ??
                        s.fingerprint ??
                        (typeof s.jti === "string"
                          ? `${s.jti.slice(0, 8)}…`
                          : "—"),
                    );
                    return (
                      <li
                        key={sid}
                        className="flex items-center justify-between gap-2 rounded border border-white/8 px-2 py-1.5"
                      >
                        <span className="min-w-0 flex-1">
                          <div className="text-[11px] text-text-secondary truncate">
                            {String(s.platform ?? s.client ?? s.ua ?? "Session")}
                            {s.ip || s.ip_address
                              ? ` · ${String(s.ip ?? s.ip_address)}`
                              : ""}
                            {s.country ? ` · ${String(s.country)}` : ""}
                          </div>
                          <div className="font-mono text-[10px] text-text-muted truncate">
                            {fp}
                            {s.created_at || s.expires_at
                              ? ` · ${formatRelativeTime(s.created_at ?? s.expires_at)}`
                              : ""}
                          </div>
                        </span>
                        <OpsButton
                          variant="danger"
                          disabled={!capabilityActive}
                          onClick={() =>
                            void runMutate(
                              () => AdminClient.revokeSession(sid),
                              "Session revoked",
                            )
                          }
                        >
                          Revoke
                        </OpsButton>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <OpsJsonBlock value={detail} title="user detail" />
          </div>
        )}
      </OpsDrawer>

      <OpsConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title ?? ""}
        body={confirm?.body ?? ""}
        confirmText={confirm?.confirmText}
        danger
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void confirm?.run()}
      />
    </div>
  );
}
