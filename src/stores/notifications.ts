import { create } from "zustand";
import { DEMO_ALERTS, type AlertItem } from "../data/alerts";
import {
  acceptGuildInvite,
  alertFromNotification,
  fetchMyNotifications,
  fetchPendingCuratedInvites,
  markAllNotificationsRead,
  markNotificationRead,
  type PendingInvite,
  type RemoteNotification,
} from "../lib/cultApi";
import { logger } from "../lib/logger";
import {
  rememberNotificationsToasted,
  toastNewNotifications,
} from "../lib/osToasts";

type NotificationsStore = {
  hydrated: boolean;
  items: AlertItem[];
  remotes: RemoteNotification[];
  pendingInvites: PendingInvite[];
  unreadCount: number;
  isUnread: (id: string) => boolean;
  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  markRead: (id: string) => void;
  markAllRead: () => void;
  acceptInvite: (code: string) => Promise<{ ok: true } | { ok: false; message: string }>;
};

function unreadFrom(remotes: RemoteNotification[]): number {
  return remotes.filter((n) => !n.is_read).length;
}

export const useNotificationsStore = create<NotificationsStore>((set, get) => ({
  hydrated: false,
  items: DEMO_ALERTS,
  remotes: [],
  pendingInvites: [],
  unreadCount: 0,
  isUnread: (id) => {
    const remote = get().remotes.find((n) => n.id === id);
    if (remote) return !remote.is_read;
    return false;
  },
  hydrate: async () => {
    await get().refresh();
    set({ hydrated: true });
  },
  refresh: async () => {
    try {
      const [remotes, pendingInvites] = await Promise.all([
        fetchMyNotifications({ limit: 50 }),
        fetchPendingCuratedInvites().catch(() => [] as PendingInvite[]),
      ]);
      set({
        remotes,
        pendingInvites,
        items: remotes.map(alertFromNotification),
        unreadCount: unreadFrom(remotes),
      });
      void toastNewNotifications(remotes);
    } catch (err) {
      logger.warn(
        `Notifications refresh failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      set({
        remotes: [],
        pendingInvites: [],
        items: [],
        unreadCount: 0,
      });
    }
  },
  markRead: (id) => {
    const { remotes } = get();
    if (!remotes.some((n) => n.id === id && !n.is_read)) {
      void rememberNotificationsToasted([id]);
      return;
    }
    const next = remotes.map((n) =>
      n.id === id ? { ...n, is_read: true } : n,
    );
    set({
      remotes: next,
      items: next.map(alertFromNotification),
      unreadCount: unreadFrom(next),
    });
    void rememberNotificationsToasted([id]);
    void markNotificationRead(id).catch((err) => {
      logger.warn(
        `markNotificationRead failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
  },
  markAllRead: () => {
    const { remotes } = get();
    const ids = remotes.map((n) => n.id);
    const next = remotes.map((n) => ({ ...n, is_read: true }));
    set({
      remotes: next,
      items: next.map(alertFromNotification),
      unreadCount: 0,
    });
    void rememberNotificationsToasted(ids);
    void markAllNotificationsRead().catch((err) => {
      logger.warn(
        `markAllNotificationsRead failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
  },
  acceptInvite: async (code) => {
    try {
      await acceptGuildInvite(code);
      await get().refresh();
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Could not accept invite",
      };
    }
  },
}));
