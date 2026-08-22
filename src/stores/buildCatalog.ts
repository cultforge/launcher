import { create } from "zustand";
import {
  searchPublicBuilds,
  fetchCatalogBuildDetail,
  type CatalogSearchParams,
} from "../lib/buildCatalogApi";
import type { CatalogBuildRecord } from "../types/catalog";

type BuildCatalogStore = {
  query: string;
  keywords: string;
  loader: string;
  minecraftVersion: string;
  results: CatalogBuildRecord[];
  loading: boolean;
  error: string | null;
  detail: CatalogBuildRecord | null;
  detailLoading: boolean;
  setQuery: (q: string) => void;
  setKeywords: (k: string) => void;
  setLoader: (l: string) => void;
  setMinecraftVersion: (v: string) => void;
  search: () => Promise<void>;
  openDetail: (buildId: string) => Promise<void>;
  closeDetail: () => void;
};

export const useBuildCatalogStore = create<BuildCatalogStore>((set, get) => ({
  query: "",
  keywords: "",
  loader: "",
  minecraftVersion: "",
  results: [],
  loading: false,
  error: null,
  detail: null,
  detailLoading: false,
  setQuery: (query) => set({ query }),
  setKeywords: (keywords) => set({ keywords }),
  setLoader: (loader) => set({ loader }),
  setMinecraftVersion: (minecraftVersion) => set({ minecraftVersion }),
  search: async () => {
    set({ loading: true, error: null });
    try {
      const { query, keywords, loader, minecraftVersion } = get();
      const params: CatalogSearchParams = {};
      if (query) params.q = query;
      if (keywords) params.keywords = keywords;
      if (loader) params.loader = loader;
      if (minecraftVersion) params.minecraftVersion = minecraftVersion;
      params.limit = 60;
      const results = await searchPublicBuilds(params);
      set({ results, loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Search failed",
      });
    }
  },
  openDetail: async (buildId) => {
    set({ detailLoading: true });
    try {
      const detail = await fetchCatalogBuildDetail(buildId);
      set({ detail, detailLoading: false });
    } catch {
      set({ detailLoading: false });
    }
  },
  closeDetail: () => set({ detail: null }),
}));
