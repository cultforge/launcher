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

export const useDiscoverStore = create<DiscoverStore>((set, get) => ({
  category: "All",
  setCategory: (category) => {
    set({ category });
    void get().refresh();
  },
  stories: [],
  guilds: [],
  loading: false,
  error: null,
  lastFetchedAt: null,

  filteredStories: () => filterNews(get().stories, get().category),

  refresh: async (opts) => {
    if (inFlight) return inFlight;
    const prev = get().lastFetchedAt;
    if (!opts?.force && prev && Date.now() - prev < 15_000 && get().stories.length) {
      return;
    }
    set({ loading: true, error: null });
    inFlight = (async () => {
      try {
        const kinds = kindsForFilter(get().category);
        const [feed, guildsPage] = await Promise.all([
          fetchNewsFeed({ kinds, limit: 40 }),
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
        ]);
        let stories = feed.items.map(newsStoryFromFeedCard);
        if (get().category === "Packs") {
          stories = filterNews(stories, "Packs");
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
