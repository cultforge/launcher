import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRequest } from "../lib/adminApi";
import { extractRows } from "../lib/adminParse";
import { entriesForSection, pickListEndpoint, resolvePathTemplate } from "../lib/adminCatalog";
import { useAdminSessionStore } from "../stores/adminSession";
import { ClientHttpError } from "../lib/client";

export type FlatSession = Record<string, unknown> & {
  id: number | string;
  user_id: string;
  username?: string;
  status: string;
};

function sessionStatus(row: Record<string, unknown>): string {
  if (row.is_revoked === true) return "revoked";
  const exp = row.expires_at;
  if (typeof exp === "string") {
    const d = new Date(exp);
    if (!Number.isNaN(d.getTime()) && d.getTime() < Date.now()) return "expired";
  }
  return "active";
}

export function useAdminSessionsAggregate(selectedUserId: string | null) {
  const groupedCatalog = useAdminSessionStore((s) => s.groupedCatalog);
  const handleUnauthorized = useAdminSessionStore((s) => s.handleCapabilityUnauthorized);

  const usersEndpoint = useMemo(() => {
    if (!groupedCatalog) return null;
    const entries = entriesForSection(groupedCatalog, "users");
    return pickListEndpoint("users", entries);
  }, [groupedCatalog]);

  const sessionsListPath = useMemo(() => {
    if (!groupedCatalog) return null;
    const entries = entriesForSection(groupedCatalog, "users");
    return (
      entries.find(
        (e) =>
          e.method === "GET" &&
          e.path.includes("/users/") &&
          e.path.includes("/sessions"),
      )?.path ?? "/v1/admin/users/{id}/sessions"
    );
  }, [groupedCatalog]);

  const authOverviewPath = useMemo(() => {
    if (!groupedCatalog) return null;
    const entries = entriesForSection(groupedCatalog, "auth");
    const ep = entries.find(
      (e) => e.method === "GET" && e.path === "/v1/admin/auth/overview",
    );
    return ep?.path ?? null;
  }, [groupedCatalog]);

  const [sessions, setSessions] = useState<FlatSession[]>([]);
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchWarnings, setFetchWarnings] = useState<string | null>(null);
  const [loadedUserLabel, setLoadedUserLabel] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    if (!authOverviewPath) return;
    try {
      const overview = await adminRequest({ method: "GET", path: authOverviewPath });
      const obj = overview && typeof overview === "object" ? (overview as Record<string, unknown>) : {};
      const data = obj.data && typeof obj.data === "object" ? obj.data : obj;
      const count = (data as Record<string, unknown>).active_sessions;
      if (typeof count === "number") setActiveCount(count);
    } catch {
      /* optional KPI */
    }
  }, [authOverviewPath]);

  const loadSessionsForUser = useCallback(
    async (userId: string, label?: string) => {
      if (!userId.trim()) {
        setError("Select a user to load sessions.");
        return;
      }

      setLoading(true);
      setError(null);
      setFetchWarnings(null);
      setLoadedUserLabel(label ?? userId);

      try {
        const path = sessionsListPath
          ? resolvePathTemplate(sessionsListPath, { id: userId, user_id: userId })
          : `/v1/admin/users/${encodeURIComponent(userId)}/sessions`;

        const raw = await adminRequest({
          method: "GET",
          path,
          query: { include_revoked: "true" },
        });
        const rows = extractRows(raw);
        const flat: FlatSession[] = rows.map((row) => ({
          ...row,
          user_id: userId,
          username: label ?? userId,
          status: sessionStatus(row),
        })) as FlatSession[];

        flat.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
        setSessions(flat);
      } catch (err: unknown) {
        if (err instanceof ClientHttpError && err.status === 401) {
          handleUnauthorized();
        }
        const msg =
          err instanceof ClientHttpError && err.status === 403
            ? "Could not load sessions (403). Step up again or restart the sidecar after catalog path fixes."
            : err instanceof Error
              ? err.message
              : "Failed to load sessions";
        setError(msg);
        setSessions([]);
      } finally {
        setLoading(false);
      }
    },
    [sessionsListPath, handleUnauthorized],
  );

  useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    if (selectedUserId) {
      void loadSessionsForUser(selectedUserId);
    } else {
      setSessions([]);
      setLoadedUserLabel(null);
      setError(null);
      setFetchWarnings(null);
    }
  }, [selectedUserId, loadSessionsForUser]);

  return {
    usersEndpoint,
    sessions,
    activeCount,
    loading,
    error,
    fetchWarnings,
    loadedUserLabel,
    refetch: () =>
      selectedUserId ? loadSessionsForUser(selectedUserId, loadedUserLabel ?? undefined) : fetchOverview(),
    loadSessionsForUser,
  };
}
