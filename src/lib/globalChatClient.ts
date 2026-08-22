import type {
  GlobalChatEventEnvelope,
  GlobalChatMessage,
  SendGlobalChatMessage,
} from "../types/chat";
import {
  fetchGlobalChatHistory,
  sendGlobalChatMessage,
} from "./globalChatApi";

export interface GlobalChatTransport {
  connect(listener: (event: GlobalChatEventEnvelope) => void): () => void;
  send(input: SendGlobalChatMessage): Promise<GlobalChatMessage>;
  report(messageId: string, reason: string): Promise<void>;
}

export const SEEDED_GLOBAL_MESSAGES: GlobalChatMessage[] = [];

class LiveGlobalChatTransport implements GlobalChatTransport {
  connect(listener: (event: GlobalChatEventEnvelope) => void) {
    void fetchGlobalChatHistory()
      .then((messages) => {
        listener({
          type: "presence",
          sequence: 0,
          emittedAt: new Date().toISOString(),
          payload: { online: messages.length > 0 ? -1 : 0, connected: true },
        } as GlobalChatEventEnvelope);
        listener({
          type: "history",
          sequence: messages[messages.length - 1]?.sequence ?? 0,
          emittedAt: new Date().toISOString(),
          payload: { messages },
        });
      })
      .catch(() => {
        listener({
          type: "presence",
          sequence: 0,
          emittedAt: new Date().toISOString(),
          payload: { online: 0, connected: false },
        } as GlobalChatEventEnvelope);
        listener({
          type: "history",
          sequence: 0,
          emittedAt: new Date().toISOString(),
          payload: { messages: [] },
        });
      });
    return () => undefined;
  }

  async send(input: SendGlobalChatMessage): Promise<GlobalChatMessage> {
    const message = await sendGlobalChatMessage(input.body);
    return { ...message, clientNonce: input.clientNonce, delivery: "sent" };
  }

  async report(_messageId: string, _reason: string) {
    /* moderation endpoint not in manifest yet */
  }
}

export const globalChatClient: GlobalChatTransport =
  new LiveGlobalChatTransport();
