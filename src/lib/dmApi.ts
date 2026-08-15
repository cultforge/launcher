import { ClientHttpError, send, sendMutate } from "./client";
import {
  CacheKeys,
  cachedRead,
  invalidateApiCache,
} from "./apiCache";

export class DmApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "DmApiError";
    this.status = status;
  }
}

export type DmPeer = {
  id: string;
  name: string;
  handleName?: string;
  avatarUrl?: string;
};

export type DmMessage = {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  isRead: boolean;
  createdAt: string;
  senderName?: string;
};

export type DmConversation = {
  peerId: string;
  peer: DmPeer;
  lastMessage?: DmMessage | null;
  unreadCount: number;
};

function wrap(prefix: string, err: unknown): DmApiError {
  if (err instanceof ClientHttpError) {
    return new DmApiError(`${prefix}: ${err.message}`, err.status);
  }
  if (err instanceof DmApiError) return err;
  return new DmApiError(
    `${prefix}: ${err instanceof Error ? err.message : String(err)}`,
  );
}

function tryParseObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  const candidates = [trimmed];
  const dict = trimmed.match(/\{[\s\S]*\}/);
  if (dict?.[0] && dict[0] !== trimmed) candidates.push(dict[0]);
  for (const candidate of candidates) {
    for (const text of [
      candidate,
      candidate
        .replace(/'/g, '"')
        .replace(/\bNone\b/g, "null")
        .replace(/\bTrue\b/g, "true")
        .replace(/\bFalse\b/g, "false"),
    ]) {
      try {
        const value = JSON.parse(text);
        if (value && typeof value === "object" && !Array.isArray(value)) {
          return value as Record<string, unknown>;
        }
      } catch {
        /* try next */
      }
    }
  }
  return null;
}

export type DmSendAlert = {
  title: string;
  message: string;
};

export function dmSendAlert(error: unknown): DmSendAlert {
  const body =
    error instanceof ClientHttpError && error.body && typeof error.body === "object"
      ? (error.body as Record<string, unknown>)
      : null;
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const nested =
    typeof body?.message === "string" ? tryParseObject(body.message) : null;
  const parsed = tryParseObject(raw);
  const obj = nested ?? parsed ?? body ?? {};
  const code = String(obj.error ?? obj.code ?? "").toLowerCase();
  const category = String(obj.category ?? "").toLowerCase();
  const apiMessage = [
    typeof obj.message === "string" && !obj.message.trim().startsWith("{")
      ? obj.message
      : "",
    typeof nested?.message === "string" ? nested.message : "",
    typeof parsed?.message === "string" ? parsed.message : "",
  ]
    .map((value) => value.trim())
    .find(Boolean);

  if (
    code.includes("content_policy") ||
    category.includes("sexual") ||
    /content_policy/i.test(raw)
  ) {
    return {
      title: "Message not allowed",
      message:
        apiMessage ||
        "This message violates CultForge content policy and was not sent.",
    };
  }

  if (apiMessage) {
    return { title: "Could not send DM", message: apiMessage };
  }

  const cleaned = raw.replace(/^Could not send DM:\s*/i, "").trim();
  if (cleaned && !cleaned.startsWith("{") && !cleaned.startsWith("['")) {
    return { title: "Could not send DM", message: cleaned };
  }

  return {
    title: "Could not send DM",
    message: "The message could not be sent. Please try again.",
  };
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

function mapPeer(raw: unknown, fallbackId = ""): DmPeer {
  const obj = asRecord(raw);
  const id = String(obj?.user_id ?? obj?.id ?? fallbackId).trim();
  const username = String(obj?.username ?? obj?.name ?? "").trim();
  const handle = String(obj?.handle_name ?? "").trim();
  return {
    id: id || fallbackId,
    name: username || handle || id || "Player",
    handleName: handle || undefined,
    avatarUrl:
      typeof obj?.avatar_url === "string" ? obj.avatar_url : undefined,
  };
}

export function mapDmMessage(raw: unknown): DmMessage | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const id = String(obj.id ?? "").trim();
  const content = String(obj.content ?? "").trim();
  if (!id || !content) return null;
  const sender = asRecord(obj.sender);
  return {
    id,
    senderId: String(obj.sender_id ?? sender?.user_id ?? ""),
    receiverId: String(obj.receiver_id ?? ""),
    content,
    isRead: Boolean(obj.is_read),
    createdAt:
      typeof obj.created_at === "string"
        ? obj.created_at
        : new Date().toISOString(),
    senderName: sender
      ? String(sender.handle_name ?? sender.username ?? "")
      : undefined,
  };
}

export function mapDmConversation(raw: unknown): DmConversation | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const peerId = String(obj.peer_id ?? "").trim();
  if (!peerId) return null;
  const last = obj.last_message ? mapDmMessage(obj.last_message) : null;
  return {
    peerId,
    peer: mapPeer(obj.peer, peerId),
    lastMessage: last,
    unreadCount:
      typeof obj.unread_count === "number" ? obj.unread_count : 0,
  };
}

export async function fetchDmConversations(): Promise<DmConversation[]> {
  try {
    const { data } = await cachedRead({
      key: CacheKeys.dmConversations,
      fetcher: async () => {
        const raw = await send<unknown>("api", "list_dm_conversations");
        return unwrapList(raw, ["data", "conversations"])
          .map(mapDmConversation)
          .filter((x): x is DmConversation => Boolean(x));
      },
    });
    return data;
  } catch (err) {
    throw wrap("Could not load DM conversations", err);
  }
}

export async function fetchDmHistory(
  peerId: string,
  limit = 50,
): Promise<DmMessage[]> {
  try {
    const { data } = await cachedRead({
      key: CacheKeys.dmHistory(peerId),
      fetcher: async () => {
        const raw = await send<unknown>("api", "dm_history_with_peer", {
          peer_id: peerId,
          limit: String(limit),
        });
        const rows = unwrapList(raw, ["messages", "data"]);
        return rows
          .map(mapDmMessage)
          .filter((x): x is DmMessage => Boolean(x))
          .reverse();
      },
    });
    return data;
  } catch (err) {
    throw wrap("Could not load DM history", err);
  }
}

export async function sendDm(
  peerId: string,
  content: string,
): Promise<DmMessage> {
  const trimmed = content.trim();
  if (!trimmed) throw new DmApiError("Message cannot be empty", 400);
  try {
    const data = await sendMutate(
      "api",
      "send_dm",
      { peer_id: peerId, content: trimmed },
      "POST",
    );
    const payload = unwrapOne(data, ["message", "data"]);
    const message = mapDmMessage(payload);
    if (!message) throw new DmApiError("Send DM response malformed", 502);
    await invalidateApiCache(CacheKeys.dmHistory(peerId));
    await invalidateApiCache(CacheKeys.dmConversations);
    return message;
  } catch (err) {
    throw wrap("Could not send DM", err);
  }
}

export async function markDmRead(peerId: string): Promise<void> {
  try {
    await sendMutate(
      "api",
      "mark_dms_from_peer_as_read",
      { peer_id: peerId },
      "POST",
    );
    await invalidateApiCache(CacheKeys.dmConversations);
    await invalidateApiCache(CacheKeys.dmHistory(peerId));
  } catch (err) {
    throw wrap("Could not mark DMs read", err);
  }
}
