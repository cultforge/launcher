import { send, sendMutate } from "./client";
import {
  CacheKeys,
  cachedRead,
  invalidateApiCache,
} from "./apiCache";
import type { GlobalChatMessage } from "../types/chat";

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

export function mapGlobalMessage(raw: unknown): GlobalChatMessage | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const id = obj.id;
  const content = String(obj.content ?? "").trim();
  if (id === undefined || id === null || !content) return null;
  const author = asRecord(obj.author);
  const authorId = String(obj.author_id ?? author?.user_id ?? "");
  const numericId =
    typeof id === "number" ? id : Number.parseInt(String(id), 10);
  const sequence = Number.isFinite(numericId) ? numericId : Date.now();
  const handle = String(author?.handle_name ?? "").trim();
  const username = String(author?.username ?? "").trim();
  return {
    id: String(id),
    sequence,
    author: {
      id: authorId,
      displayName: handle || username || authorId.slice(0, 8) || "Player",
      avatarUrl:
        typeof author?.avatar_url === "string" ? author.avatar_url : undefined,
      role: "member",
    },
    body: content,
    createdAt:
      typeof obj.created_at === "string"
        ? obj.created_at
        : new Date().toISOString(),
    delivery: "sent",
    moderation: { reportable: true, labels: [] },
  };
}

export async function fetchGlobalChatHistory(
  limit = 50,
): Promise<GlobalChatMessage[]> {
  const { data } = await cachedRead({
    key: CacheKeys.globalChatHistory,
    fetcher: async () => {
      const raw = await send<unknown>("api", "global_chat_history", {
        limit: String(limit),
      });
      const rows = unwrapList(raw, ["messages", "data"]);
      return rows
        .map(mapGlobalMessage)
        .filter((x): x is GlobalChatMessage => Boolean(x))
        .sort((a, b) => a.sequence - b.sequence);
    },
  });
  return data;
}

export async function sendGlobalChatMessage(
  content: string,
): Promise<GlobalChatMessage> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Message cannot be empty");
  const data = await sendMutate(
    "api",
    "global_chat_send",
    { content: trimmed },
    "POST",
  );
  const payload = unwrapOne(data, ["message", "data"]);
  const message = mapGlobalMessage(payload);
  if (!message) throw new Error("Global chat send response malformed");
  await invalidateApiCache(CacheKeys.globalChatHistory);
  return message;
}
