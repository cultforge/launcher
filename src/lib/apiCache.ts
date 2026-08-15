import { getPreference, setPreference } from "./persistentStore";

type CacheEnvelope<T> = {
  savedAt: number;
  data: T;
};

const INDEX_KEY = "api.cache.__keys";

async function listKeys(): Promise<string[]> {
  const keys = await getPreference<string[]>(INDEX_KEY);
  return Array.isArray(keys) ? keys : [];
}

async function trackKey(key: string): Promise<void> {
  const keys = await listKeys();
  if (keys.includes(key)) return;
  await setPreference(INDEX_KEY, [...keys, key]);
}

/** Read a cached payload if present and not older than maxAgeMs (default: forever). */
export async function readApiCache<T>(
  key: string,
  maxAgeMs?: number,
): Promise<T | undefined> {
  const envelope = await getPreference<CacheEnvelope<T>>(key);
  if (!envelope || typeof envelope !== "object" || envelope.data === undefined) {
    return undefined;
  }
  if (
    typeof maxAgeMs === "number" &&
    maxAgeMs >= 0 &&
    Date.now() - (envelope.savedAt || 0) > maxAgeMs
  ) {
    return undefined;
  }
  return envelope.data;
}

/** Persist a read payload. Never use this for mutation/control responses. */
export async function writeApiCache(key: string, data: unknown): Promise<void> {
  const envelope: CacheEnvelope<unknown> = {
    savedAt: Date.now(),
    data,
  };
  await setPreference(key, envelope);
  await trackKey(key);
}

export async function invalidateApiCache(
  match: string | RegExp | ((key: string) => boolean),
): Promise<void> {
  const keys = await listKeys();
  const next: string[] = [];
  for (const key of keys) {
    const hit =
      typeof match === "string"
        ? key === match || key.startsWith(match)
        : match instanceof RegExp
          ? match.test(key)
          : match(key);
    if (hit) {
      await setPreference(key, null);
    } else {
      next.push(key);
    }
  }
  await setPreference(INDEX_KEY, next);
}

/**
 * Cache-aside read helper.
 * - Returns cached data immediately when available (stale-while-revalidate optional).
 * - Always refreshes from `fetcher` (live), then writes cache.
 * - Mutations must NOT use this — call sendMutate and invalidate instead.
 */
export async function cachedRead<T>(opts: {
  key: string;
  fetcher: () => Promise<T>;
  /** Soft max age for accepting cache as the returned value before refresh. */
  maxAgeMs?: number;
  /** If true, return cache first then refresh in background via onRefresh. */
  preferCache?: boolean;
  onRefresh?: (data: T) => void;
}): Promise<{ data: T; fromCache: boolean }> {
  const cached = await readApiCache<T>(opts.key, opts.maxAgeMs);
  if (opts.preferCache && cached !== undefined) {
    void opts
      .fetcher()
      .then(async (fresh) => {
        await writeApiCache(opts.key, fresh);
        opts.onRefresh?.(fresh);
      })
      .catch(() => {
        /* keep cache */
      });
    return { data: cached, fromCache: true };
  }

  try {
    const fresh = await opts.fetcher();
    await writeApiCache(opts.key, fresh);
    return { data: fresh, fromCache: false };
  } catch (err) {
    if (cached !== undefined) {
      return { data: cached, fromCache: true };
    }
    throw err;
  }
}

export const CacheKeys = {
  guildCards: "cache.guilds.cards",
  guildManifest: (id: string) => `cache.guilds.manifest.${id}`,
  guildMembers: (id: string) => `cache.guilds.members.${id}`,
  guildNews: (id: string) => `cache.guilds.news.${id}`,
  guildEvents: (id: string) => `cache.guilds.events.${id}`,
  guildBuilds: (id: string) => `cache.guilds.builds.${id}`,
  guildChannels: (id: string) => `cache.guilds.channels.${id}`,
  channelMessages: (id: string) => `cache.guilds.channel.messages.${id}`,
  guildDiscover: "cache.guilds.discover",
  guildSnapshot: "cache.guilds.snapshot",
  notifications: "cache.api.notifications",
  pendingInvites: "cache.invite.pending",
  dmConversations: "cache.api.dm.conversations",
  dmHistory: (peerId: string) => `cache.api.dm.history.${peerId}`,
  globalChatHistory: "cache.api.chat.global",
  guildServers: (id: string) => `cache.guilds.servers.${id}`,
  guildRoles: (id: string) => `cache.guilds.roles.${id}`,
  guildRankings: (id: string) => `cache.guilds.rankings.${id}`,
  guildForms: (id: string) => `cache.guilds.forms.${id}`,
  guildHotfixes: (id: string) => `cache.guilds.hotfixes.${id}`,
  globalHotUpdates: "cache.api.updates",
} as const;

export async function invalidateGuildCaches(guildId?: string): Promise<void> {
  if (guildId) {
    await invalidateApiCache(`cache.guilds.manifest.${guildId}`);
    await invalidateApiCache(`cache.guilds.members.${guildId}`);
    await invalidateApiCache(`cache.guilds.news.${guildId}`);
    await invalidateApiCache(`cache.guilds.events.${guildId}`);
    await invalidateApiCache(`cache.guilds.builds.${guildId}`);
    await invalidateApiCache(`cache.guilds.channels.${guildId}`);
    await invalidateApiCache(`cache.guilds.servers.${guildId}`);
    await invalidateApiCache(`cache.guilds.roles.${guildId}`);
  }
  await invalidateApiCache(CacheKeys.guildCards);
  await invalidateApiCache(CacheKeys.guildDiscover);
  await invalidateApiCache(CacheKeys.guildSnapshot);
}
