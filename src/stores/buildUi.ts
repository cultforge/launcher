import { create } from "zustand";

export const BUILD_TAB_IDS = [
  "Overview",
  "Mods",
  "Configuration",
  "Performance",
  "Packs",
  "World Management",
  "Shaders",
  "Notes",
  "Backups",
] as const;

export type BuildTabId = (typeof BUILD_TAB_IDS)[number];

type BuildUiStore = {
  activeTab: BuildTabId;
  setActiveTab: (tab: BuildTabId) => void;
};

export const useBuildUiStore = create<BuildUiStore>((set) => ({
  activeTab: "Overview",
  setActiveTab: (activeTab) => set({ activeTab }),
}));
