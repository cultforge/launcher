import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { NewsStory } from "../data/news";

type DiscoverBookmarksStore = {
  items: NewsStory[];
  toggle: (story: NewsStory) => void;
  has: (id: string) => boolean;
  remove: (id: string) => void;
  clear: () => void;
};

export const useDiscoverBookmarksStore = create<DiscoverBookmarksStore>()(
  persist(
    (set, get) => ({
      items: [],
      toggle: (story) => {
        const exists = get().items.some((s) => s.id === story.id);
        if (exists) {
          set({ items: get().items.filter((s) => s.id !== story.id) });
          return;
        }
        set({ items: [story, ...get().items].slice(0, 100) });
      },
      has: (id) => get().items.some((s) => s.id === id),
      remove: (id) =>
        set({ items: get().items.filter((s) => s.id !== id) }),
      clear: () => set({ items: [] }),
    }),
    { name: "cf-discover-bookmarks-v1" },
  ),
);
