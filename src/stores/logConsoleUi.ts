import { create } from "zustand";

type LogConsoleUiStore = {
  open: boolean;
  toggle: () => void;
  setOpen: (open: boolean) => void;
};

export const useLogConsoleUiStore = create<LogConsoleUiStore>((set) => ({
  open: false,
  toggle: () => set((state) => ({ open: !state.open })),
  setOpen: (open) => set({ open }),
}));
