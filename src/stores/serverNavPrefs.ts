import { create } from "zustand";
import { persist } from "zustand/middleware";

type RecentEntry = { id: string; at: number };

type ServerNavPrefsStore = {
  favorites: string[];
  recents: RecentEntry[];
  toggleFavorite: (serverId: string) => void;
  isFavorite: (serverId: string) => boolean;
  touchRecent: (serverId: string) => void;
  recentIds: (limit?: number) => string[];
};

export const useServerNavPrefsStore = create<ServerNavPrefsStore>()(
  persist(
    (set, get) => ({
      favorites: [],
      recents: [],
      toggleFavorite: (serverId) => {
        const id = serverId.trim();
        if (!id) return;
        const exists = get().favorites.includes(id);
        set({
          favorites: exists
            ? get().favorites.filter((x) => x !== id)
            : [id, ...get().favorites],
        });
      },
      isFavorite: (serverId) => get().favorites.includes(serverId),
      touchRecent: (serverId) => {
        const id = serverId.trim();
        if (!id) return;
        const now = Date.now();
        const next = [
          { id, at: now },
          ...get().recents.filter((r) => r.id !== id),
        ].slice(0, 40);
        set({ recents: next });
      },
      recentIds: (limit = 20) =>
        get()
          .recents.slice(0, limit)
          .map((r) => r.id),
    }),
    { name: "cf-server-nav-prefs-v1" },
  ),
);
