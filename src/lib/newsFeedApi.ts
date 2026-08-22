import {
  ClientHttpError,
  getClientOrigin,
  sidecarFetch,
} from "./client";
import {
  CacheKeys,
  cachedRead,
  invalidateApiCache,
} from "./apiCache";
import type { DiscoverFilter, NewsStory } from "../data/news";
import { thumbForCategory } from "../data/news";
import type { DiscoverGuildCard } from "./cultApi";

export type LauncherNewsFeedCard = {
  kind: "global" | "guild_news" | string;
  id: string;
  title: string;
  tagline: string | null;
  bodyPreview: string;
  coverUrl: string | null;
  severity: string | null;
  channel: string | null;
  guildId: string | null;
  guildName: string | null;
  isPinned: boolean;
  publishedAt: string;
  deepLink: string;
  shareUrl: string;
};

export type LauncherNewsFeedPage = {
  items: LauncherNewsFeedCard[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  query: string | null;
  kinds: string[];
};

export type GuildDiscoverPage = {
  items: DiscoverGuildCard[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  sort: string;
  query: string | null;
  tag: string | null;
  featuredOnly: boolean;
};

function asRecord(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : null;
}

function unwrapData(raw: unknown): unknown {
  const obj = asRecord(raw);
  if (!obj) return raw;
  return obj.data ?? raw;
}

function wrap(prefix: string, err: unknown): Error {
  if (err instanceof ClientHttpError) {
    return new Error(`${prefix}: ${err.message}`);
  }
  return new Error(
    `${prefix}: ${err instanceof Error ? err.message : String(err)}`,
  );
}

function formatWhen(iso?: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.floor((Date.now() - t) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

function readMinFromPreview(preview: string): number {
  const words = preview.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180) || 1);
}

export function categoryFromFeedCard(
  card: LauncherNewsFeedCard,
): NewsStory["category"] {
  if (card.kind === "guild_news") return "Community";
  const channel = (card.channel ?? "").toLowerCase();
  if (
    channel.includes("pack") ||
    channel.includes("mod") ||
    channel.includes("hotfix")
  ) {
    return "Packs";
  }
  return "Launcher";
}

export function newsStoryFromFeedCard(card: LauncherNewsFeedCard): NewsStory {
  const category = categoryFromFeedCard(card);
  const dek =
    (card.tagline && card.tagline.trim()) ||
    card.bodyPreview.trim() ||
    "Open for details.";
  const slides = [
    card.title,
    ...(card.tagline ? [card.tagline] : []),
    ...(card.bodyPreview ? [card.bodyPreview] : []),
    ...(card.guildName ? [`From ${card.guildName}`] : []),
  ];
  return {
    id: `${card.kind}:${card.id}`,
    title: card.title,
    dek,
    category,
    date: formatWhen(card.publishedAt),
    readMin: readMinFromPreview(card.bodyPreview || dek),
    thumb: card.coverUrl?.trim()
      ? `center / cover no-repeat url("${card.coverUrl.replace(/"/g, '\\"')}")`
      : thumbForCategory(category),
    slides,
    kind: card.kind,
    bodyPreview: card.bodyPreview,
    coverUrl: card.coverUrl,
    deepLink: card.deepLink || undefined,
    shareUrl: card.shareUrl || undefined,
    guildId: card.guildId,
    guildName: card.guildName,
    isPinned: card.isPinned,
    severity: card.severity,
    channel: card.channel,
    publishedAt: card.publishedAt,
  };
}

export function kindsForFilter(filter: DiscoverFilter): string | undefined {
  if (filter === "All" || filter === "Saved" || filter === "Minecraft") {
    return "global,guild_news";
  }
  if (filter === "Launcher" || filter === "Packs") return "global";
  if (filter === "Community") return "guild_news";
  return undefined;
}

function parseFeedCard(row: unknown): LauncherNewsFeedCard | null {
  const obj = asRecord(row);
  if (!obj) return null;
  const id = String(obj.id ?? "").trim();
  const title = String(obj.title ?? "").trim();
  if (!id || !title) return null;
  return {
    kind: String(obj.kind ?? "global"),
    id,
    title,
    tagline: typeof obj.tagline === "string" ? obj.tagline : null,
    bodyPreview: String(obj.body_preview ?? obj.bodyPreview ?? ""),
    coverUrl:
      typeof obj.cover_url === "string"
        ? obj.cover_url
        : typeof obj.coverUrl === "string"
          ? obj.coverUrl
          : null,
    severity: typeof obj.severity === "string" ? obj.severity : null,
    channel: typeof obj.channel === "string" ? obj.channel : null,
    guildId:
      typeof obj.guild_id === "string"
        ? obj.guild_id
        : typeof obj.guildId === "string"
          ? obj.guildId
          : null,
    guildName:
      typeof obj.guild_name === "string"
        ? obj.guild_name
        : typeof obj.guildName === "string"
          ? obj.guildName
          : null,
    isPinned: Boolean(obj.is_pinned ?? obj.isPinned),
    publishedAt: String(obj.published_at ?? obj.publishedAt ?? ""),
    deepLink: String(obj.deep_link ?? obj.deepLink ?? ""),
    shareUrl: String(obj.share_url ?? obj.shareUrl ?? ""),
  };
}

function parseGuildCard(row: unknown): DiscoverGuildCard | null {
  const obj = asRecord(row);
  if (!obj) return null;
  const id = String(obj.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    name: String(obj.name ?? "Guild"),
    description: typeof obj.description === "string" ? obj.description : null,
    icon_url:
      typeof obj.icon_url === "string"
        ? obj.icon_url
        : typeof obj.iconUrl === "string"
          ? obj.iconUrl
          : null,
    banner_url:
      typeof obj.banner_url === "string"
        ? obj.banner_url
        : typeof obj.bannerUrl === "string"
          ? obj.bannerUrl
          : null,
    member_count:
      typeof obj.member_count === "number"
        ? obj.member_count
        : typeof obj.memberCount === "number"
          ? obj.memberCount
          : 0,
    is_publicly_listed: Boolean(obj.is_listed ?? obj.is_publicly_listed ?? true),
    is_featured: Boolean(obj.is_featured ?? obj.isFeatured),
    tags: Array.isArray(obj.tags)
      ? obj.tags.filter((t): t is string => typeof t === "string")
      : [],
    server_count:
      typeof obj.server_count === "number"
        ? obj.server_count
        : typeof obj.serverCount === "number"
          ? obj.serverCount
          : 0,
    build_count:
      typeof obj.build_count === "number"
        ? obj.build_count
        : typeof obj.buildCount === "number"
          ? obj.buildCount
          : 0,
    share_url:
      typeof obj.share_url === "string"
        ? obj.share_url
        : typeof obj.shareUrl === "string"
          ? obj.shareUrl
          : "",
    deep_link:
      typeof obj.deep_link === "string"
        ? obj.deep_link
        : typeof obj.deepLink === "string"
          ? obj.deepLink
          : "",
  };
}

export async function fetchNewsFeed(opts?: {
  query?: string;
  kinds?: string;
  offset?: number;
  limit?: number;
  signal?: AbortSignal;
}): Promise<LauncherNewsFeedPage> {
  const offset = opts?.offset ?? 0;
  const limit = opts?.limit ?? 30;
  const kinds = opts?.kinds ?? "global,guild_news";
  const query = opts?.query?.trim() || "";
  try {
    const { data } = await cachedRead({
      key: `${CacheKeys.newsFeed}:${kinds}:${query}:${offset}:${limit}`,
      fetcher: async () => {
        const origin = await getClientOrigin();
        const params = new URLSearchParams({
          offset: String(offset),
          limit: String(limit),
          kinds,
        });
        if (query) params.set("query", query);
        const res = await sidecarFetch(`${origin}/news/feed?${params}`, {
          method: "GET",
          signal: opts?.signal,
        });
        if (!res.ok) {
          throw new ClientHttpError(res.status, await res.text());
        }
        const raw = unwrapData(await res.json());
        const page = asRecord(raw) ?? {};
        const items = (
          Array.isArray(page.items) ? page.items : []
        )
          .map(parseFeedCard)
          .filter((x): x is LauncherNewsFeedCard => Boolean(x));
        return {
          items,
          total: typeof page.total === "number" ? page.total : items.length,
          offset: typeof page.offset === "number" ? page.offset : offset,
          limit: typeof page.limit === "number" ? page.limit : limit,
          hasMore: Boolean(page.has_more ?? page.hasMore),
          query: typeof page.query === "string" ? page.query : query || null,
          kinds: Array.isArray(page.kinds)
            ? page.kinds.filter((k): k is string => typeof k === "string")
            : kinds.split(","),
        } satisfies LauncherNewsFeedPage;
      },
    });
    return data;
  } catch (err) {
    throw wrap("Could not load news feed", err);
  }
}

export async function fetchGuildDiscover(opts?: {
  query?: string;
  tag?: string;
  sort?: "newest" | "members" | "name" | "featured";
  featured?: boolean;
  offset?: number;
  limit?: number;
  signal?: AbortSignal;
}): Promise<GuildDiscoverPage> {
  const offset = opts?.offset ?? 0;
  const limit = opts?.limit ?? 24;
  const sort = opts?.sort ?? "featured";
  const featured = opts?.featured ?? true;
  const query = opts?.query?.trim() || "";
  const tag = opts?.tag?.trim() || "";
  try {
    const { data } = await cachedRead({
      key: `${CacheKeys.guildDiscover}:${sort}:${featured}:${query}:${tag}:${offset}:${limit}`,
      fetcher: async () => {
        const origin = await getClientOrigin();
        const params = new URLSearchParams({
          sort,
          featured: String(featured),
          offset: String(offset),
          limit: String(limit),
        });
        if (query) params.set("query", query);
        if (tag) params.set("tag", tag);
        const res = await sidecarFetch(`${origin}/guilds/discover?${params}`, {
          method: "GET",
          signal: opts?.signal,
        });
        if (!res.ok) {
          throw new ClientHttpError(res.status, await res.text());
        }
        const raw = unwrapData(await res.json());
        const page = asRecord(raw) ?? {};
        const items = (
          Array.isArray(page.items) ? page.items : []
        )
          .map(parseGuildCard)
          .filter((x): x is DiscoverGuildCard => Boolean(x));
        return {
          items,
          total: typeof page.total === "number" ? page.total : items.length,
          offset: typeof page.offset === "number" ? page.offset : offset,
          limit: typeof page.limit === "number" ? page.limit : limit,
          hasMore: Boolean(page.has_more ?? page.hasMore),
          sort: typeof page.sort === "string" ? page.sort : sort,
          query: typeof page.query === "string" ? page.query : query || null,
          tag: typeof page.tag === "string" ? page.tag : tag || null,
          featuredOnly: Boolean(page.featured_only ?? page.featuredOnly ?? featured),
        } satisfies GuildDiscoverPage;
      },
    });
    return data;
  } catch (err) {
    throw wrap("Could not load guild discover", err);
  }
}

export async function invalidateDiscoverCaches(): Promise<void> {
  await invalidateApiCache(CacheKeys.newsFeed);
  await invalidateApiCache(CacheKeys.guildDiscover);
}
