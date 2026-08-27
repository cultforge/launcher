import { create } from "zustand";

export type SettingsCategory =
  | "appearance"
  | "general"
  | "audio"
  | "notifications"
  | "paths"
  | "licenses"
  | "experimental";

type SettingsUiStore = {
  category: SettingsCategory;
  setCategory: (category: SettingsCategory) => void;
};

export const useSettingsUiStore = create<SettingsUiStore>((set) => ({
  category: "appearance",
  setCategory: (category) => set({ category }),
}));
