import { ClientHttpError, send, sendMutate } from "./client";
import {
  CacheKeys,
  cachedRead,
  invalidateApiCache,
} from "./apiCache";

export class HotUpdatesError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "HotUpdatesError";
    this.status = status;
  }
}

export type HotUpdate = {
  id: string;
  scope: string;
  guildId?: string | null;
  title: string;
  body: string;
  severity: string;
  channel: string;
  isPublished: boolean;
  publishedAt?: string;
};

function wrap(prefix: string, err: unknown): HotUpdatesError {
  if (err instanceof ClientHttpError) {
    return new HotUpdatesError(`${prefix}: ${err.message}`, err.status);
  }
  if (err instanceof HotUpdatesError) return err;
  return new HotUpdatesError(
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

function unwrapOne(data: unknown, keys: string[]): unknown {
  const obj = asRecord(data);
  if (!obj) return data;
  for (const key of keys) {
    if (obj[key] !== undefined) return obj[key];
  }
  return data;
}

export function hotUpdateFromApi(raw: unknown): HotUpdate | null {
  const obj = asRecord(raw);
  if (!obj || typeof obj.id !== "string") return null;
  return {
    id: obj.id,
    scope: String(obj.scope ?? "global"),
    guildId: typeof obj.guild_id === "string" ? obj.guild_id : null,
    title: String(obj.title ?? "Update"),
    body: String(obj.body ?? ""),
    severity: String(obj.severity ?? "info"),
    channel: String(obj.channel ?? "hotfix"),
    isPublished: obj.is_published !== false,
    publishedAt:
      typeof obj.published_at === "string" ? obj.published_at : undefined,
  };
}

export async function fetchGlobalHotUpdates(): Promise<HotUpdate[]> {
  try {
    const { data } = await cachedRead({
      key: CacheKeys.globalHotUpdates,
      fetcher: async () => {
        const raw = await send<unknown>(
          "api",
          "list_global_launcher_hot_updates_/_hotfixes",
        );
        return unwrapList(raw, ["data", "updates", "items"])
          .map(hotUpdateFromApi)
          .filter((x): x is HotUpdate => Boolean(x));
      },
    });
    return data;
  } catch (err) {
    throw wrap("Could not load launcher updates", err);
  }
}

export async function fetchGuildHotfixes(
  guildId: string,
): Promise<HotUpdate[]> {
  try {
    const { data } = await cachedRead({
      key: CacheKeys.guildHotfixes(guildId),
      fetcher: async () => {
        const raw = await send<unknown>(
          "guilds",
          "list_guild_hotfixes_/_hot_updates",
          { guild_id: guildId },
        );
        return unwrapList(raw, ["data", "updates", "items"])
          .map(hotUpdateFromApi)
          .filter((x): x is HotUpdate => Boolean(x));
      },
    });
    return data;
  } catch (err) {
    throw wrap("Could not load guild hotfixes", err);
  }
}

export async function publishGuildHotfix(
  guildId: string,
  input: {
    title: string;
    body: string;
    severity?: string;
    channel?: string;
  },
): Promise<HotUpdate> {
  try {
    const data = await sendMutate(
      "guilds",
      "publish_guild_hotfix",
      {
        guild_id: guildId,
        title: input.title,
        body: input.body,
        severity: input.severity ?? "info",
        channel: input.channel ?? "hotfix",
        is_published: true,
      },
      "POST",
    );
    await invalidateApiCache(CacheKeys.guildHotfixes(guildId));
    const row = hotUpdateFromApi(unwrapOne(data, ["data", "update"]));
    if (!row) throw new HotUpdatesError("Publish hotfix response malformed", 502);
    return row;
  } catch (err) {
    throw wrap("Could not publish hotfix", err);
  }
}
