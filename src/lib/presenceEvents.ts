import { useFriendsRosterStore } from "../stores/friendsRoster";
import { usePresenceStore } from "../stores/presence";
import { useAppStore } from "../userstore";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickUserId(body: Record<string, unknown>): string {
  for (const key of [
    "user_id",
    "userId",
    "id",
    "uid",
    "account_id",
    "accountId",
  ]) {
    const v = body[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const user = asRecord(body.user);
  if (user) {
    for (const key of ["id", "user_id", "userId"]) {
      const v = user[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return "";
}

function pickOnline(body: Record<string, unknown>): boolean | null {
  if (typeof body.online === "boolean") return body.online;
  if (typeof body.is_online === "boolean") return body.is_online;
  if (typeof body.isOnline === "boolean") return body.isOnline;
  if (typeof body.status === "string") {
    const s = body.status.toLowerCase();
    if (s === "online" || s === "active" || s === "present") return true;
    if (s === "offline" || s === "away" || s === "idle") return false;
  }
  if (typeof body.state === "string") {
    const s = body.state.toLowerCase();
    if (s === "online" || s === "active") return true;
    if (s === "offline") return false;
  }
  return null;
}

function collectOnlineIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      ids.push(item.trim());
      continue;
    }
    const row = asRecord(item);
    if (!row) continue;
    const id = pickUserId(row);
    if (!id) continue;
    const online = pickOnline(row);
    if (online === false) continue;
    ids.push(id);
  }
  return ids;
}

function unwrapBody(obj: Record<string, unknown>): Record<string, unknown> {
  const nested =
    asRecord(obj.payload) ||
    asRecord(obj.data) ||
    asRecord(obj.body) ||
    asRecord(obj.message);
  return nested ?? obj;
}

function normalizeType(obj: Record<string, unknown>): string {
  const raw =
    (typeof obj.type === "string" && obj.type) ||
    (typeof obj.event === "string" && obj.event) ||
    (typeof obj.op === "string" && obj.op) ||
    "";
  return raw.trim().toLowerCase().replace(/[.\s]+/g, "_");
}

function applyPresenceUpdate(userId: string, online: boolean) {
  useFriendsRosterStore.getState().applyPresence(userId, online);
  const selfId = useAppStore.getState().currentUser?.id;
  if (selfId && userId === selfId) {
    useAppStore.getState().setOnline(online);
  }
}

function applySnapshot(onlineIds: string[]) {
  useFriendsRosterStore.getState().applyPresenceSnapshot(onlineIds);
  // Receiving a snapshot means our presence bridge is connected.
  useAppStore.getState().setOnline(true);
}

/** Handle presence / session frames forwarded from the sidecar bridge. */
export function handlePresenceWsMessage(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const obj = payload as Record<string, unknown>;
  const type = normalizeType(obj);

  // Non-JSON remote frames arrive as presence_raw with a string payload.
  if (type === "presence_raw") {
    const raw = obj.payload;
    if (typeof raw === "string") {
      try {
        return handlePresenceWsMessage(JSON.parse(raw));
      } catch {
        return true;
      }
    }
    if (raw && typeof raw === "object") {
      return handlePresenceWsMessage(raw);
    }
    return true;
  }

  if (
    type === "presence" ||
    type === "presence_update" ||
    type === "presence_changed" ||
    type === "user_presence" ||
    type === "friend_presence"
  ) {
    const body = unwrapBody(obj);
    const userId = pickUserId(body);
    const online = pickOnline(body);
    if (userId && online !== null) {
      applyPresenceUpdate(userId, online);
      return true;
    }
    // Bulk list under a presence frame
    const bulkCandidates = [
      collectOnlineIds(body.online),
      collectOnlineIds(body.users),
      collectOnlineIds(body.friends),
    ];
    const bulk = bulkCandidates.find((ids) => ids.length > 0) ?? [];
    if (bulk.length) {
      applySnapshot(bulk);
      return true;
    }
    return Boolean(userId);
  }

  if (
    type === "presence_snapshot" ||
    type === "presence_state" ||
    type === "online_snapshot" ||
    type === "friends_online" ||
    type === "roster"
  ) {
    const body = unwrapBody(obj);
    const online = [
      ...collectOnlineIds(body.online),
      ...collectOnlineIds(body.online_ids),
      ...collectOnlineIds(body.onlineIds),
      ...collectOnlineIds(body.users),
      ...collectOnlineIds(body.friends),
      ...collectOnlineIds(body.roster),
    ];
    // Deduplicate
    applySnapshot([...new Set(online)]);
    return true;
  }

  if (type === "session_ready") {
    useAppStore.getState().setOnline(true);
    // Prefer live profile again when sidecar reports a ready session.
    void (async () => {
      try {
        const { fetchMyProfile } = await import("./client");
        const { isProfileSuccess } = await import("./authProfile");
        const profile = await fetchMyProfile();
        if (isProfileSuccess(profile)) {
          useAppStore.getState().setCurrentUserFromProfile(profile);
          return;
        }
      } catch {
        // Soft — stay on cached auth.
      }
      void useFriendsRosterStore.getState().refresh();
    })();
    return true;
  }

  if (type === "session_cleared") {
    useFriendsRosterStore.getState().clear();
    usePresenceStore.getState().clear();
    useAppStore.getState().setOnline(false);
    return true;
  }

  return false;
}
