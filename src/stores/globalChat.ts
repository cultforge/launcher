import { create } from "zustand";
import { globalChatClient } from "../lib/globalChatClient";
import type {
  GlobalChatEventEnvelope,
  GlobalChatMessage,
  GlobalChatUnreadCursor,
} from "../types/chat";
import { useAppStore } from "../userstore";

type GlobalChatStore = {
  open: boolean;
  connected: boolean;
  messages: GlobalChatMessage[];
  draft: string;
  online: number;
  cursor: GlobalChatUnreadCursor;
  feedback: string | null;
  setOpen: (open: boolean) => void;
  setDraft: (draft: string) => void;
  connect: () => () => void;
  receive: (event: GlobalChatEventEnvelope) => void;
  send: () => Promise<void>;
  report: (messageId: string) => Promise<void>;
  clearFeedback: () => void;
};

export const useGlobalChatStore = create<GlobalChatStore>((set, get) => ({
  open: false,
  connected: false,
  messages: [],
  draft: "",
  online: 0,
  cursor: {
    lastReadSequence: 0,
    unreadCount: 0,
  },
  feedback: null,
  setOpen: (open) =>
    set((state) => ({
      open,
      cursor: open
        ? {
            lastReadSequence:
              state.messages[state.messages.length - 1]?.sequence ??
              state.cursor.lastReadSequence,
            unreadCount: 0,
          }
        : state.cursor,
    })),
  setDraft: (draft) => set({ draft }),
  connect: () => {
    set({ connected: true });
    const disconnect = globalChatClient.connect(get().receive);
    return () => {
      disconnect();
      set({ connected: false });
    };
  },
  receive: (event) => {
    if (event.type === "presence") {
      set({ online: event.payload.online });
      return;
    }
    if (event.type === "history") {
      set((state) => {
        const local = state.messages.filter(
          (message) => message.delivery !== "sent" || message.clientNonce,
        );
        const byId = new Map(
          [...event.payload.messages, ...local].map((message) => [
            message.id,
            message,
          ]),
        );
        return {
          messages: [...byId.values()].sort(
            (left, right) => left.sequence - right.sequence,
          ),
        };
      });
      return;
    }
    const message = event.payload.message;
    set((state) => ({
      messages: [
        ...state.messages.filter((item) => item.id !== message.id),
        message,
      ].sort((left, right) => left.sequence - right.sequence),
      cursor: state.open
        ? {
            lastReadSequence: message.sequence,
            unreadCount: 0,
          }
        : {
            ...state.cursor,
            unreadCount: state.cursor.unreadCount + 1,
          },
    }));
  },
  send: async () => {
    const body = get().draft.trim();
    if (!body) return;
    const currentUser = useAppStore.getState().currentUser;
    if (!currentUser) return;
    const author = {
      id: currentUser.id,
      displayName: currentUser.name,
      avatarUrl: currentUser.avatarUrl,
      role: "member" as const,
    };
    const nonce =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `nonce-${Date.now()}`;
    const optimisticSequence =
      Math.max(0, ...get().messages.map((message) => message.sequence)) + 1;
    const optimistic: GlobalChatMessage = {
      id: `pending-${nonce}`,
      sequence: optimisticSequence,
      author,
      body,
      createdAt: new Date().toISOString(),
      clientNonce: nonce,
      delivery: "pending",
      moderation: { reportable: false, labels: [] },
    };
    set((state) => ({
      draft: "",
      messages: [...state.messages, optimistic],
    }));

    try {
      const sent = await globalChatClient.send({ body, clientNonce: nonce });
      const normalized = { ...sent, author };
      set((state) => ({
        messages: state.messages.map((message) =>
          message.clientNonce === nonce ? normalized : message,
        ),
      }));
    } catch {
      set((state) => ({
        messages: state.messages.map((message) =>
          message.clientNonce === nonce
            ? { ...message, delivery: "failed" }
            : message,
        ),
      }));
    }
  },
  report: async (messageId) => {
    await globalChatClient.report(messageId, "user-report");
    set({ feedback: "Report recorded." });
  },
  clearFeedback: () => set({ feedback: null }),
}));
