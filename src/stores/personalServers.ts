import { create } from "zustand";
import {
  listPersonalServers,
  createPersonalServer,
  updatePersonalServer,
  deletePersonalServer,
  type PersonalServerWritePayload,
} from "../lib/personalServersApi";
import type { UserPersonalServerRecord } from "../types/catalog";

type PersonalServersStore = {
  servers: UserPersonalServerRecord[];
  selected: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  select: (id: string | null) => void;
  create: (p: PersonalServerWritePayload) => Promise<UserPersonalServerRecord>;
  update: (
    id: string,
    p: Partial<PersonalServerWritePayload>,
  ) => Promise<UserPersonalServerRecord>;
  remove: (id: string) => Promise<void>;
};

export const usePersonalServersStore = create<PersonalServersStore>((set) => ({
    servers: [],
    selected: null,
    loading: false,
    error: null,
    refresh: async () => {
      set({ loading: true, error: null });
      try {
        const servers = await listPersonalServers();
        set({ servers, loading: false });
      } catch (err) {
        set({
          loading: false,
          error: err instanceof Error ? err.message : "Could not load servers",
        });
      }
    },
    select: (id) => set({ selected: id }),
    create: async (p) => {
      const server = await createPersonalServer(p);
      set((s) => ({ servers: [...s.servers, server] }));
      return server;
    },
    update: async (id, p) => {
      const server = await updatePersonalServer(id, p);
      set((s) => ({
        servers: s.servers.map((srv) => (srv.id === id ? server : srv)),
      }));
      return server;
    },
    remove: async (id) => {
      await deletePersonalServer(id);
      set((s) => ({
        servers: s.servers.filter((srv) => srv.id !== id),
        selected: s.selected === id ? null : s.selected,
      }));
    },
}));
