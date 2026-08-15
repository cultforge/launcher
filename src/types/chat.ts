export type GlobalChatDelivery = "pending" | "sent" | "failed";

export type GlobalChatAuthor = {
  id: string;
  displayName: string;
  avatarUrl?: string;
  role?: "member" | "moderator" | "staff";
};

export type GlobalChatModeration = {
  reportable: boolean;
  editedAt?: string;
  removedAt?: string;
  labels?: string[];
};

export type GlobalChatMessage = {
  id: string;
  sequence: number;
  author: GlobalChatAuthor;
  body: string;
  createdAt: string;
  clientNonce?: string;
  delivery: GlobalChatDelivery;
  moderation: GlobalChatModeration;
};

export type GlobalChatUnreadCursor = {
  lastReadSequence: number;
  unreadCount: number;
};

export type GlobalChatEventEnvelope =
  | {
      type: "history";
      sequence: number;
      emittedAt: string;
      payload: { messages: GlobalChatMessage[] };
    }
  | {
      type: "message.created" | "message.updated";
      sequence: number;
      emittedAt: string;
      payload: { message: GlobalChatMessage };
    }
  | {
      type: "presence";
      sequence: number;
      emittedAt: string;
      payload: { online: number };
    };

export type SendGlobalChatMessage = {
  body: string;
  clientNonce: string;
};
