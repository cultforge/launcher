import { create } from "zustand";

export type BuildModalId =
  | "settings"
  | "folder"
  | "backup"
  | "export"
  | "duplicate"
  | "add";

type BuildModalsStore = {
  open: BuildModalId | null;
  openModal: (id: BuildModalId) => void;
  closeModal: () => void;
};

export const useBuildModalsStore = create<BuildModalsStore>((set) => ({
  open: null,
  openModal: (id) => set({ open: id }),
  closeModal: () => set({ open: null }),
}));
