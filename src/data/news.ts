export type NewsCategory = "Launcher" | "Community" | "Packs";

export type DiscoverFilter = "All" | NewsCategory;

export type NewsStory = {
  id: string;
  title: string;
  dek: string;
  category: NewsCategory;
  date: string;
  readMin: number;
  thumb: string;
  slides: string[];
};

const THUMB: Record<NewsCategory, string> = {
  Launcher:
    "linear-gradient(135deg,#0a1210_0%,#122820_40%,#1a3830_70%,#0c1014_100%)",
  Community:
    "linear-gradient(135deg,#101018_0%,#1c1830_40%,#2a2048_70%,#0e0e14_100%)",
  Packs:
    "linear-gradient(135deg,#0e1218_0%,#1a2438_40%,#243050_70%,#0c1018_100%)",
};

export function thumbForCategory(category: NewsCategory): string {
  return THUMB[category];
}

export const NEWS_FEED: NewsStory[] = [];

export const DISCOVER_FILTERS: DiscoverFilter[] = [
  "All",
  "Launcher",
  "Community",
  "Packs",
];

export function filterNews(
  stories: NewsStory[],
  category: DiscoverFilter,
): NewsStory[] {
  if (category === "All") return stories;
  return stories.filter((s) => s.category === category);
}

