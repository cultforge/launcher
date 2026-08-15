import { ClientHttpError, send, sendMutate } from "./client";
import type { AlertItem, AlertKind } from "../data/alerts";
import {
  CacheKeys,
  cachedRead,
  invalidateApiCache,
} from "./apiCache";

export class CultApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "CultApiError";
    this.status = status;
  }
}

function wrap(prefix: string, err: unknown): CultApiError {
  if (err instanceof ClientHttpError) {
    return new CultApiError(`${prefix}: ${err.message}`, err.status);
  }
  if (err instanceof CultApiError) return err;
  return new CultApiError(
    `${prefix}: ${err instanceof Error ? err.message : String(err)}`,
  );
}

function asRecord(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : null;
}

function unwrapList(data: unknown, keys: string[]): unknown[] {
  if (Array.isArray(data)) return data;
  const obj = asRecord(data);
  if (!obj) return [];
  for (const key of keys) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  return [];
}

export type RemoteNotification = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body?: string | null;
  payload?: Record<string, unknown>;
  is_read?: boolean;
  created_at?: string;
};

export type PendingInvite = {
  code: string;
  guild_id: string;
  guild_name: string;
  guild_icon_url?: string | null;
  creator_id: string;
  expires_at?: string | null;
  invite_url: string;
  notification_id?: string | null;
};

export type DiscoverGuildCard = {
  id: string;
  name: string;
  description?: string | null;
  icon_url?: string | null;
  banner_url?: string | null;
  member_count?: number;
  is_publicly_listed?: boolean;
  is_featured?: boolean;
  tags?: string[];
  server_count?: number;
  build_count?: number;
  share_url?: string;
  deep_link?: string;
};

function kindFromRemote(kind: string): AlertKind {
  const k = kind.toLowerCase();
  if (k.startsWith("invite") || k.startsWith("friend") || k.startsWith("social")) {
    return "Social";
  }
  if (k.startsWith("build") || k.startsWith("update") || k.startsWith("mod")) {
    return "Updates";
  }
  return "System";
}

function formatWhen(iso?: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.floor((Date.now() - t) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  return new Date(iso).toLocaleDateString();
}

export function alertFromNotification(n: RemoteNotification): AlertItem {
  return {
    id: n.id,
    kind: kindFromRemote(n.kind),
    title: n.title,
    body: n.body?.trim() || "",
    time: formatWhen(n.created_at),
    unread: !n.is_read,
  };
}

/** GET /v1/notifications */
export async function fetchMyNotifications(opts?: {
  unreadOnly?: boolean;
  limit?: number;
}): Promise<RemoteNotification[]> {
  try {
    const params: Record<string, string> = {};
    if (opts?.unreadOnly) params.unread_only = "true";
    if (opts?.limit) params.limit = String(opts.limit);
    const cacheKey = `${CacheKeys.notifications}:${opts?.unreadOnly ? "u" : "a"}:${opts?.limit ?? 50}`;
    const { data } = await cachedRead({
      key: cacheKey,
      fetcher: async () => {
        const raw = await send<unknown>("api", "list_my_notifications", params);
        return unwrapList(raw, ["data", "items", "notifications"])
          .map((row) => {
            const obj = asRecord(row) ?? {};
            return {
              id: String(obj.id ?? ""),
              user_id: String(obj.user_id ?? ""),
              kind: String(obj.kind ?? "system"),
              title: String(obj.title ?? "Notification"),
              body: typeof obj.body === "string" ? obj.body : null,
              payload:
                obj.payload && typeof obj.payload === "object"
                  ? (obj.payload as Record<string, unknown>)
                  : {},
              is_read: Boolean(obj.is_read),
              created_at:
                typeof obj.created_at === "string" ? obj.created_at : undefined,
            };
          })
          .filter((n) => n.id);
      },
    });
    return data;
  } catch (err) {
    throw wrap("Could not load notifications", err);
  }
}

/** POST /v1/notifications/{id}/read */
export async function markNotificationRead(
  notificationId: string,
): Promise<void> {
  try {
    await sendMutate(
      "api",
      "mark_notification_read",
      { notification_id: notificationId },
      "POST",
    );
    await invalidateApiCache("cache.api.notifications");
  } catch (err) {
    throw wrap("Could not mark notification read", err);
  }
}

/** POST /v1/notifications/read-all */
export async function markAllNotificationsRead(): Promise<void> {
  try {
    await sendMutate("api", "mark_all_notifications_read", {}, "POST");
    await invalidateApiCache("cache.api.notifications");
  } catch (err) {
    throw wrap("Could not mark notifications read", err);
  }
}

/** GET /v1/invites/me/pending */
export async function fetchPendingCuratedInvites(): Promise<PendingInvite[]> {
  try {
    const { data } = await cachedRead({
      key: CacheKeys.pendingInvites,
      fetcher: async () => {
        const raw = await send<unknown>(
          "invite",
          "pending_curated_invites_for_me",
        );
        return unwrapList(raw, ["data", "items", "invites"])
          .map((row) => {
            const obj = asRecord(row) ?? {};
            const code = String(obj.code ?? "");
            return {
              code,
              guild_id: String(obj.guild_id ?? ""),
              guild_name: String(obj.guild_name ?? "Guild"),
              guild_icon_url:
                typeof obj.guild_icon_url === "string"
                  ? obj.guild_icon_url
                  : null,
              creator_id: String(obj.creator_id ?? ""),
              expires_at:
                typeof obj.expires_at === "string" ? obj.expires_at : null,
              invite_url:
                typeof obj.invite_url === "string" && obj.invite_url
                  ? obj.invite_url
                  : code
                    ? `https://invite.cultforge.com/${code}`
                    : "",
              notification_id:
                typeof obj.notification_id === "string"
                  ? obj.notification_id
                  : null,
            };
          })
          .filter((i) => i.code);
      },
    });
    return data;
  } catch (err) {
    throw wrap("Could not load pending invites", err);
  }
}

/** POST /v1/invites/{code}/accept */
export async function acceptGuildInvite(
  code: string,
  nickname?: string,
): Promise<unknown> {
  try {
    const result = await sendMutate(
      "invite",
      "accept_invite",
      {
        code,
        ...(nickname ? { nickname } : {}),
      },
      "POST",
    );
    await invalidateApiCache(CacheKeys.pendingInvites);
    await invalidateApiCache("cache.api.notifications");
    await invalidateApiCache("cache.guilds.");
    return result;
  } catch (err) {
    throw wrap("Could not accept invite", err);
  }
}

/** GET /v1/guilds/discover */
export async function fetchDiscoverableGuilds(
  limit = 50,
): Promise<DiscoverGuildCard[]> {
  try {
    const { data } = await cachedRead({
      key: `${CacheKeys.guildDiscover}:${limit}`,
      fetcher: async () => {
        const raw = await send<unknown>(
          "guilds",
          "list_publicly_listed_guilds",
          {
            limit: String(limit),
          },
        );
        return unwrapList(raw, ["data", "items", "guilds"])
          .map((row) => {
            const obj = asRecord(row) ?? {};
            return {
              id: String(obj.id ?? ""),
              name: String(obj.name ?? "Guild"),
              description:
                typeof obj.description === "string" ? obj.description : null,
              icon_url: typeof obj.icon_url === "string" ? obj.icon_url : null,
              banner_url:
                typeof obj.banner_url === "string" ? obj.banner_url : null,
              member_count:
                typeof obj.member_count === "number" ? obj.member_count : 0,
              is_publicly_listed: Boolean(obj.is_publicly_listed ?? true),
            };
          })
          .filter((g) => g.id);
      },
    });
    return data;
  } catch (err) {
    throw wrap("Could not load discoverable guilds", err);
  }
}
