import { create } from "zustand";
import {
  dmSendAlert,
  fetchDmConversations,
  fetchDmHistory,
  markDmRead,
  sendDm,
  type DmConversation,
  type DmMessage,
  type DmSendAlert,
} from "../lib/dmApi";

type DmStore = {
  open: boolean;
  conversations: DmConversation[];
  activePeerId: string | null;
  messages: DmMessage[];
  draft: string;
  loading: boolean;
  error: string | null;
  sendAlert: DmSendAlert | null;
  setOpen: (open: boolean) => void;
  setDraft: (draft: string) => void;
  clearSendAlert: () => void;
  openPeer: (peerId: string) => Promise<void>;
  refreshConversations: () => Promise<void>;
  send: (content?: string) => Promise<void>;
};

export const useDmStore = create<DmStore>((set, get) => ({
  open: false,
  conversations: [],
  activePeerId: null,
  messages: [],
  draft: "",
  loading: false,
  error: null,
  sendAlert: null,
  setOpen: (open) => {
    set({ open, sendAlert: open ? get().sendAlert : null });
    if (open) void get().refreshConversations();
  },
  setDraft: (draft) => set({ draft }),
  clearSendAlert: () => set({ sendAlert: null }),
  refreshConversations: async () => {
    try {
      const conversations = await fetchDmConversations();
      set({ conversations, error: null });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Could not load DMs",
      });
    }
  },
  openPeer: async (peerId) => {
    if (!peerId) return;
    set({
      open: true,
      activePeerId: peerId,
      loading: true,
      error: null,
      sendAlert: null,
      draft: "",
    });
    try {
      const [messages] = await Promise.all([
        fetchDmHistory(peerId),
        markDmRead(peerId).catch(() => undefined),
        get().refreshConversations(),
      ]);
      set({ messages, loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Could not open conversation",
      });
    }
  },
  send: async (content) => {
    const peerId = get().activePeerId;
    const fromDraft = content == null;
    const body = (content ?? get().draft).trim();
    if (!peerId || !body) return;
    const optimistic: DmMessage = {
      id: `local-${Date.now()}`,
      senderId: "me",
      receiverId: peerId,
      content: body,
      isRead: true,
      createdAt: new Date().toISOString(),
      senderName: "You",
    };
    set((state) => ({
      draft: fromDraft ? "" : state.draft,
      messages: [...state.messages, optimistic],
    }));
    try {
      const saved = await sendDm(peerId, body);
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === optimistic.id ? saved : m,
        ),
      }));
      void get().refreshConversations();
    } catch (err) {
      set((state) => ({
        messages: state.messages.filter((m) => m.id !== optimistic.id),
        draft: fromDraft ? body : state.draft,
        sendAlert: dmSendAlert(err),
      }));
    }
  },
}));
