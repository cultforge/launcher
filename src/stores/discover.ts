import { create } from "zustand";
import type { DiscoverFilter, NewsStory } from "../data/news";
import { filterNews } from "../data/news";
import type { DiscoverGuildCard } from "../lib/cultApi";
import {
  fetchGuildDiscover,
  fetchNewsFeed,
  kindsForFilter,
  newsStoryFromFeedCard,
} from "../lib/newsFeedApi";
import {
  fetchMinecraftOfficialNews,
  fetchOpenMinecraftNews,
} from "../lib/minecraftNews";
import { useDiscoverBookmarksStore } from "./discoverBookmarks";
import { logger } from "../lib/logger";

type DiscoverStore = {
  category: DiscoverFilter;
  setCategory: (category: DiscoverFilter) => void;
  stories: NewsStory[];
  guilds: DiscoverGuildCard[];
  loading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
  refresh: (opts?: { force?: boolean }) => Promise<void>;
  filteredStories: () => NewsStory[];
};

let inFlight: Promise<void> | null = null;

function dedupeStories(stories: NewsStory[]): NewsStory[] {
  const seen = new Set<string>();
  const out: NewsStory[] = [];
  for (const s of stories) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}

export const useDiscoverStore = create<DiscoverStore>((set, get) => ({
  category: "All",
  setCategory: (category) => {
    set({ category });
    if (category !== "Saved") void get().refresh();
  },
  stories: [],
  guilds: [],
  loading: false,
  error: null,
  lastFetchedAt: null,

  filteredStories: () => {
    const category = get().category;
    if (category === "Saved") {
      return useDiscoverBookmarksStore.getState().items;
    }
    return filterNews(get().stories, category);
  },

  refresh: async (opts) => {
    if (inFlight) return inFlight;
    const prev = get().lastFetchedAt;
    if (!opts?.force && prev && Date.now() - prev < 15_000 && get().stories.length) {
      return;
    }
    set({ loading: true, error: null });
    inFlight = (async () => {
      try {
        const kinds = kindsForFilter(
          get().category === "Minecraft" || get().category === "Saved"
            ? "All"
            : get().category,
        );
        const [feed, guildsPage, mojang, mcnet] = await Promise.all([
          fetchNewsFeed({ kinds, limit: 40 }).catch((e) => {
            logger.warn(
              `CultForge news skipped: ${e instanceof Error ? e.message : String(e)}`,
            );
            return { items: [] as Awaited<ReturnType<typeof fetchNewsFeed>>["items"] };
          }),
          fetchGuildDiscover({
            sort: "featured",
            featured: true,
            limit: 12,
          }).catch((e) => {
            logger.warn(
              `Guild discover skipped: ${e instanceof Error ? e.message : String(e)}`,
            );
            return { items: [] as DiscoverGuildCard[] };
          }),
          fetchMinecraftOfficialNews(20),
          fetchOpenMinecraftNews(10),
        ]);
        let stories = dedupeStories([
          ...feed.items.map(newsStoryFromFeedCard),
          ...mojang,
          ...mcnet,
        ]);
        if (get().category === "Packs") {
          stories = filterNews(stories, "Packs");
        } else if (get().category === "Minecraft") {
          stories = filterNews(stories, "Minecraft");
        }
        set({
          stories,
          guilds: guildsPage.items,
          loading: false,
          error: null,
          lastFetchedAt: Date.now(),
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logger.warn(`Discover refresh failed: ${message}`);
        set({ loading: false, error: message });
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  },
}));
