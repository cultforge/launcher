import { chatMessageFromApiRecord } from "./guildChat";
import { getGuild } from "../data/guilds";
import { resolveGuildChatRole } from "./guildPermissions";
import type { GlobalChatMessage } from "../types/chat";
import { useGuildStore } from "../stores/guilds";
import { useGlobalChatStore } from "../stores/globalChat";
import { useDmStore } from "../stores/dm";

function asRecord(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : null;
}

function authorFromApi(author: unknown, fallbackId: string) {
  const obj = asRecord(author);
  const handle = String(obj?.handle_name ?? "").trim();
  const username = String(obj?.username ?? "").trim();
  return {
    id: fallbackId,
    displayName: handle || username || fallbackId.slice(0, 8) || "Player",
    avatarUrl:
      typeof obj?.avatar_url === "string" ? obj.avatar_url : undefined,
    role: "member" as const,
  };
}

function globalMessageFromApi(raw: unknown): GlobalChatMessage | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const id = obj.id;
  const content = String(obj.content ?? "").trim();
  if (id === undefined || id === null || !content) return null;
  const authorId = String(obj.author_id ?? "");
  const numericId =
    typeof id === "number" ? id : Number.parseInt(String(id), 10);
  const sequence = Number.isFinite(numericId) ? numericId : Date.now();
  return {
    id: String(id),
    sequence,
    author: authorFromApi(obj.author, authorId),
    body: content,
    createdAt:
      typeof obj.created_at === "string"
        ? obj.created_at
        : new Date().toISOString(),
    delivery: "sent",
    moderation: { reportable: true, labels: [] },
  };
}

/** Route non-presence realtime frames from the sidecar local /ws bridge. */
export function handleRealtimeWsMessage(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const obj = payload as Record<string, unknown>;
  const type = String(obj.type ?? "");

  if (type === "chat.message") {
    const body = obj.payload ?? obj;
    const message = globalMessageFromApi(body);
    if (!message) return true;
    useGlobalChatStore.getState().receive({
      type: "message.created",
      sequence: message.sequence,
      emittedAt: new Date().toISOString(),
      payload: { message },
    });
    return true;
  }

  if (type === "guild.chat.message") {
    const body = obj.payload ?? obj;
    const channelId =
      asRecord(body)?.channel_id ??
      asRecord(asRecord(body)?.message)?.channel_id;
    const guildState = useGuildStore.getState();
    const guildId = guildState.activeGuildId;
    const activeChannel = guildState.activeChannelByGuild[guildId];
    if (
      !guildId ||
      !channelId ||
      String(channelId) !== String(activeChannel)
    ) {
      return true;
    }
    const mapped = chatMessageFromApiRecord(body, guildId, (authorId) =>
      resolveGuildChatRole({
        guildId,
        authorId,
        members: useGuildStore.getState().members,
        ownerId: getGuild(guildId)?.ownerId,
      }),
    );
    if (mapped) {
      useGuildStore.getState().appendChatMessage(guildId, mapped);
    }
    return true;
  }

  if (type === "dm.message" || type.startsWith("dm.")) {
    void useDmStore.getState().refreshConversations();
    return true;
  }

  if (type.startsWith("chloe.action")) {
    void import("../stores/chloe").then(({ useChloeStore }) => {
      void useChloeStore.getState().handleRealtimeAction(payload);
    });
    return true;
  }

  return false;
}
