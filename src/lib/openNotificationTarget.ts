import type { RemoteNotification } from "./cultApi";
import { navigateCultforgeDeepLink } from "./deepLinks";
import { useDmStore } from "../stores/dm";
import { useGlobalChatStore } from "../stores/globalChat";
import { invoke } from "@tauri-apps/api/core";

function payloadString(
  payload: Record<string, unknown> | undefined,
  ...keys: string[]
): string | null {
  if (!payload) return null;
  for (const key of keys) {
    const v = payload[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

async function focusLauncher(): Promise<void> {
  try {
    await invoke("restore_from_tray");
  } catch {
    /* optional */
  }
}

/** Open the chat / surface implied by a notification kind + payload. */
export async function openNotificationTarget(
  remote: RemoteNotification | null | undefined,
): Promise<boolean> {
  if (!remote) return false;
  await focusLauncher();
  const kind = (remote.kind || "").toLowerCase();
  const payload = remote.payload;

  const peerId = payloadString(
    payload,
    "peer_id",
    "peerId",
    "user_id",
    "userId",
    "from_user_id",
    "sender_id",
  );
  const guildId = payloadString(payload, "guild_id", "guildId");
  const channelId = payloadString(payload, "channel_id", "channelId");
  const deepLink = payloadString(payload, "deep_link", "deepLink", "url");

  if (deepLink && (deepLink.startsWith("cultforge://") || deepLink.startsWith("/"))) {
    navigateCultforgeDeepLink(deepLink);
    return true;
  }

  if (guildId && channelId) {
    navigateCultforgeDeepLink(`cultforge://guild/${guildId}/channel/${channelId}`);
    return true;
  }
  if (guildId) {
    navigateCultforgeDeepLink(`cultforge://guild/${guildId}`);
    return true;
  }

  if (
    peerId &&
    (kind.includes("dm") ||
      kind.includes("direct") ||
      kind.includes("message") ||
      kind.includes("chat") ||
      kind.includes("friend"))
  ) {
    navigateCultforgeDeepLink(`cultforge://dm/${peerId}`);
    return true;
  }

  if (peerId) {
    useDmStore.getState().openPeer(peerId);
    return true;
  }

  if (kind.includes("global") || kind === "chat.message") {
    useGlobalChatStore.getState().setOpen(true);
    return true;
  }

  return false;
}
