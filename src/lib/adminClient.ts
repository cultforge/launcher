/**
 * Explicit platform AdminClient — not registered via public schema/manifest.
 * All traffic goes through sidecar `/admin/*` (capability memory lives in client.py).
 */
import {
  adminRequest,
  adminStepUp,
  fetchAdminCatalog,
  fetchAdminWhoami,
  type AdminCatalogEntry,
  type AdminLocalStatus,
  type AdminStepUpHints,
  type AdminWhoami,
} from "./adminApi";
import { ClientHttpError } from "./client";

export type {
  AdminCatalogEntry,
  AdminLocalStatus,
  AdminStepUpHints,
  AdminWhoami,
};

function asRecord(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : null;
}

/** Unwrap `{ status, data }` admin envelopes. */
export function unwrapAdminData<T = unknown>(raw: unknown): T {
  const obj = asRecord(raw);
  if (!obj) return raw as T;
  if ("data" in obj) return obj.data as T;
  return raw as T;
}

export function extractAdminRows(raw: unknown): Record<string, unknown>[] {
  const data = unwrapAdminData(raw);
  if (Array.isArray(data)) {
    return data.filter(
      (r): r is Record<string, unknown> => Boolean(r && typeof r === "object"),
    );
  }
  const obj = asRecord(data);
  if (!obj) return [];
  for (const key of ["items", "rows", "results", "users", "guilds", "invites", "reports", "updates", "sessions", "entries", "limits", "notifications", "events"]) {
    const list = obj[key];
    if (Array.isArray(list)) {
      return list.filter(
        (r): r is Record<string, unknown> => Boolean(r && typeof r === "object"),
      );
    }
  }
  return [];
}

function buildQuery(
  query?: Record<string, string | number | boolean | null | undefined>,
): Record<string, string> | undefined {
  if (!query) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) {
    if (v == null || v === "") continue;
    out[k] = String(v);
  }
  return Object.keys(out).length ? out : undefined;
}

function fillPath(template: string, params?: Record<string, string>): string {
  let path = template;
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      path = path.replace(`{${key}}`, encodeURIComponent(value));
    }
  }
  return path;
}

export type CapabilityBadgeState = "active" | "needs_step_up" | "expired" | "relogin";

export function capabilityBadgeState(opts: {
  capabilityActive: boolean;
  capabilityExpiresAt: number | null;
  sessionFreshEnough: boolean | null;
}): CapabilityBadgeState {
  if (opts.sessionFreshEnough === false && !opts.capabilityActive) {
    return "relogin";
  }
  if (opts.capabilityActive) {
    if (
      opts.capabilityExpiresAt != null &&
      opts.capabilityExpiresAt <= Date.now()
    ) {
      return "expired";
    }
    return "active";
  }
  if (
    opts.capabilityExpiresAt != null &&
    opts.capabilityExpiresAt <= Date.now()
  ) {
    return "expired";
  }
  return "needs_step_up";
}

export const AdminClient = {
  whoami: fetchAdminWhoami,
  catalog: fetchAdminCatalog,
  stepUp: adminStepUp,

  async get(
    path: string,
    query?: Record<string, string | number | boolean | null | undefined>,
  ): Promise<unknown> {
    return adminRequest({
      method: "GET",
      path,
      query: buildQuery(query),
    });
  },

  async mutate(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    query?: Record<string, string | number | boolean | null | undefined>,
  ): Promise<unknown> {
    return adminRequest({
      method: method.toUpperCase(),
      path,
      body,
      query: buildQuery(query),
    });
  },

  // —— Route map helpers ——

  metricsLive: () => AdminClient.get("/v1/admin/metrics/live"),
  metricsServices: () => AdminClient.get("/v1/admin/metrics/services"),
  chloeOverview: () => AdminClient.get("/v1/admin/chloe/overview"),

  listUsers: (query?: Record<string, string | number | boolean | null | undefined>) =>
    AdminClient.get("/v1/admin/users", query),
  getUser: (id: string) =>
    AdminClient.get(fillPath("/v1/admin/users/{id}", { id })),
  banUser: (id: string, body?: Record<string, unknown>) =>
    AdminClient.mutate("POST", fillPath("/v1/admin/users/{id}/ban", { id }), body),
  unbanUser: (id: string) =>
    AdminClient.mutate("POST", fillPath("/v1/admin/users/{id}/unban", { id })),
  setUserRoles: (
    id: string,
    body: { grant_admin?: boolean; revoke_admin?: boolean },
  ) =>
    AdminClient.mutate("PUT", fillPath("/v1/admin/users/{id}/roles", { id }), body),
  listUserSessions: (id: string) =>
    AdminClient.get(fillPath("/v1/admin/users/{id}/sessions", { id })),
  revokeAllUserSessions: (id: string) =>
    AdminClient.mutate(
      "POST",
      fillPath("/v1/admin/users/{id}/sessions/revoke-all", { id }),
    ),
  revokeSession: (sessionId: string) =>
    AdminClient.mutate(
      "POST",
      fillPath("/v1/admin/sessions/{session_id}/revoke", {
        session_id: sessionId,
      }),
    ),

  listAudit: (query?: Record<string, string | number | boolean | null | undefined>) =>
    AdminClient.get("/v1/admin/audit", query),

  listNotificationsRecent: () =>
    AdminClient.get("/v1/admin/notifications/recent"),
  sendNotification: (body: Record<string, unknown>) =>
    AdminClient.mutate("POST", "/v1/admin/notifications", body),
  sendMail: (body: Record<string, unknown>) =>
    AdminClient.mutate("POST", "/v1/admin/mail", body),

  listRateLimits: () => AdminClient.get("/v1/admin/rate-limits"),
  createRateLimit: (body: Record<string, unknown>) =>
    AdminClient.mutate("POST", "/v1/admin/rate-limits", body),
  deleteRateLimit: (id: string) =>
    AdminClient.mutate(
      "DELETE",
      fillPath("/v1/admin/rate-limits/{id}", { id }),
    ),

  listReports: () => AdminClient.get("/v1/admin/reports"),
  getReport: (id: string) =>
    AdminClient.get(fillPath("/v1/admin/reports/{id}", { id })),
  runReport: (body: Record<string, unknown>) =>
    AdminClient.mutate("POST", "/v1/admin/reports/run", body),

  getChloeQuota: (userId: string) =>
    AdminClient.get(
      fillPath("/v1/admin/chloe/quota/{user_id}", { user_id: userId }),
    ),
  setChloeQuota: (userId: string, body: Record<string, unknown>) =>
    AdminClient.mutate(
      "PUT",
      fillPath("/v1/admin/chloe/quota/{user_id}", { user_id: userId }),
      body,
    ),
  expireChloeAction: (id: string) =>
    AdminClient.mutate(
      "POST",
      fillPath("/v1/admin/chloe/actions/{id}/expire", { id }),
    ),

  listUpdates: () => AdminClient.get("/v1/admin/updates"),
  createUpdate: (body: Record<string, unknown>) =>
    AdminClient.mutate("POST", "/v1/admin/updates", body),

  authOverview: () => AdminClient.get("/v1/admin/auth/overview"),
  revokeUserAuthSessions: (userId: string) =>
    AdminClient.mutate("POST", "/v1/admin/auth/sessions/revoke-user", {
      user_id: userId,
    }),

  listInvites: (query?: Record<string, string | number | boolean | null | undefined>) =>
    AdminClient.get("/v1/admin/invites", query),
  revokeInvite: (code: string) =>
    AdminClient.mutate(
      "POST",
      fillPath("/v1/admin/invites/{code}/revoke", { code }),
    ),

  listGuilds: (query?: Record<string, string | number | boolean | null | undefined>) =>
    AdminClient.get("/v1/admin/guilds", query),
  getGuild: (id: string) =>
    AdminClient.get(fillPath("/v1/admin/guilds/{id}", { id })),
  unlistGuild: (id: string) =>
    AdminClient.mutate("POST", fillPath("/v1/admin/guilds/{id}/unlist", { id })),
  setGuildFlags: (id: string, body: Record<string, unknown>) =>
    AdminClient.mutate(
      "POST",
      fillPath("/v1/admin/guilds/{id}/flags", { id }),
      body,
    ),
};

export function isAdminCapabilityError(err: unknown): boolean {
  return err instanceof ClientHttpError && (err.status === 401 || err.status === 403);
}

export { fillPath as fillAdminPath };
