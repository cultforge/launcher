import { useFriendsRosterStore } from "../stores/friendsRoster";
import { usePresenceStore } from "../stores/presence";
import { useAppStore } from "../userstore";

/** Handle presence / session frames forwarded from the sidecar bridge. */
export function handlePresenceWsMessage(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const obj = payload as Record<string, unknown>;
  const type = obj.type;

  if (type === "presence") {
    const body =
      obj.payload && typeof obj.payload === "object"
        ? (obj.payload as Record<string, unknown>)
        : obj;
    const userId =
      (typeof body.user_id === "string" && body.user_id) ||
      (typeof body.userId === "string" && body.userId) ||
      "";
    const online = Boolean(body.online);
    if (userId) {
      useFriendsRosterStore.getState().applyPresence(userId, online);
      const selfId = useAppStore.getState().currentUser?.id;
      if (selfId && userId === selfId) {
        useAppStore.getState().setOnline(online);
      }
    }
    return true;
  }

  if (type === "presence_snapshot") {
    const body =
      obj.payload && typeof obj.payload === "object"
        ? (obj.payload as Record<string, unknown>)
        : obj;
    const online = Array.isArray(body.online)
      ? body.online.filter((id): id is string => typeof id === "string")
      : [];
    useFriendsRosterStore.getState().applyPresenceSnapshot(online);
    // Receiving a snapshot means our presence bridge is connected.
    useAppStore.getState().setOnline(true);
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
