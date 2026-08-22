import { create } from "zustand";

export type ServerAdminSection =
  | "overview"
  | "agent"
  | "metrics"
  | "command"
  | "workloads"
  | "console"
  | "players"
  | "files"
  | "backups"
  | "schedules"
  | "plugins"
  | "worlds"
  | "settings"
  | "network"
  // Legacy aliases remapped in the panel.
  | "logs"
  | "database"
  | "terminal";

type ServerAdminStore = {
  serverId: string | null;
  section: ServerAdminSection;
  open: (serverId: string, section?: ServerAdminSection) => void;
  close: () => void;
  setSection: (section: ServerAdminSection) => void;
};

export const useServerAdminStore = create<ServerAdminStore>((set) => ({
  serverId: null,
  section: "overview",
  open: (serverId, section = "overview") => set({ serverId, section }),
  close: () => set({ serverId: null, section: "overview" }),
  setSection: (section) => set({ section }),
}));
