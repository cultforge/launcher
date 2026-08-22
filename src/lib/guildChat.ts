import { ClientHttpError, send, sendMutate } from "./client";
import { sortChatChronologically } from "./chatOrdering";
import type { ChatMessage, GuildRole } from "../data/guilds";
import {
  CacheKeys,
  cachedRead,
  invalidateApiCache,
} from "./apiCache";

export class GuildChatError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "GuildChatError";
    this.status = status;
  }
}

export type GuildChannel = {
  id: string;
  guildId: string;
  name: string;
  description?: string | null;
  channelType: string;
  position: number;
};

function wrap(prefix: string, err: unknown): GuildChatError {
  if (err instanceof ClientHttpError) {
    return new GuildChatError(`${prefix}: ${err.message}`, err.status);
  }
  if (err instanceof GuildChatError) return err;
  return new GuildChatError(
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

function authorDisplayName(author: unknown): string | undefined {
  const obj = asRecord(author);
  if (!obj) return undefined;
  const handle = String(obj.handle_name ?? "").trim();
  if (handle) return handle;
  const username = String(obj.username ?? "").trim();
  return username || undefined;
}

function formatMessageTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function channelFromApiRecord(raw: unknown): GuildChannel | null {
  const obj = asRecord(raw);
  if (!obj || typeof obj.id !== "string") return null;
  const guildId = String(obj.guild_id ?? "");
  const name = String(obj.name ?? "").trim() || "channel";
  if (!guildId) return null;
  return {
    id: obj.id,
    guildId,
    name,
    description:
      typeof obj.description === "string" ? obj.description : null,
    channelType: String(obj.channel_type ?? "text"),
    position: typeof obj.position === "number" ? obj.position : 0,
  };
}

export function chatMessageFromApiRecord(
  raw: unknown,
  guildId: string,
  roleForAuthor: (authorId: string) => GuildRole = () => "Member",
): ChatMessage | null {
  const obj = asRecord(raw);
  if (!obj || typeof obj.id !== "string") return null;
  const content = String(obj.content ?? "").trim();
  if (!content) return null;
  const authorId = String(obj.author_id ?? "");
  const author =
    authorDisplayName(obj.author) ||
    (authorId ? authorId.slice(0, 8) : "Unknown");
  const createdAt =
    typeof obj.created_at === "string" ? obj.created_at : undefined;
  return {
    id: obj.id,
    guildId,
    author,
    text: content,
    time: formatMessageTime(createdAt),
    role: roleForAuthor(authorId),
    authorId: authorId || undefined,
    channelId:
      typeof obj.channel_id === "string" ? obj.channel_id : undefined,
    createdAt,
  };
}

/** Prefer guildhall, then general, then first by position. */
export function pickDefaultChannel(
  channels: GuildChannel[],
): GuildChannel | null {
  if (!channels.length) return null;
  const byName = (n: string) =>
    channels.find((c) => c.name.toLowerCase() === n);
  return (
    byName("guildhall") ||
    byName("general") ||
    [...channels].sort((a, b) => a.position - b.position)[0] ||
    null
  );
}

/** GET /v1/guilds/{guild_id}/channels */
export async function fetchGuildChannels(
  guildId: string,
): Promise<GuildChannel[]> {
  try {
    const { data } = await cachedRead({
      key: CacheKeys.guildChannels(guildId),
      fetcher: async () => {
        const raw = await send<unknown>("guilds", "list_guild_channels", {
          guild_id: guildId,
        });
        return unwrapList(raw, ["data", "channels"])
          .map(channelFromApiRecord)
          .filter((x): x is GuildChannel => Boolean(x));
      },
    });
    return data;
  } catch (err) {
    throw wrap("Could not list guild channels", err);
  }
}

/** POST /v1/guilds/{guild_id}/channels — create a text channel (needs channels.create). */
export async function createGuildChannel(
  guildId: string,
  name: string,
  opts?: { description?: string; channelType?: string },
): Promise<GuildChannel> {
  try {
    const data = await sendMutate(
      "guilds",
      "create_guild_channel",
      {
        guild_id: guildId,
        name: name.trim(),
        channel_type: opts?.channelType ?? "text",
        description: opts?.description,
      },
      "POST",
    );
    await invalidateApiCache(CacheKeys.guildChannels(guildId));
    const payload = unwrapOne(data, ["data", "channel"]);
    const channel = channelFromApiRecord(payload);
    if (!channel) {
      throw new GuildChatError("Create channel response was malformed", 502);
    }
    return channel;
  } catch (err) {
    throw wrap("Could not create channel", err);
  }
}

/**
 * Ensure the guild has at least one channel. Creates `#general` when empty
 * and the viewer can create channels; otherwise returns [].
 */
export async function ensureGuildChannels(
  guildId: string,
  canCreate: boolean,
): Promise<GuildChannel[]> {
  let channels = await fetchGuildChannels(guildId);
  if (channels.length || !canCreate) return channels;
  try {
    const created = await createGuildChannel(guildId, "general", {
      description: "Guild chat",
    });
    channels = [created];
  } catch {
    /* member without channels.create — leave empty */
  }
  return channels;
}

/** GET /v1/channels/{channel_id}/messages — oldest → newest for UI. */
export async function fetchChannelMessages(
  channelId: string,
  guildId: string,
  roleForAuthor?: (authorId: string) => GuildRole,
): Promise<ChatMessage[]> {
  try {
    const { data } = await cachedRead({
      key: CacheKeys.channelMessages(channelId),
      fetcher: async () => {
        const raw = await send<unknown>("guilds", "channel_message_history", {
          channel_id: channelId,
          limit: "50",
        });
        const rows = unwrapList(raw, ["messages", "data"]);
        const mapped = rows
          .map((row) =>
            chatMessageFromApiRecord(row, guildId, roleForAuthor),
          )
          .filter((x): x is ChatMessage => Boolean(x));
        return sortChatChronologically(mapped);
      },
    });
    // Re-map roles if roster became available after cache write.
    if (roleForAuthor) {
      return data.map((m) =>
        m.authorId
          ? { ...m, role: roleForAuthor(m.authorId) }
          : m,
      );
    }
    return data;
  } catch (err) {
    throw wrap("Could not load channel history", err);
  }
}

/** POST /v1/channels/{channel_id}/messages */
export async function sendChannelMessage(
  channelId: string,
  guildId: string,
  content: string,
  roleForAuthor?: (authorId: string) => GuildRole,
): Promise<ChatMessage> {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new GuildChatError("Message cannot be empty", 400);
  }
  try {
    const data = await sendMutate(
      "guilds",
      "send_channel_message",
      {
        channel_id: channelId,
        content: trimmed,
      },
      "POST",
    );
    const payload = unwrapOne(data, ["message", "data"]);
    const message = chatMessageFromApiRecord(
      payload,
      guildId,
      roleForAuthor,
    );
    if (!message) {
      throw new GuildChatError("Send message response was malformed", 502);
    }
    await invalidateApiCache(CacheKeys.channelMessages(channelId));
    return message;
  } catch (err) {
    throw wrap("Could not send message", err);
  }
}
