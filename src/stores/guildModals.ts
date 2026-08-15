import { create } from "zustand";

export type GuildModalId =
  | "create"
  | "invite"
  | "member"
  | "event"
  | "announcement"
  | "leave"
  | "transfer"
  | "server"
  | "ranking"
  | "build";

type GuildModalStore = {
  modal: GuildModalId | null;
  targetId: string | null;
  open: (modal: GuildModalId, targetId?: string) => void;
  close: () => void;
};

export const useGuildModalsStore = create<GuildModalStore>((set) => ({
  modal: null,
  targetId: null,
  open: (modal, targetId = "") => set({ modal, targetId: targetId || null }),
  close: () => set({ modal: null, targetId: null }),
}));
