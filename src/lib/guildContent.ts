import { ClientHttpError, send, sendMutate } from "./client";
import type {
  GuildBodyFormat,
  GuildContentLink,
  GuildEvent,
  GuildNewsItem,
} from "../data/guilds";
import {
  CacheKeys,
  cachedRead,
  invalidateGuildCaches,
} from "./apiCache";

export class GuildContentError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "GuildContentError";
    this.status = status;
  }
}

function wrap(prefix: string, err: unknown): GuildContentError {
  if (err instanceof ClientHttpError) {
    return new GuildContentError(`${prefix}: ${err.message}`, err.status);
  }
  if (err instanceof GuildContentError) return err;
  return new GuildContentError(
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

function parseLinks(raw: unknown): GuildContentLink[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      const obj = asRecord(row);
      if (!obj) return null;
      const label = String(obj.label ?? obj.title ?? "").trim();
      const href = String(obj.href ?? obj.url ?? "").trim();
      if (!label || !href) return null;
      return { label, href };
    })
    .filter((x): x is GuildContentLink => Boolean(x));
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

function asBodyFormat(value: unknown): GuildBodyFormat {
  return value === "plain" ? "plain" : "markdown";
}

export function newsFromApiRecord(row: unknown): GuildNewsItem | null {
  const obj = asRecord(row);
  if (!obj) return null;
  const id = String(obj.id ?? "").trim();
  const guildId = String(obj.guild_id ?? obj.guildId ?? "").trim();
  const title = String(obj.title ?? "").trim();
  if (!id || !guildId || !title) return null;
  const publishedAt =
    typeof obj.published_at === "string"
      ? obj.published_at
      : typeof obj.created_at === "string"
        ? obj.created_at
        : undefined;
  return {
    id,
    guildId,
    title,
    tagline: typeof obj.tagline === "string" ? obj.tagline : null,
    body: String(obj.body ?? ""),
    bodyFormat: asBodyFormat(obj.body_format ?? obj.bodyFormat),
    coverUrl:
      typeof obj.cover_url === "string"
        ? obj.cover_url
        : typeof obj.coverUrl === "string"
          ? obj.coverUrl
          : null,
    links: parseLinks(obj.links),
    deepLink: typeof obj.deep_link === "string" ? obj.deep_link : undefined,
    when: formatWhen(publishedAt),
    publishedAt,
    isPublished: obj.is_published !== false,
    authorId: typeof obj.author_id === "string" ? obj.author_id : undefined,
    pinned: Boolean(obj.is_pinned ?? obj.pinned),
  };
}

export function eventFromApiRecord(row: unknown): GuildEvent | null {
  const obj = asRecord(row);
  if (!obj) return null;
  const id = String(obj.id ?? "").trim();
  const guildId = String(obj.guild_id ?? obj.guildId ?? "").trim();
  const title = String(obj.title ?? "").trim();
  const startsAt = String(obj.starts_at ?? obj.startsAt ?? "").trim();
  if (!id || !guildId || !title || !startsAt) return null;
  const endsRaw = obj.ends_at ?? obj.endsAt;
  const endsAt =
    typeof endsRaw === "string" && endsRaw.trim() ? endsRaw.trim() : undefined;
  const description =
    typeof obj.description === "string"
      ? obj.description
      : typeof obj.body === "string"
        ? obj.body
        : null;
  return {
    id,
    guildId,
    title,
    tagline: typeof obj.tagline === "string" ? obj.tagline : null,
    body: description,
    bodyFormat: asBodyFormat(obj.body_format ?? obj.bodyFormat),
    location: typeof obj.location === "string" ? obj.location : null,
    coverUrl:
      typeof obj.cover_url === "string"
        ? obj.cover_url
        : typeof obj.coverUrl === "string"
          ? obj.coverUrl
          : null,
    links: parseLinks(obj.links),
    deepLink: typeof obj.deep_link === "string" ? obj.deep_link : undefined,
    startsAt,
    endsAt,
    isPublished: obj.is_published !== false,
    authorId: typeof obj.author_id === "string" ? obj.author_id : undefined,
    type: "social",
    myRsvp:
      typeof obj.my_rsvp === "string" ? obj.my_rsvp : undefined,
    rsvpCount:
      typeof obj.rsvp_count === "number" ? obj.rsvp_count : undefined,
    maxParticipants:
      typeof obj.max_participants === "number"
        ? obj.max_participants
        : undefined,
  };
}

export type NewsWritePayload = {
  title: string;
  tagline?: string | null;
  body: string;
  bodyFormat?: GuildBodyFormat;
  coverUrl?: string | null;
  links?: GuildContentLink[];
  isPublished?: boolean;
};

export type EventWritePayload = {
  title: string;
  tagline?: string | null;
  description?: string | null;
  bodyFormat?: GuildBodyFormat;
  location?: string | null;
  coverUrl?: string | null;
  links?: GuildContentLink[];
  startsAt: string;
  endsAt?: string | null;
  isPublished?: boolean;
};

/** GET /v1/guilds/{guild_id}/news */
export async function listGuildNews(guildId: string): Promise<GuildNewsItem[]> {
  try {
    const { data } = await cachedRead({
      key: CacheKeys.guildNews(guildId),
      fetcher: async () => {
        const raw = await send<unknown>("guilds", "list_guild_news", {
          guild_id: guildId,
        });
        return unwrapList(raw, ["data", "items", "news"])
          .map(newsFromApiRecord)
          .filter((x): x is GuildNewsItem => Boolean(x));
      },
    });
    return data;
  } catch (err) {
    throw wrap("Could not load guild news", err);
  }
}

/** POST /v1/guilds/{guild_id}/news */
export async function createGuildNews(
  guildId: string,
  payload: NewsWritePayload,
): Promise<GuildNewsItem> {
  try {
    const data = await sendMutate(
      "guilds",
      "create_guild_news",
      {
        guild_id: guildId,
        title: payload.title,
        tagline: payload.tagline ?? null,
        body: payload.body,
        body_format: payload.bodyFormat ?? "markdown",
        cover_url: payload.coverUrl ?? null,
        links: payload.links ?? [],
        is_published: payload.isPublished ?? true,
      },
      "POST",
    );
    await invalidateGuildCaches(guildId);
    const row = newsFromApiRecord(unwrapOne(data, ["data", "news", "item"]));
    if (!row) throw new GuildContentError("Malformed create news response", 502);
    return row;
  } catch (err) {
    throw wrap("Could not create news", err);
  }
}

/** PATCH /v1/guilds/{guild_id}/news/{news_id} */
export async function updateGuildNews(
  guildId: string,
  newsId: string,
  payload: Partial<NewsWritePayload>,
): Promise<GuildNewsItem> {
  try {
    const body: Record<string, unknown> = {
      guild_id: guildId,
      news_id: newsId,
    };
    if (payload.title !== undefined) body.title = payload.title;
    if (payload.tagline !== undefined) body.tagline = payload.tagline;
    if (payload.body !== undefined) body.body = payload.body;
    if (payload.bodyFormat !== undefined) body.body_format = payload.bodyFormat;
    if (payload.coverUrl !== undefined) body.cover_url = payload.coverUrl;
    if (payload.links !== undefined) body.links = payload.links;
    if (payload.isPublished !== undefined) body.is_published = payload.isPublished;
    const data = await sendMutate("guilds", "update_guild_news", body, "PATCH");
    await invalidateGuildCaches(guildId);
    const row = newsFromApiRecord(unwrapOne(data, ["data", "news", "item"]));
    if (!row) throw new GuildContentError("Malformed update news response", 502);
    return row;
  } catch (err) {
    throw wrap("Could not update news", err);
  }
}

/** GET /v1/guilds/{guild_id}/events */
export async function listGuildEvents(guildId: string): Promise<GuildEvent[]> {
  try {
    const { data } = await cachedRead({
      key: CacheKeys.guildEvents(guildId),
      fetcher: async () => {
        const raw = await send<unknown>("guilds", "list_guild_events", {
          guild_id: guildId,
        });
        return unwrapList(raw, ["data", "items", "events"])
          .map(eventFromApiRecord)
          .filter((x): x is GuildEvent => Boolean(x));
      },
    });
    return data;
  } catch (err) {
    throw wrap("Could not load guild events", err);
  }
}

/** POST /v1/guilds/{guild_id}/events */
export async function createGuildEvent(
  guildId: string,
  payload: EventWritePayload,
): Promise<GuildEvent> {
  try {
    const data = await sendMutate(
      "guilds",
      "create_guild_event",
      {
        guild_id: guildId,
        title: payload.title,
        tagline: payload.tagline ?? null,
        description: payload.description ?? null,
        body_format: payload.bodyFormat ?? "markdown",
        location: payload.location ?? null,
        cover_url: payload.coverUrl ?? null,
        links: payload.links ?? [],
        starts_at: payload.startsAt,
        ends_at: payload.endsAt ?? null,
        is_published: payload.isPublished ?? true,
      },
      "POST",
    );
    await invalidateGuildCaches(guildId);
    const row = eventFromApiRecord(unwrapOne(data, ["data", "event", "item"]));
    if (!row) throw new GuildContentError("Malformed create event response", 502);
    return row;
  } catch (err) {
    throw wrap("Could not create event", err);
  }
}

/** PATCH /v1/guilds/{guild_id}/events/{event_id} */
export async function updateGuildEvent(
  guildId: string,
  eventId: string,
  payload: Partial<EventWritePayload>,
): Promise<GuildEvent> {
  try {
    const body: Record<string, unknown> = {
      guild_id: guildId,
      event_id: eventId,
    };
    if (payload.title !== undefined) body.title = payload.title;
    if (payload.tagline !== undefined) body.tagline = payload.tagline;
    if (payload.description !== undefined) body.description = payload.description;
    if (payload.bodyFormat !== undefined) body.body_format = payload.bodyFormat;
    if (payload.location !== undefined) body.location = payload.location;
    if (payload.coverUrl !== undefined) body.cover_url = payload.coverUrl;
    if (payload.links !== undefined) body.links = payload.links;
    if (payload.startsAt !== undefined) body.starts_at = payload.startsAt;
    if (payload.endsAt !== undefined) body.ends_at = payload.endsAt;
    if (payload.isPublished !== undefined) body.is_published = payload.isPublished;
    const data = await sendMutate("guilds", "update_guild_event", body, "PATCH");
    await invalidateGuildCaches(guildId);
    const row = eventFromApiRecord(unwrapOne(data, ["data", "event", "item"]));
    if (!row) throw new GuildContentError("Malformed update event response", 502);
    return row;
  } catch (err) {
    throw wrap("Could not update event", err);
  }
}

/** POST pin / unpin news */
export async function pinGuildNews(
  guildId: string,
  newsId: string,
  pinned: boolean,
): Promise<GuildNewsItem> {
  try {
    const command = pinned ? "pin_guild_news" : "unpin_guild_news";
    const data = await sendMutate(
      "guilds",
      command,
      { guild_id: guildId, news_id: newsId },
      "POST",
    );
    await invalidateGuildCaches(guildId);
    const row = newsFromApiRecord(unwrapOne(data, ["data", "news", "item"]));
    if (row) return row;
    return {
      id: newsId,
      guildId,
      title: "",
      body: "",
      when: "",
      pinned,
    };
  } catch (err) {
    throw wrap(pinned ? "Could not pin news" : "Could not unpin news", err);
  }
}

export async function setEventRsvp(
  guildId: string,
  eventId: string,
  status: "going" | "maybe" | "not_going" = "going",
): Promise<void> {
  try {
    await sendMutate(
      "guilds",
      "set_event_rsvp",
      { guild_id: guildId, event_id: eventId, status },
      "POST",
    );
    await invalidateGuildCaches(guildId);
  } catch (err) {
    throw wrap("Could not set RSVP", err);
  }
}

export async function clearEventRsvp(
  guildId: string,
  eventId: string,
): Promise<void> {
  try {
    await sendMutate(
      "guilds",
      "clear_event_rsvp",
      { guild_id: guildId, event_id: eventId },
      "DELETE",
    );
    await invalidateGuildCaches(guildId);
  } catch (err) {
    throw wrap("Could not clear RSVP", err);
  }
}

export async function listEventRsvps(
  guildId: string,
  eventId: string,
): Promise<unknown[]> {
  try {
    const raw = await send<unknown>("guilds", "list_event_rsvps", {
      guild_id: guildId,
      event_id: eventId,
    });
    return unwrapList(raw, ["data", "rsvps"]);
  } catch (err) {
    throw wrap("Could not list RSVPs", err);
  }
}
