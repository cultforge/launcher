import { create } from "zustand";
import type { DiscoverFilter } from "../data/news";

type DiscoverStore = {
  category: DiscoverFilter;
  setCategory: (category: DiscoverFilter) => void;
};

export const useDiscoverStore = create<DiscoverStore>((set) => ({
  category: "All",
  setCategory: (category) => set({ category }),
}));
