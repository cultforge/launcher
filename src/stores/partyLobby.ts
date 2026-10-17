import { create } from "zustand";
import { toast } from "sonner";
import {
  cancelPartyLobby,
  createPartyLobby,
  fetchMyPartyLobby,
  fetchPartyLobby,
  inviteToPartyLobby,
  joinPartyLobby,
  kickFromPartyLobby,
  leavePartyLobby,
  setPartyLobbyReady,
  startPartyLobby,
  updatePartyLobby,
  type LobbyScope,
  type PartyLobby,
} from "../lib/partyLobbyApi";

type PartyLobbyStore = {
  lobby: PartyLobby | null;
  loading: boolean;
  busy: boolean;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  refreshMe: () => Promise<void>;
  openLobby: (lobbyIdOrCode: string) => Promise<void>;
  create: (input: {
    scope: LobbyScope;
    guildId?: string;
    capacity?: number;
    targetServerKind?: string;
    targetServerId?: string;
  }) => Promise<PartyLobby | null>;
  join: (input: { lobbyId?: string; inviteCode?: string }) => Promise<void>;
  invite: (userIds: string[]) => Promise<void>;
  setReady: (ready: boolean) => Promise<void>;
  setTarget: (opts: {
    targetServerKind: string;
    targetServerId: string;
  }) => Promise<void>;
  start: () => Promise<PartyLobby | null>;
  leave: () => Promise<void>;
  kick: (userId: string) => Promise<void>;
  cancel: () => Promise<void>;
};

export const usePartyLobbyStore = create<PartyLobbyStore>((set, get) => ({
  lobby: null,
  loading: false,
  busy: false,
  panelOpen: false,

  setPanelOpen: (panelOpen) => set({ panelOpen }),

  refreshMe: async () => {
    set({ loading: true });
    try {
      const lobby = await fetchMyPartyLobby();
      set({ lobby, panelOpen: Boolean(lobby) || get().panelOpen });
    } catch (err) {
      toast.message("Lobby unavailable", {
        description: err instanceof Error ? err.message : "Could not load",
      });
    } finally {
      set({ loading: false });
    }
  },

  openLobby: async (lobbyIdOrCode) => {
    set({ loading: true, panelOpen: true });
    try {
      let lobby: PartyLobby | null = null;
      try {
        lobby = await fetchPartyLobby(lobbyIdOrCode);
      } catch {
        lobby = await joinPartyLobby({ inviteCode: lobbyIdOrCode });
      }
      set({ lobby });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open lobby");
    } finally {
      set({ loading: false });
    }
  },

  create: async (input) => {
    set({ busy: true });
    try {
      const lobby = await createPartyLobby(input);
      set({ lobby, panelOpen: true });
      toast.success("Party lobby created");
      return lobby;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
      return null;
    } finally {
      set({ busy: false });
    }
  },

  join: async (input) => {
    set({ busy: true });
    try {
      const lobby = await joinPartyLobby(input);
      set({ lobby, panelOpen: true });
      toast.success("Joined lobby");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Join failed");
    } finally {
      set({ busy: false });
    }
  },

  invite: async (userIds) => {
    const lobby = get().lobby;
    if (!lobby || !userIds.length) return;
    set({ busy: true });
    try {
      const next = await inviteToPartyLobby(lobby.id, userIds);
      set({ lobby: next });
      toast.success("Invites sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invite failed");
    } finally {
      set({ busy: false });
    }
  },

  setReady: async (ready) => {
    const lobby = get().lobby;
    if (!lobby) return;
    set({ busy: true });
    try {
      const next = await setPartyLobbyReady(lobby.id, ready);
      set({ lobby: next });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ready failed");
    } finally {
      set({ busy: false });
    }
  },

  setTarget: async (opts) => {
    const lobby = get().lobby;
    if (!lobby) return;
    set({ busy: true });
    try {
      const next = await updatePartyLobby(lobby.id, opts);
      set({ lobby: next });
      toast.success("Target server set");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Target update failed");
    } finally {
      set({ busy: false });
    }
  },

  start: async () => {
    const lobby = get().lobby;
    if (!lobby) return null;
    set({ busy: true });
    try {
      const next = await startPartyLobby(lobby.id);
      set({ lobby: next });
      toast.success("Lobby starting");
      return next;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Start failed");
      return null;
    } finally {
      set({ busy: false });
    }
  },

  leave: async () => {
    const lobby = get().lobby;
    if (!lobby) return;
    set({ busy: true });
    try {
      await leavePartyLobby(lobby.id);
      set({ lobby: null });
      toast.message("Left lobby");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Leave failed");
    } finally {
      set({ busy: false });
    }
  },

  kick: async (userId) => {
    const lobby = get().lobby;
    if (!lobby) return;
    set({ busy: true });
    try {
      const next = await kickFromPartyLobby(lobby.id, userId);
      set({ lobby: next });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kick failed");
    } finally {
      set({ busy: false });
    }
  },

  cancel: async () => {
    const lobby = get().lobby;
    if (!lobby) return;
    set({ busy: true });
    try {
      await cancelPartyLobby(lobby.id);
      set({ lobby: null });
      toast.message("Lobby cancelled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      set({ busy: false });
    }
  },
}));
