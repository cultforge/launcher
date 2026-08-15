import { create } from "zustand";

type PresenceMap = Record<string, boolean>;

interface PresenceState {
  /** user_id → online */
  onlineById: PresenceMap;
  setSnapshot: (onlineIds: string[]) => void;
  setUserOnline: (userId: string, online: boolean) => void;
  clear: () => void;
  isOnline: (userId: string) => boolean;
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  onlineById: {},
  setSnapshot: (onlineIds) => {
    const next: PresenceMap = {};
    for (const id of onlineIds) {
      if (id) next[id] = true;
    }
    set({ onlineById: next });
  },
  setUserOnline: (userId, online) => {
    if (!userId) return;
    set((state) => {
      const onlineById = { ...state.onlineById };
      if (online) onlineById[userId] = true;
      else delete onlineById[userId];
      return { onlineById };
    });
  },
  clear: () => set({ onlineById: {} }),
  isOnline: (userId) => Boolean(get().onlineById[userId]),
}));
