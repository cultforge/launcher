import { create } from "zustand";
import { getPreference, setPreference } from "../lib/persistentStore";

type PersistedDockState = {
  collapsed: boolean;
};

type ContextDockStore = {
  hydrated: boolean;
  collapsed: boolean;
  hydrate: () => Promise<void>;
  setCollapsed: (collapsed: boolean) => void;
  toggleCollapsed: () => void;
};

const persistenceKey = "context-dock";

function persist(get: () => ContextDockStore) {
  const value: PersistedDockState = { collapsed: get().collapsed };
  void setPreference(persistenceKey, value);
}

/** Bottom clearance reserved for the floating context dock. */
export function dockClearanceCss(collapsed: boolean): string {
  return collapsed ? "4.25rem" : "6.5rem";
}

export const useContextDockStore = create<ContextDockStore>((set, get) => ({
  hydrated: false,
  collapsed: false,
  hydrate: async () => {
    const saved = await getPreference<PersistedDockState>(persistenceKey);
    set({
      hydrated: true,
      collapsed: Boolean(saved?.collapsed),
    });
  },
  setCollapsed: (collapsed) => {
    set({ collapsed });
    persist(get);
  },
  toggleCollapsed: () => {
    set({ collapsed: !get().collapsed });
    persist(get);
  },
}));
