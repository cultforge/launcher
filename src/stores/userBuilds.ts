import { create } from "zustand";
import {
  listMyBuilds,
  createUserBuild,
  updateUserBuild,
  deleteUserBuild,
  fetchMyBuild,
  type UserBuildWritePayload,
} from "../lib/userBuildsApi";
import type { UserBuildRecord } from "../types/catalog";

type UserBuildsStore = {
  builds: UserBuildRecord[];
  loading: boolean;
  error: string | null;
  editing: string | null;
  refresh: () => Promise<void>;
  setEditing: (id: string | null) => void;
  create: (p: UserBuildWritePayload) => Promise<UserBuildRecord>;
  update: (
    id: string,
    p: Partial<UserBuildWritePayload>,
  ) => Promise<UserBuildRecord>;
  remove: (id: string) => Promise<void>;
};

export const useUserBuildsStore = create<UserBuildsStore>((set) => ({
  builds: [],
  loading: false,
  error: null,
  editing: null,
  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const builds = await listMyBuilds();
      set({ builds, loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Could not load builds",
      });
    }
  },
  setEditing: async (editing) => {
    set({ editing });
    if (!editing) return;
    try {
      const full = await fetchMyBuild(editing);
      set((s) => ({
        builds: s.builds.map((b) => (b.id === full.id ? full : b)),
      }));
    } catch {
      /* keep list row */
    }
  },
  create: async (p) => {
    const build = await createUserBuild(p);
    set((s) => ({ builds: [...s.builds, build] }));
    return build;
  },
  update: async (id, p) => {
    const build = await updateUserBuild(id, p);
    set((s) => ({
      builds: s.builds.map((b) => (b.id === id ? build : b)),
    }));
    return build;
  },
  remove: async (id) => {
    await deleteUserBuild(id);
    set((s) => ({
      builds: s.builds.filter((b) => b.id !== id),
      editing: s.editing === id ? null : s.editing,
    }));
  },
}));
