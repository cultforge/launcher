import { create } from "zustand";
import type { FriendProfile } from "../data/friends";
import {
  cachePlayerProfile,
  clearPlayerProfileCache,
  mapFriendRecord,
} from "../data/friends";
import {
  fetchMyFriends,
  isHardAuthError,
  isSoftRemoteError,
} from "../lib/client";
import {
  acceptFriend,
  fetchFriendRequests,
  rejectFriend,
  removeFriend,
  requestFriend,
  type FriendRequestRow,
} from "../lib/friendsApi";
import {
  getPreference,
  setPreference,
} from "../lib/persistentStore";
import { usePresenceStore } from "./presence";

const FRIENDS_ROSTER_KEY = "friends.roster";

function forceOffline(friends: FriendProfile[]): FriendProfile[] {
  return friends.map((f) => ({
    ...f,
    status: "offline" as const,
    lastSeen: "Offline",
    activity: "Offline",
  }));
}

interface FriendsRosterState {
  friends: FriendProfile[];
  incoming: FriendRequestRow[];
  outgoing: FriendRequestRow[];
  loading: boolean;
  error: string | null;
  fromCache: boolean;
  query: string;
  setQuery: (q: string) => void;
  refresh: () => Promise<void>;
  loadCached: () => Promise<boolean>;
  clear: () => void;
  applyPresence: (userId: string, online: boolean) => void;
  applyPresenceSnapshot: (onlineIds: string[]) => void;
  request: (target: string) => Promise<{ ok: boolean; message: string }>;
  accept: (row: FriendRequestRow) => Promise<{ ok: boolean; message: string }>;
  reject: (row: FriendRequestRow) => Promise<{ ok: boolean; message: string }>;
  remove: (peerId: string) => Promise<{ ok: boolean; message: string }>;
}

export const useFriendsRosterStore = create<FriendsRosterState>((set, get) => ({
  friends: [],
  incoming: [],
  outgoing: [],
  loading: false,
  error: null,
  fromCache: false,
  query: "",
  setQuery: (query) => set({ query }),
  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const raw = await fetchMyFriends();
      const list = Array.isArray(raw)
        ? raw
        : raw &&
            typeof raw === "object" &&
            Array.isArray((raw as { data?: unknown }).data)
          ? ((raw as { data: unknown[] }).data)
          : raw &&
              typeof raw === "object" &&
              Array.isArray((raw as { friends?: unknown }).friends)
            ? ((raw as { friends: unknown[] }).friends)
            : [];
      const friends = list
        .map((item) => mapFriendRecord(item))
        .filter((f): f is FriendProfile => Boolean(f));
      for (const friend of friends) {
        cachePlayerProfile(friend);
      }
      const onlineIds = friends
        .filter((f) => f.status === "online")
        .map((f) => f.id);
      usePresenceStore.getState().setSnapshot(onlineIds);
      let incoming: FriendRequestRow[] = [];
      let outgoing: FriendRequestRow[] = [];
      try {
        const reqs = await fetchFriendRequests();
        incoming = reqs.incoming;
        outgoing = reqs.outgoing;
      } catch {
        /* soft */
      }
      set({
        friends,
        incoming,
        outgoing,
        loading: false,
        error: null,
        fromCache: false,
      });
      void setPreference(FRIENDS_ROSTER_KEY, friends);
    } catch (e) {
      if (isHardAuthError(e)) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : "Could not load friends",
          fromCache: false,
        });
        return;
      }
      const loaded = await get().loadCached();
      if (loaded) {
        set({
          loading: false,
          error: isSoftRemoteError(e)
            ? "Remote offline — showing cached friends"
            : e instanceof Error
              ? e.message
              : "Could not load friends",
          fromCache: true,
        });
        return;
      }
      set({
        loading: false,
        error: isSoftRemoteError(e)
          ? "Remote offline — friends unavailable"
          : e instanceof Error
            ? e.message
            : "Could not load friends",
        fromCache: false,
      });
    }
  },
  loadCached: async () => {
    const cached = await getPreference<FriendProfile[]>(FRIENDS_ROSTER_KEY);
    if (!Array.isArray(cached) || cached.length === 0) return false;
    const friends = forceOffline(cached);
    for (const friend of friends) {
      cachePlayerProfile(friend);
    }
    usePresenceStore.getState().clear();
    set({ friends, fromCache: true, error: null });
    return true;
  },
  clear: () => {
    clearPlayerProfileCache();
    usePresenceStore.getState().clear();
    void setPreference(FRIENDS_ROSTER_KEY, []);
    set({
      friends: [],
      incoming: [],
      outgoing: [],
      error: null,
      query: "",
      fromCache: false,
    });
  },
  applyPresence: (userId, online) => {
    usePresenceStore.getState().setUserOnline(userId, online);
    set((state) => ({
      friends: state.friends.map((f) =>
        f.id === userId
          ? {
              ...f,
              status: online ? "online" : "offline",
              lastSeen: online ? "Online now" : "Offline",
              activity: online ? "Online" : "Offline",
            }
          : f,
      ),
    }));
  },
  applyPresenceSnapshot: (onlineIds) => {
    const setIds = new Set(onlineIds);
    usePresenceStore.getState().setSnapshot(onlineIds);
    set((state) => ({
      friends: state.friends.map((f) => {
        const online = setIds.has(f.id);
        return {
          ...f,
          status: online ? "online" : "offline",
          lastSeen: online ? "Online now" : "Offline",
          activity: online ? "Online" : "Offline",
        };
      }),
    }));
  },
  request: async (target) => {
    try {
      await requestFriend(target);
      await get().refresh();
      return { ok: true, message: "Friend request sent." };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Request failed",
      };
    }
  },
  accept: async (row) => {
    try {
      await acceptFriend({
        peerId: row.peerId,
        connectionId: row.connectionId,
      });
      await get().refresh();
      return { ok: true, message: "Friend request accepted." };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Accept failed",
      };
    }
  },
  reject: async (row) => {
    try {
      await rejectFriend({
        peerId: row.peerId,
        connectionId: row.connectionId,
      });
      await get().refresh();
      return { ok: true, message: "Friend request rejected." };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Reject failed",
      };
    }
  },
  remove: async (peerId) => {
    try {
      await removeFriend(peerId);
      set((state) => ({
        friends: state.friends.filter((f) => f.id !== peerId),
      }));
      return { ok: true, message: "Friend removed." };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Remove failed",
      };
    }
  },
}));
