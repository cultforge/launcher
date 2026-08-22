import { create } from "zustand";
import {
  GUILD_HUB_TABS,
  allGuilds,
  clearLiveGuilds,
  getGuild,
  setLiveGuilds,
  upsertLiveGuild,
  type ChatMessage,
  type Guild,
  type GuildEvent,
  type GuildHubTab,
  type GuildMember,
  type GuildNewsItem,
  type GuildRole,
  type GuildServer,
  type LeaderboardRow,
  type RankingMetric,
  guildServerJoinAddress,
} from "../data/guilds";
import type { GuildBuildRelease } from "../types/buildManifest";
import { parseDiscordGuildSource } from "../lib/discordWidget";
import {
  canManageMember,
  capabilitiesForRole,
  membershipForUser,
  resolveGuildChatRole,
} from "../lib/guildPermissions";
import {
  fetchGuildManifest,
  fetchGuildMembers,
  fetchMyGuildManifestCards,
  guildFromCard,
  guildFromManifest,
  kickGuildMember,
  membershipFromApiRecord,
  membershipFromViewer,
  refreshGuildMembers,
  setGuildMemberLauncherRole,
  updateGuildDiscordSource,
  applyGuildBranding,
  DEFAULT_GUILD_BANNER,
  createGuildInvite,
  leaveGuildRemote,
} from "../lib/guildApi";
import { clearGuildMediaDisplayCache } from "../lib/guildMedia";
import type { GuildBrandingDraft } from "../lib/guildApi";
import {
  createGuildNews,
  createGuildEvent,
  eventFromApiRecord,
  newsFromApiRecord,
  updateGuildEvent,
  updateGuildNews,
  pinGuildNews,
  setEventRsvp,
  clearEventRsvp,
} from "../lib/guildContent";
import {
  ensureGuildChannels,
  fetchChannelMessages,
  pickDefaultChannel,
  sendChannelMessage,
  type GuildChannel,
} from "../lib/guildChat";
import { sortChatChronologically } from "../lib/chatOrdering";

function isOptimisticChatId(id: string): boolean {
  return id.startsWith("local-");
}

/** Merge a server message without duplicating optimistic or websocket echoes. */
function reconcileGuildChatMessages(
  messages: ChatMessage[],
  incoming: ChatMessage,
): ChatMessage[] {
  const withoutIdDupes = messages.filter((m) => m.id !== incoming.id);
  const withoutOptimistic = withoutIdDupes.filter((m) => {
    if (!isOptimisticChatId(m.id)) return true;
    const sameAuthor =
      incoming.authorId && m.authorId
        ? m.authorId === incoming.authorId
        : m.author === incoming.author;
    return !(sameAuthor && m.text === incoming.text);
  });
  return sortChatChronologically([...withoutOptimistic, incoming]);
}
import { sendClientWsFrame } from "../lib/clientLogSocket";
import {
  createGuildServer,
  deleteGuildServer,
  encodeServerExtras,
  fetchGuildServers,
  joinGuildServer,
  updateGuildServer,
} from "../lib/guildServersApi";
import { fetchGuildRankings } from "../lib/guildRankingsApi";
import {
  CacheKeys,
  readApiCache,
  writeApiCache,
  invalidateGuildCaches,
} from "../lib/apiCache";
import { searchCultUser } from "../lib/client";
import { mapApiProfileToCurrentUser } from "../lib/authProfile";
import { logger } from "../lib/logger";
import { useAppStore } from "../userstore";
import { parseEventSchedule } from "../lib/timedEvents";

type GuildSnapshot = {
  catalog: Guild[];
  members: GuildMember[];
  news: GuildNewsItem[];
  events: GuildEvent[];
  activeGuildId: string;
  discordOverrides: Record<string, string>;
};

async function persistGuildSnapshot(state: {
  members: GuildMember[];
  news: GuildNewsItem[];
  events: GuildEvent[];
  activeGuildId: string;
  discordOverrides: Record<string, string>;
}) {
  await writeApiCache(CacheKeys.guildSnapshot, {
    catalog: allGuilds(),
    members: state.members,
    news: state.news,
    events: state.events,
    activeGuildId: state.activeGuildId,
    discordOverrides: state.discordOverrides,
  } satisfies GuildSnapshot);
}

export type GuildActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export type GuildInvitation = {
  id: string;
  guildId: string;
  playerName: string;
  createdAt: string;
  status: "pending";
};

export type GuildAuditEntry = {
  id: string;
  guildId: string;
  actorId: string;
  action: string;
  target: string;
  occurredAt: string;
};

export type ManageSectionId =
  | "overview"
  | "branding"
  | "events"
  | "news"
  | "rankings"
  | "servers"
  | "builds"
  | "forms"
  | "hotfixes"
  | "discord"
  | "roster";

type GuildStore = {
  activeGuildId: string;
  setActiveGuild: (id: string) => void;
  hubTab: GuildHubTab;
  setHubTab: (tab: GuildHubTab) => void;
  rankingMetric: RankingMetric;
  setRankingMetric: (metric: RankingMetric) => void;
  selectedServerId: string | null;
  setSelectedServerId: (id: string | null) => void;
  chatByGuild: Record<string, ChatMessage[]>;
  channelsByGuild: Record<string, GuildChannel[]>;
  activeChannelByGuild: Record<string, string>;
  chatStatusByGuild: Record<
    string,
    { loading: boolean; error: string | null }
  >;
  setActiveChannel: (guildId: string, channelId: string) => void;
  hydrateGuildChat: (guildId: string) => Promise<void>;
  appendChatMessage: (guildId: string, message: ChatMessage) => void;
  sendChat: (guildId: string, text: string) => Promise<GuildActionResult>;
  discoverOpen: boolean;
  setDiscoverOpen: (open: boolean) => void;
  members: GuildMember[];
  events: GuildEvent[];
  news: GuildNewsItem[];
  focusNewsId: string | null;
  focusEventId: string | null;
  focusNews: (id: string | null) => void;
  focusEvent: (id: string | null) => void;
  clearContentFocus: () => void;
  invitations: GuildInvitation[];
  rsvps: Record<string, boolean>;
  audit: GuildAuditEntry[];
  discordOverrides: Record<string, string>;
  servers: GuildServer[];
  rankings: LeaderboardRow[];
  buildReleases: GuildBuildRelease[];
  /** Viewer JWT permissions from guild manifest (for fine-grained UI gates). */
  viewerPermissionsByGuild: Record<string, string[]>;
  manageSection: ManageSectionId;
  setManageSection: (section: ManageSectionId) => void;
  inviteMember: (
    guildId: string,
    playerName: string,
  ) => Promise<GuildActionResult & { inviteUrl?: string }>;
  setMemberRole: (
    guildId: string,
    memberId: string,
    role: Exclude<GuildRole, "Leader">,
  ) => Promise<GuildActionResult>;
  removeMember: (
    guildId: string,
    memberId: string,
  ) => Promise<GuildActionResult>;
  saveEvent: (event: GuildEvent) => Promise<GuildActionResult>;
  cancelEvent: (guildId: string, eventId: string) => Promise<GuildActionResult>;
  saveNews: (item: GuildNewsItem) => Promise<GuildActionResult>;
  deleteNews: (guildId: string, newsId: string) => Promise<GuildActionResult>;
  togglePinnedNews: (
    guildId: string,
    newsId: string,
  ) => Promise<GuildActionResult>;
  toggleRsvp: (
    guildId: string,
    eventId: string,
  ) => Promise<GuildActionResult>;
  hydrateGuildServers: (guildId: string) => Promise<void>;
  hydrateGuildRankings: (guildId: string) => Promise<void>;
  hydrateGuildBuilds: (guildId: string) => Promise<void>;
  patchBuildReleaseSizes: (
    releaseId: string,
    sizes: GuildBuildRelease["sizes"],
  ) => void;
  joinServer: (
    guildId: string,
    serverId: string,
  ) => Promise<GuildActionResult & { connect?: Record<string, unknown> | null }>;
  leaveGuild: (guildId: string) => Promise<GuildActionResult>;
  transferLeadership: (
    guildId: string,
    successorId: string,
  ) => GuildActionResult;
  setGuildDiscord: (
    guildId: string,
    source: string,
  ) => Promise<GuildActionResult>;
  setGuildBranding: (
    guildId: string,
    input: {
      icon?: GuildBrandingDraft;
      banner?: GuildBrandingDraft;
    },
  ) => Promise<GuildActionResult>;
  saveServer: (
    server: GuildServer,
    media?: {
      iconUpload?: import("../lib/guildBuildApi").GuildBuildImageUpload | null;
      coverUpload?: import("../lib/guildBuildApi").GuildBuildImageUpload | null;
    },
  ) => Promise<GuildActionResult>;
  deleteServer: (
    guildId: string,
    serverId: string,
  ) => Promise<GuildActionResult>;
  saveRankingRow: (row: LeaderboardRow) => GuildActionResult;
  deleteRankingRow: (
    guildId: string,
    metric: RankingMetric,
    name: string,
  ) => GuildActionResult;
  saveBuildRelease: (
    release: GuildBuildRelease,
    images?: {
      iconUpload?: import("../lib/guildBuildApi").GuildBuildImageUpload | null;
      coverUpload?: import("../lib/guildBuildApi").GuildBuildImageUpload | null;
    },
  ) => Promise<GuildActionResult>;
  deleteBuildRelease: (
    guildId: string,
    releaseId: string,
  ) => Promise<GuildActionResult>;
  /** Bumped when the live guild catalog changes so switcher re-renders. */
  guildCatalogRevision: number;
  /** Load joined guilds + viewer roles from CultForge guild APIs. */
  hydrateMyGuilds: () => Promise<void>;
  /** Refresh one guild's viewer permissions / identity. */
  refreshGuildManifest: (guildId: string) => Promise<void>;
  clearRemoteGuildState: () => void;
};

function actorId() {
  return useAppStore.getState().currentUser?.id ?? "";
}

function denied(message = "You do not have permission for this action."): GuildActionResult {
  return { ok: false, message };
}

export { GUILD_HUB_TABS };
export type { GuildHubTab };

export const useGuildStore = create<GuildStore>((set, get) => {
  function audit(guildId: string, action: string, target: string) {
    const entry: GuildAuditEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      guildId,
      actorId: actorId(),
      action,
      target,
      occurredAt: new Date().toISOString(),
    };
    set((state) => ({ audit: [entry, ...state.audit].slice(0, 50) }));
  }

  function actor(guildId: string) {
    return membershipForUser(get().members, guildId, actorId());
  }

  function roleForChatAuthor(guildId: string, authorId?: string | null): GuildRole {
    return resolveGuildChatRole({
      guildId,
      authorId,
      members: get().members,
      ownerId: getGuild(guildId)?.ownerId,
    });
  }

  function remapChatRoles(guildId: string) {
    const messages = get().chatByGuild[guildId];
    if (!messages?.length) return;
    let changed = false;
    const next = messages.map((m) => {
      const role = roleForChatAuthor(guildId, m.authorId);
      if (role === m.role) return m;
      changed = true;
      return { ...m, role };
    });
    if (!changed) return;
    set((state) => ({
      chatByGuild: { ...state.chatByGuild, [guildId]: next },
    }));
  }

  async function applyManifest(guildId: string, index = 0) {
    const manifest = await fetchGuildManifest(guildId);
    const displayName =
      useAppStore.getState().currentUser?.name ?? "You";
    const guild = guildFromManifest(manifest, index);
    upsertLiveGuild(guild);
    const self = membershipFromViewer(manifest, displayName);
    const viewerAvatar =
      useAppStore.getState().currentUser?.avatarUrl ?? null;
    const selfMember: GuildMember = {
      ...self,
      avatarUrl: viewerAvatar,
    };

    let roster: GuildMember[] = [selfMember];
    try {
      const remote = await fetchGuildMembers(guildId);
      roster = remote.map((row) =>
        membershipFromApiRecord(row, manifest.guild.owner_id),
      );
      const viewerAvatar =
        useAppStore.getState().currentUser?.avatarUrl ?? null;
      const viewerId = useAppStore.getState().currentUser?.id ?? null;
      // Prefer viewer-derived role/name for the signed-in user (richer roles[]).
      roster = roster.map((m) =>
        m.userId === selfMember.userId ||
        (viewerId != null && m.userId === viewerId)
          ? {
              ...m,
              role: selfMember.role,
              name: selfMember.name,
              avatarUrl: m.avatarUrl ?? viewerAvatar,
            }
          : m,
      );
      if (
        !roster.some(
          (m) =>
            m.userId === selfMember.userId ||
            (viewerId != null && m.userId === viewerId),
        )
      ) {
        roster = [selfMember, ...roster];
      }
    } catch (err) {
      logger.warn(
        `Guild members fetch failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    const manifestNews = (manifest.news ?? [])
      .map(newsFromApiRecord)
      .filter((x): x is GuildNewsItem => Boolean(x));
    const manifestEvents = (manifest.events ?? [])
      .map(eventFromApiRecord)
      .filter((x): x is GuildEvent => Boolean(x));

    const rsvpPatch: Record<string, boolean> = {};
    for (const event of manifestEvents) {
      if (event.myRsvp === "going" || event.myRsvp === "maybe") {
        rsvpPatch[event.id] = true;
      } else if (event.myRsvp === "not_going") {
        rsvpPatch[event.id] = false;
      }
    }

    set((state) => ({
      guildCatalogRevision: state.guildCatalogRevision + 1,
      viewerPermissionsByGuild: {
        ...state.viewerPermissionsByGuild,
        [guildId]: manifest.viewer.permissions ?? [],
      },
      members: [
        ...roster,
        ...state.members.filter((m) => m.guildId !== guildId),
      ],
      news: [
        ...manifestNews,
        ...state.news.filter((item) => item.guildId !== guildId),
      ],
      events: [
        ...manifestEvents,
        ...state.events.filter((item) => item.guildId !== guildId),
      ],
      rsvps: { ...state.rsvps, ...rsvpPatch },
    }));
    // Chat may have hydrated before roster roles were known — fix badges.
    remapChatRoles(guildId);
    if (
      manifest.discord != null &&
      typeof manifest.discord === "object" &&
      typeof (manifest.discord as { source?: string }).source === "string"
    ) {
      const source = (manifest.discord as { source: string }).source.trim();
      set((state) => {
        const discordOverrides = { ...state.discordOverrides };
        if (source) {
          discordOverrides[guildId] = source;
        } else {
          delete discordOverrides[guildId];
        }
        return { discordOverrides };
      });
    }
    return { manifest, guild, self };
  }

  return {
    activeGuildId: "",
    setActiveGuild: (activeGuildId) => {
      set({
        activeGuildId,
        selectedServerId: null,
        hubTab: "Overview",
        manageSection: "overview",
        focusNewsId: null,
        focusEventId: null,
      });
      if (activeGuildId) {
        void get()
          .refreshGuildManifest(activeGuildId)
          .catch((err) => {
            logger.warn(
              `Guild manifest refresh failed: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          });
        void get().hydrateGuildBuilds(activeGuildId);
        void get().hydrateGuildServers(activeGuildId);
        void get().hydrateGuildRankings(activeGuildId);
      }
    },
    hubTab: "Overview",
    setHubTab: (hubTab) => {
      if (
        hubTab === "Manage" &&
        !capabilitiesForRole(actor(get().activeGuildId)?.role).openManagement
      ) {
        set({ hubTab: "Overview" });
        return;
      }
      set({ hubTab });
      if (hubTab === "Manage") {
        set({ manageSection: "overview" });
      }
      if (hubTab === "Chat") {
        const guildId = get().activeGuildId;
        if (guildId) void get().hydrateGuildChat(guildId);
      }
      if (hubTab === "Servers") {
        const guildId = get().activeGuildId;
        if (guildId) void get().hydrateGuildServers(guildId);
      }
      if (hubTab === "Rankings") {
        const guildId = get().activeGuildId;
        if (guildId) void get().hydrateGuildRankings(guildId);
      }
      if (hubTab === "Builds") {
        const guildId = get().activeGuildId;
        if (guildId) void get().hydrateGuildBuilds(guildId);
      }
    },
    rankingMetric: "xp",
    setRankingMetric: (rankingMetric) => {
      set({ rankingMetric });
      const guildId = get().activeGuildId;
      if (guildId) void get().hydrateGuildRankings(guildId);
    },
    selectedServerId: null,
    setSelectedServerId: (selectedServerId) => set({ selectedServerId }),
    chatByGuild: {},
    channelsByGuild: {},
    activeChannelByGuild: {},
    chatStatusByGuild: {},
    setActiveChannel: (guildId, channelId) => {
      if (!guildId || !channelId) return;
      set((state) => ({
        activeChannelByGuild: {
          ...state.activeChannelByGuild,
          [guildId]: channelId,
        },
      }));
      void get().hydrateGuildChat(guildId);
    },
    hydrateGuildChat: async (guildId) => {
      if (!guildId) return;
      set((state) => ({
        chatStatusByGuild: {
          ...state.chatStatusByGuild,
          [guildId]: { loading: true, error: null },
        },
      }));
      try {
        const canCreate = capabilitiesForRole(actor(guildId)?.role)
          .openManagement;
        const channels = await ensureGuildChannels(guildId, canCreate);
        const preferredId = get().activeChannelByGuild[guildId];
        const selected =
          channels.find((c) => c.id === preferredId) ??
          pickDefaultChannel(channels);
        const channelId = selected?.id;

        set((state) => ({
          channelsByGuild: {
            ...state.channelsByGuild,
            [guildId]: channels,
          },
          activeChannelByGuild: channelId
            ? {
                ...state.activeChannelByGuild,
                [guildId]: channelId,
              }
            : state.activeChannelByGuild,
        }));

        if (!channelId) {
          set((state) => ({
            chatByGuild: { ...state.chatByGuild, [guildId]: [] },
            chatStatusByGuild: {
              ...state.chatStatusByGuild,
              [guildId]: {
                loading: false,
                error: "No chat channels yet. Ask a guild officer to create one.",
              },
            },
          }));
          return;
        }

        const roleForAuthor = (authorId: string): GuildRole =>
          roleForChatAuthor(guildId, authorId);

        const messages = await fetchChannelMessages(
          channelId,
          guildId,
          roleForAuthor,
        );
        set((state) => ({
          chatByGuild: { ...state.chatByGuild, [guildId]: messages },
          chatStatusByGuild: {
            ...state.chatStatusByGuild,
            [guildId]: { loading: false, error: null },
          },
        }));
        sendClientWsFrame({
          type: "guild.channel.join",
          payload: { guild_id: guildId, channel_id: channelId },
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not load guild chat.";
        logger.warn(`Guild chat hydrate failed: ${message}`);
        set((state) => ({
          chatStatusByGuild: {
            ...state.chatStatusByGuild,
            [guildId]: { loading: false, error: message },
          },
        }));
      }
    },
    appendChatMessage: (guildId, message) => {
      if (!guildId || !message?.id) return;
      set((state) => {
        const previous = state.chatByGuild[guildId] ?? [];
        if (previous.some((m) => m.id === message.id)) return state;
        return {
          chatByGuild: {
            ...state.chatByGuild,
            [guildId]: reconcileGuildChatMessages(previous, message),
          },
        };
      });
    },
    sendChat: async (guildId, text) => {
      const trimmed = text.trim();
      if (!trimmed) return denied("Enter a message.");
      let channelId = get().activeChannelByGuild[guildId];
      if (!channelId) {
        await get().hydrateGuildChat(guildId);
        channelId = get().activeChannelByGuild[guildId];
      }
      if (!channelId) {
        return denied(
          get().chatStatusByGuild[guildId]?.error ??
            "No channel available to send in.",
        );
      }

      const role = roleForChatAuthor(guildId, actorId()) || "Member";
      const author =
        useAppStore.getState().currentUser?.name ?? "Unknown";
      const optimisticId = `local-${Date.now()}`;
      const optimistic: ChatMessage = {
        id: optimisticId,
        guildId,
        author,
        text: trimmed,
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        role,
        channelId,
        authorId: actorId() || undefined,
        createdAt: new Date().toISOString(),
      };
      const previous = get().chatByGuild[guildId] ?? [];
      set((state) => ({
        chatByGuild: {
          ...state.chatByGuild,
          [guildId]: sortChatChronologically([...previous, optimistic]),
        },
      }));

      try {
        const roleForAuthor = (id: string): GuildRole =>
          roleForChatAuthor(guildId, id);
        const saved = await sendChannelMessage(
          channelId,
          guildId,
          trimmed,
          roleForAuthor,
        );
        set((state) => {
          const list = state.chatByGuild[guildId] ?? [];
          return {
            chatByGuild: {
              ...state.chatByGuild,
              [guildId]: reconcileGuildChatMessages(
                list.filter((m) => m.id !== optimisticId),
                saved,
              ),
            },
          };
        });
        return { ok: true, message: "Message sent." };
      } catch (err) {
        set((state) => {
          const list = state.chatByGuild[guildId] ?? [];
          return {
            chatByGuild: {
              ...state.chatByGuild,
              [guildId]: list.filter((m) => m.id !== optimisticId),
            },
          };
        });
        return denied(
          err instanceof Error ? err.message : "Could not send message.",
        );
      }
    },
    discoverOpen: false,
    setDiscoverOpen: (discoverOpen) => set({ discoverOpen }),
    members: [],
    events: [],
    news: [],
    focusNewsId: null,
    focusEventId: null,
    focusNews: (focusNewsId) => set({ focusNewsId, focusEventId: null }),
    focusEvent: (focusEventId) => set({ focusEventId, focusNewsId: null }),
    clearContentFocus: () => set({ focusNewsId: null, focusEventId: null }),
    invitations: [],
    rsvps: {},
    audit: [],
    discordOverrides: {},
    servers: [],
    rankings: [],
    buildReleases: [],
    viewerPermissionsByGuild: {},
    manageSection: "overview",
    setManageSection: (manageSection) => set({ manageSection }),
    guildCatalogRevision: 0,
    hydrateMyGuilds: async () => {
      // Paint from disk cache first so hub/context aren't empty offline.
      const snapshot = await readApiCache<GuildSnapshot>(CacheKeys.guildSnapshot);
      if (snapshot?.catalog?.length) {
        setLiveGuilds(snapshot.catalog);
        set((state) => ({
          members: snapshot.members ?? state.members,
          news: snapshot.news ?? state.news,
          events: snapshot.events ?? state.events,
          discordOverrides:
            snapshot.discordOverrides ?? state.discordOverrides,
          activeGuildId:
            state.activeGuildId || snapshot.activeGuildId || "",
          guildCatalogRevision: state.guildCatalogRevision + 1,
        }));
      }

      const cards = await fetchMyGuildManifestCards();
      const catalog = cards.map((card, i) => guildFromCard(card, i));
      setLiveGuilds(catalog);
      set((state) => ({
        guildCatalogRevision: state.guildCatalogRevision + 1,
      }));

      const displayName =
        useAppStore.getState().currentUser?.name ?? "You";

      const memberships: GuildMember[] = [];
      for (let i = 0; i < cards.length; i += 1) {
        const card = cards[i];
        try {
          const { self, guild } = await applyManifest(card.id, i);
          memberships.push(self);
          // applyManifest already upserted guild + member; keep motto from card if empty
          if (!guild.motto && card.is_owner) {
            upsertLiveGuild({ ...guild, motto: "You own this guild" });
          } else if (!guild.motto && card.can_manage) {
            upsertLiveGuild({
              ...guild,
              motto: "You help manage this guild",
            });
          }
        } catch (err) {
          logger.warn(
            `Skipping guild ${card.id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          // Still allow switcher entry from the card alone.
          memberships.push({
            id: `pending-${card.id}`,
            userId: actorId() || "unknown",
            guildId: card.id,
            name: displayName,
            role: card.is_owner
              ? "Leader"
              : card.can_manage
                ? "Officer"
                : "Member",
            status: "online",
            contribution: 0,
          });
        }
      }

      set((state) => {
        const remoteGuildIds = new Set(cards.map((c) => c.id));
        const kept = state.members.filter((m) => !remoteGuildIds.has(m.guildId));
        return { members: [...memberships, ...kept] };
      });

      const current = get().activeGuildId;
      if (!current && cards[0]) {
        get().setActiveGuild(cards[0].id);
      } else if (current && !cards.some((c) => c.id === current)) {
        get().setActiveGuild(cards[0]?.id ?? "");
      } else if (current) {
        // Already on a valid guild — still refresh builds/servers (setActiveGuild
        // is skipped, so without this the Builds tab stays empty after boot).
        void get().hydrateGuildBuilds(current);
        void get().hydrateGuildServers(current);
        void get().hydrateGuildRankings(current);
      }

      void persistGuildSnapshot(get());
    },
    refreshGuildManifest: async (guildId) => {
      if (!guildId) return;
      await applyManifest(guildId);
    },
    clearRemoteGuildState: () => {
      clearLiveGuilds();
      set({
        activeGuildId: "",
        members: [],
        hubTab: "Overview",
        manageSection: "overview",
        guildCatalogRevision: 0,
      });
    },
    inviteMember: async (guildId, playerName) => {
      if (!capabilitiesForRole(actor(guildId)?.role).inviteMembers) {
        return denied();
      }
      const trimmed = playerName.trim();
      try {
        let allowedUserIds: string[] | undefined;
        if (trimmed) {
          // Prefer CultForge user id / exact username when provided.
          const scope = trimmed.startsWith("cf_") ? "user_id" : "username";
          const found = await searchCultUser(trimmed.replace(/^@/, ""), scope);
          const mapped = mapApiProfileToCurrentUser(found);
          if (!mapped.id) {
            return denied(
              "No CultForge user found. Leave blank for a public invite link, or enter an exact username / user id.",
            );
          }
          allowedUserIds = [mapped.id];
        }
        const invite = await createGuildInvite(guildId, {
          isGlobal: !allowedUserIds,
          allowedUserIds,
          expiresInHours: 72,
          maxUses: allowedUserIds ? undefined : 25,
        });
        const invitation: GuildInvitation = {
          id: invite.code,
          guildId,
          playerName: trimmed || "Anyone (public link)",
          createdAt: new Date().toISOString(),
          status: "pending",
        };
        set((state) => ({ invitations: [invitation, ...state.invitations] }));
        audit(guildId, "Invite created", invite.invite_url);
        return {
          ok: true,
          message: allowedUserIds
            ? `Invite created for ${trimmed}.`
            : "Public invite link created.",
          inviteUrl: invite.invite_url,
        };
      } catch (err) {
        return denied(
          err instanceof Error ? err.message : "Could not create invite.",
        );
      }
    },
    setMemberRole: async (guildId, memberId, role) => {
      const actingMember = actor(guildId);
      const target = get().members.find((member) => member.id === memberId);
      if (
        !capabilitiesForRole(actingMember?.role).changeRoles ||
        !canManageMember(actingMember, target) ||
        !target
      ) {
        return denied();
      }
      try {
        await setGuildMemberLauncherRole(guildId, target.userId, role);
        const roster = await refreshGuildMembers(
          guildId,
          getGuild(guildId)?.ownerId,
        );
        set((state) => ({
          members: [
            ...roster,
            ...state.members.filter((member) => member.guildId !== guildId),
          ],
        }));
        remapChatRoles(guildId);
        audit(guildId, `Role changed to ${role}`, target.name);
        void persistGuildSnapshot(get());
        return { ok: true, message: `${target.name}'s role is now ${role}.` };
      } catch (err) {
        return denied(
          err instanceof Error ? err.message : "Could not update member role.",
        );
      }
    },
    removeMember: async (guildId, memberId) => {
      const actingMember = actor(guildId);
      const target = get().members.find((member) => member.id === memberId);
      if (!canManageMember(actingMember, target) || !target) return denied();
      try {
        await kickGuildMember(guildId, target.userId);
        set((state) => ({
          members: state.members.filter((member) => member.id !== memberId),
        }));
        remapChatRoles(guildId);
        audit(guildId, "Member removed", target.name);
        void persistGuildSnapshot(get());
        return { ok: true, message: `${target.name} removed from the roster.` };
      } catch (err) {
        return denied(
          err instanceof Error ? err.message : "Could not remove member.",
        );
      }
    },
    saveEvent: async (event) => {
      if (!capabilitiesForRole(actor(event.guildId)?.role).manageEvents) {
        return denied();
      }
      if (!event.title.trim() || !parseEventSchedule(event)) {
        return denied("Enter a valid event title and start time.");
      }
      try {
        const exists =
          get().events.some((item) => item.id === event.id) &&
          !event.id.startsWith("event-");
        const remote = exists
          ? await updateGuildEvent(event.guildId, event.id, {
              title: event.title,
              tagline: event.tagline ?? null,
              description: event.body ?? null,
              bodyFormat: event.bodyFormat ?? "markdown",
              location: event.location ?? null,
              coverUrl: event.coverUrl ?? null,
              links: event.links ?? [],
              startsAt: event.startsAt,
              endsAt: event.endsAt ?? null,
              isPublished: event.isPublished ?? true,
            })
          : await createGuildEvent(event.guildId, {
              title: event.title,
              tagline: event.tagline ?? null,
              description: event.body ?? null,
              bodyFormat: event.bodyFormat ?? "markdown",
              location: event.location ?? null,
              coverUrl: event.coverUrl ?? null,
              links: event.links ?? [],
              startsAt: event.startsAt,
              endsAt: event.endsAt ?? null,
              isPublished: event.isPublished ?? true,
            });
        const merged = { ...remote, type: event.type, customType: event.customType };
        set((state) => ({
          events: exists
            ? state.events.map((item) => (item.id === event.id ? merged : item))
            : [merged, ...state.events.filter((item) => item.id !== event.id)],
        }));
        audit(
          event.guildId,
          exists ? "Event updated" : "Event created",
          event.title,
        );
        void persistGuildSnapshot(get());
        return { ok: true, message: `${event.title} saved.` };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Could not save event",
        };
      }
    },
    cancelEvent: async (guildId, eventId) => {
      if (!capabilitiesForRole(actor(guildId)?.role).manageEvents) return denied();
      const target = get().events.find((event) => event.id === eventId);
      try {
        await updateGuildEvent(guildId, eventId, { isPublished: false });
        set((state) => ({
          events: state.events.filter((event) => event.id !== eventId),
        }));
        audit(guildId, "Event cancelled", target?.title ?? eventId);
        return { ok: true, message: "Event removed." };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Could not cancel event",
        };
      }
    },
    saveNews: async (item) => {
      if (!capabilitiesForRole(actor(item.guildId)?.role).manageNews) {
        return denied();
      }
      try {
        const exists =
          get().news.some((news) => news.id === item.id) &&
          !item.id.startsWith("news-");
        const remote = exists
          ? await updateGuildNews(item.guildId, item.id, {
              title: item.title,
              tagline: item.tagline ?? null,
              body: item.body,
              bodyFormat: item.bodyFormat ?? "markdown",
              coverUrl: item.coverUrl ?? null,
              links: item.links ?? [],
              isPublished: item.isPublished ?? true,
            })
          : await createGuildNews(item.guildId, {
              title: item.title,
              tagline: item.tagline ?? null,
              body: item.body,
              bodyFormat: item.bodyFormat ?? "markdown",
              coverUrl: item.coverUrl ?? null,
              links: item.links ?? [],
              isPublished: item.isPublished ?? true,
            });
        const merged = { ...remote, pinned: item.pinned };
        set((state) => ({
          news: exists
            ? state.news.map((news) => (news.id === item.id ? merged : news))
            : [merged, ...state.news.filter((news) => news.id !== item.id)],
        }));
        audit(
          item.guildId,
          exists ? "Announcement updated" : "Announcement posted",
          item.title,
        );
        void persistGuildSnapshot(get());
        return { ok: true, message: `${item.title} saved.` };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Could not save news",
        };
      }
    },
    deleteNews: async (guildId, newsId) => {
      if (!capabilitiesForRole(actor(guildId)?.role).manageNews) return denied();
      const target = get().news.find((item) => item.id === newsId);
      try {
        await updateGuildNews(guildId, newsId, { isPublished: false });
        set((state) => ({
          news: state.news.filter((item) => item.id !== newsId),
        }));
        audit(guildId, "Announcement deleted", target?.title ?? newsId);
        return { ok: true, message: "Announcement removed." };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Could not delete news",
        };
      }
    },
    togglePinnedNews: async (guildId, newsId) => {
      if (!capabilitiesForRole(actor(guildId)?.role).manageNews) return denied();
      const target = get().news.find((item) => item.id === newsId);
      if (!target) return denied("Announcement not found.");
      const nextPinned = !target.pinned;
      try {
        await pinGuildNews(guildId, newsId, nextPinned);
        set((state) => ({
          news: state.news.map((item) =>
            item.id === newsId ? { ...item, pinned: nextPinned } : item,
          ),
        }));
        audit(
          guildId,
          nextPinned ? "Announcement pinned" : "Announcement unpinned",
          target.title,
        );
        return {
          ok: true,
          message: nextPinned ? "Announcement pinned." : "Announcement unpinned.",
        };
      } catch (err) {
        return denied(
          err instanceof Error ? err.message : "Could not update pin.",
        );
      }
    },
    toggleRsvp: async (guildId, eventId) => {
      const going = Boolean(get().rsvps[eventId]);
      try {
        if (going) {
          await clearEventRsvp(guildId, eventId);
          set((state) => ({
            rsvps: { ...state.rsvps, [eventId]: false },
          }));
          return { ok: true, message: "RSVP cleared." };
        }
        await setEventRsvp(guildId, eventId, "going");
        set((state) => ({
          rsvps: { ...state.rsvps, [eventId]: true },
        }));
        return { ok: true, message: "You're going." };
      } catch (err) {
        return denied(
          err instanceof Error ? err.message : "Could not update RSVP.",
        );
      }
    },
    hydrateGuildServers: async (guildId) => {
      if (!guildId) return;
      try {
        const servers = await fetchGuildServers(guildId);
        set((state) => ({
          servers: [
            ...servers,
            ...state.servers.filter((s) => s.guildId !== guildId),
          ],
        }));
        void import("../lib/mping").then(({ syncMpingWatchList }) => {
          const addresses = get()
            .servers.map((s) => guildServerJoinAddress(s))
            .filter(Boolean);
          return syncMpingWatchList(addresses);
        });
      } catch (err) {
        logger.warn(
          `Guild servers hydrate failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    },
    hydrateGuildRankings: async (guildId) => {
      if (!guildId) return;
      try {
        const metric = get().rankingMetric;
        const rankings = await fetchGuildRankings(guildId, metric);
        set((state) => ({
          rankings: [
            ...rankings,
            ...state.rankings.filter(
              (r) => r.guildId !== guildId || r.metric !== metric,
            ),
          ],
        }));
      } catch (err) {
        logger.warn(
          `Guild rankings hydrate failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    },
    hydrateGuildBuilds: async (guildId) => {
      if (!guildId) return;
      try {
        const { fetchGuildBuildReleases } = await import("../lib/guildBuildApi");
        const { heuristicGuildBuildSizes } = await import(
          "../lib/guildBuildSize"
        );
        const releases = await fetchGuildBuildReleases(guildId);
        const withSizes = releases.map((release) => {
          if (release.sizes.downloadBytes > 0) return release;
          const guess = heuristicGuildBuildSizes(release);
          return {
            ...release,
            sizes: {
              downloadBytes: guess.downloadBytes,
              installedBytes: guess.installedBytes,
              estimated: true,
            },
          };
        });
        set((state) => ({
          buildReleases: [
            ...withSizes,
            ...state.buildReleases.filter(
              (r) =>
                r.guildId !== guildId && !withSizes.some((x) => x.id === r.id),
            ),
          ],
        }));
        if (withSizes.length === 0) {
          logger.info(`Guild builds: empty catalog for ${guildId}`);
        } else {
          logger.success(
            `Guild builds: loaded ${withSizes.length} for ${guildId}`,
          );
        }
      } catch (err) {
        logger.warn(
          `Guild builds hydrate failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    },
    patchBuildReleaseSizes: (releaseId, sizes) => {
      set((state) => ({
        buildReleases: state.buildReleases.map((release) =>
          release.id === releaseId
            ? { ...release, sizes: { ...release.sizes, ...sizes } }
            : release,
        ),
      }));
    },
    joinServer: async (guildId, serverId) => {
      try {
        const result = await joinGuildServer(guildId, serverId);
        if (!result.canJoin) {
          return denied(result.message || "Cannot join this server yet.");
        }
        return {
          ok: true,
          message: result.message || "Connect payload ready.",
          connect: result.connect,
        };
      } catch (err) {
        return denied(
          err instanceof Error ? err.message : "Could not join server.",
        );
      }
    },
    leaveGuild: async (guildId) => {
      const actingMember = actor(guildId);
      const capabilities = capabilitiesForRole(actingMember?.role);
      if (!actingMember) return denied("You are not a member of this Guild.");
      if (!capabilities.leaveGuild) {
        return denied("Transfer leadership before leaving this Guild.");
      }
      try {
        await leaveGuildRemote(guildId);
        set((state) => {
          const members = state.members.filter(
            (member) => member.id !== actingMember.id,
          );
          const nextGuildId =
            members.find((member) => member.userId === actorId())?.guildId ??
            "";
          return {
            members,
            activeGuildId:
              state.activeGuildId === guildId
                ? nextGuildId
                : state.activeGuildId,
            hubTab: "Overview",
            news: state.news.filter((item) => item.guildId !== guildId),
            events: state.events.filter((item) => item.guildId !== guildId),
          };
        });
        await invalidateGuildCaches(guildId);
        void persistGuildSnapshot(get());
        audit(guildId, "Left guild", actingMember.name);
        return { ok: true, message: "You left the guild." };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Could not leave guild",
        };
      }
    },
    transferLeadership: (guildId, successorId) => {
      const actingMember = actor(guildId);
      const successor = get().members.find(
        (member) => member.guildId === guildId && member.id === successorId,
      );
      if (
        !capabilitiesForRole(actingMember?.role).transferLeadership ||
        !actingMember ||
        !successor ||
        successor.userId === actingMember.userId
      ) {
        return denied();
      }
      set((state) => ({
        members: state.members.map((member) => {
          if (member.id === actingMember.id) return { ...member, role: "Officer" };
          if (member.id === successor.id) return { ...member, role: "Leader" };
          return member;
        }),
      }));
      audit(guildId, "Leadership transferred", successor.name);
      return { ok: true, message: `${successor.name} is now the guild Leader.` };
    },
    setGuildDiscord: async (guildId, source) => {
      if (!capabilitiesForRole(actor(guildId)?.role).manageDiscord) {
        return denied();
      }
      const trimmed = source.trim();
      if (trimmed) {
        const parsed = parseDiscordGuildSource(trimmed);
        if (!parsed.ok) return denied(parsed.error);
      }
      try {
        await updateGuildDiscordSource(guildId, trimmed);
        set((state) => {
          const discordOverrides = { ...state.discordOverrides };
          if (trimmed) {
            discordOverrides[guildId] = trimmed;
          } else {
            delete discordOverrides[guildId];
          }
          return { discordOverrides };
        });
        upsertLiveGuild({
          ...(getGuild(guildId) ?? {
            id: guildId,
            name: guildId,
            tag: "CF",
            level: 1,
            xp: 0,
            xpMax: 100,
            memberCount: 0,
            motto: "",
            accent: "from-primary-dvivd to-primary-muted",
            banner:
              "linear-gradient(135deg,#1a1528_0%,#2d3a5c_35%,#1e2838_70%,#0f141c_100%)",
            joined: true,
          }),
          discordSource: trimmed || undefined,
        });
        set((state) => ({
          guildCatalogRevision: state.guildCatalogRevision + 1,
        }));
        audit(
          guildId,
          trimmed ? "Discord widget updated" : "Discord widget cleared",
          trimmed || "No source",
        );
        void persistGuildSnapshot(get());
        return {
          ok: true,
          message: trimmed
            ? "Guild Discord widget saved to CultForge."
            : "Guild Discord widget cleared on CultForge.",
        };
      } catch (err) {
        return denied(
          err instanceof Error ? err.message : "Could not save Discord source.",
        );
      }
    },
    setGuildBranding: async (guildId, input) => {
      if (!capabilitiesForRole(actor(guildId)?.role).manageDiscord) {
        return denied();
      }
      try {
        const result = await applyGuildBranding(guildId, input);
        clearGuildMediaDisplayCache(guildId);
        const existing = getGuild(guildId);
        const fallbackBanner = DEFAULT_GUILD_BANNER;
        upsertLiveGuild({
          ...(existing ?? {
            id: guildId,
            name: guildId,
            tag: "CF",
            level: 1,
            xp: 0,
            xpMax: 100,
            memberCount: 0,
            motto: "",
            accent: "from-primary-dvivd to-primary-muted",
            banner: fallbackBanner,
            joined: true,
          }),
          icon: result.iconChanged
            ? result.iconUrl || null
            : (existing?.icon ?? null),
          banner: result.bannerChanged
            ? result.bannerUrl || fallbackBanner
            : (existing?.banner ?? fallbackBanner),
        });
        set((state) => ({
          guildCatalogRevision: state.guildCatalogRevision + 1,
        }));
        audit(
          guildId,
          "Guild branding updated",
          [
            result.iconChanged
              ? result.iconUrl
                ? "icon set"
                : "icon cleared"
              : null,
            result.bannerChanged
              ? result.bannerUrl
                ? "banner set"
                : "banner cleared"
              : null,
          ]
            .filter(Boolean)
            .join(", ") || "updated",
        );
        void persistGuildSnapshot(get());
        return { ok: true, message: "Guild icon and banner saved." };
      } catch (err) {
        return denied(
          err instanceof Error ? err.message : "Could not save guild branding.",
        );
      }
    },
    saveServer: async (server, media) => {
      if (!capabilitiesForRole(actor(server.guildId)?.role).manageServers) {
        return denied();
      }
      if (!server.name.trim() || !server.address.trim()) {
        return denied("Enter a server name and address.");
      }
      try {
        const [host, portRaw] = server.address.split(":");
        const port = Number.parseInt(portRaw || "25565", 10) || 25565;
        const exists =
          get().servers.some((item) => item.id === server.id) &&
          !server.id.startsWith("srv-");
        const description = encodeServerExtras(
          server.description,
          server.region,
          server.tags,
          server.status,
        );
        const isActive = server.status === "online";
        const iconUrl = server.iconUrl?.trim() || null;
        const coverUrl =
          server.coverUrl?.trim() ||
          (server.thumbnail?.startsWith("http") ? server.thumbnail.trim() : null) ||
          null;
        const saved = exists
          ? await updateGuildServer(server.guildId, server.id, {
              name: server.name,
              description,
              server_address: host,
              port,
              required_build: server.requiredBuildVersion || "any",
              build_id: server.requiredBuildId || undefined,
              is_active: isActive,
              iconUrl,
              coverUrl,
              iconUpload: media?.iconUpload ?? null,
              coverUpload: media?.coverUpload ?? null,
            })
          : await createGuildServer(server.guildId, {
              name: server.name,
              description,
              serverAddress: host,
              port,
              requiredBuild: server.requiredBuildVersion || "any",
              buildId: server.requiredBuildId || undefined,
              isActive,
              iconUrl,
              coverUrl,
              iconUpload: media?.iconUpload ?? null,
              coverUpload: media?.coverUpload ?? null,
            });
        set((state) => ({
          servers: exists
            ? state.servers.map((item) =>
                item.id === server.id ? saved : item,
              )
            : [saved, ...state.servers.filter((s) => s.id !== saved.id)],
        }));
        audit(
          server.guildId,
          exists ? "Server updated" : "Server added",
          saved.name,
        );
        void import("../lib/mping").then(({ syncMpingWatchList }) =>
          syncMpingWatchList(
            get().servers.map((s) => guildServerJoinAddress(s)),
          ),
        );
        return { ok: true, message: `${saved.name} saved to CultForge.` };
      } catch (err) {
        return denied(
          err instanceof Error ? err.message : "Could not save server.",
        );
      }
    },
    deleteServer: async (guildId, serverId) => {
      if (!capabilitiesForRole(actor(guildId)?.role).manageServers) {
        return denied();
      }
      const target = get().servers.find((server) => server.id === serverId);
      try {
        await deleteGuildServer(guildId, serverId);
        set((state) => ({
          servers: state.servers.filter((server) => server.id !== serverId),
          selectedServerId:
            state.selectedServerId === serverId ? null : state.selectedServerId,
        }));
        audit(guildId, "Server removed", target?.name ?? serverId);
        void import("../lib/mping").then(({ syncMpingWatchList }) =>
          syncMpingWatchList(
            get().servers.map((s) => guildServerJoinAddress(s)),
          ),
        );
        return { ok: true, message: "Server removed." };
      } catch (err) {
        const raw =
          err instanceof Error ? err.message : "Could not delete server.";
        const message = /invalid json/i.test(raw)
          ? "Could not reach the guild service. Try again in a moment."
          : raw.replace(/^Could not delete server:\s*/i, "");
        return denied(message.startsWith("Could not") ? message : `Could not delete server: ${message}`);
      }
    },
    saveRankingRow: (row) => {
      if (!capabilitiesForRole(actor(row.guildId)?.role).manageRankings) {
        return denied();
      }
      if (!row.name.trim() || !row.score.trim()) {
        return denied("Enter a player name and score.");
      }
      const exists = get().rankings.some(
        (item) =>
          item.guildId === row.guildId &&
          item.metric === row.metric &&
          item.name === row.name,
      );
      set((state) => {
        const without = state.rankings.filter(
          (item) =>
            !(
              item.guildId === row.guildId &&
              item.metric === row.metric &&
              item.name === row.name
            ),
        );
        const next = [...without, { ...row, name: row.name.trim(), score: row.score.trim() }].sort(
          (a, b) => {
            if (a.guildId !== b.guildId) return a.guildId.localeCompare(b.guildId);
            if (a.metric !== b.metric) return a.metric.localeCompare(b.metric);
            return a.rank - b.rank;
          },
        );
        return { rankings: next };
      });
      audit(
        row.guildId,
        exists ? "Ranking updated" : "Ranking added",
        `${row.name} · ${row.metric}`,
      );
      return {
        ok: true,
        message: `${row.name} ranking saved.`,
      };
    },
    deleteRankingRow: (guildId, metric, name) => {
      if (!capabilitiesForRole(actor(guildId)?.role).manageRankings) {
        return denied();
      }
      set((state) => ({
        rankings: state.rankings.filter(
          (item) =>
            !(
              item.guildId === guildId &&
              item.metric === metric &&
              item.name === name
            ),
        ),
      }));
      audit(guildId, "Ranking removed", `${name} · ${metric}`);
      return { ok: true, message: "Ranking row removed." };
    },
    saveBuildRelease: async (release, images) => {
      if (!capabilitiesForRole(actor(release.guildId)?.role).manageBuilds) {
        return denied();
      }
      if (!release.name.trim() || !release.version.trim()) {
        return denied("Enter a build name and version.");
      }
      try {
        const exists =
          get().buildReleases.some((item) => item.id === release.id) &&
          !release.id.startsWith("release-");
        const iconUpload = images?.iconUpload ?? null;
        const coverUpload = images?.coverUpload ?? null;
        const payload = {
          name: release.name.trim(),
          version: release.version.trim(),
          minecraftVersion: release.dependencies.minecraft,
          loader: release.dependencies.loader,
          tagline: release.tagline ?? release.summary ?? null,
          description: release.description ?? null,
          downloadUrl: release.downloadUrl ?? null,
          sourceUrl: release.sourceUrl ?? null,
          // URL links only when not uploading bytes (API: not both at once).
          coverUrl: coverUpload ? null : (release.coverUrl ?? null),
          iconUrl: iconUpload ? null : (release.iconUrl ?? null),
          iconUpload,
          coverUpload,
          isPublished: release.isPublished ?? true,
          isFeatured: release.isFeatured ?? false,
          isPublicCatalog: release.isPublicCatalog ?? false,
          keywords: release.keywords ?? [],
          requiredMods: release.requiredMods ?? [],
          optionalMods: release.optionalMods ?? [],
          shaders: release.shaders ?? [],
          resourcePacks: release.resourcePacks ?? [],
        };
        const { createGuildBuild, updateGuildBuild } = await import(
          "../lib/guildBuildApi"
        );
        const remote = exists
          ? await updateGuildBuild(release.guildId, release.id, payload)
          : await createGuildBuild(release.guildId, payload);
        const merged: typeof remote = {
          ...remote,
          serverId: release.serverId || remote.serverId,
          iconUrl: remote.iconUrl || release.iconUrl || remote.image,
          image: remote.iconUrl || remote.image || release.image,
          coverUrl: remote.coverUrl || release.coverUrl,
        };
        set((state) => ({
          buildReleases: exists
            ? state.buildReleases.map((item) =>
                item.id === release.id ? merged : item,
              )
            : [
                merged,
                ...state.buildReleases.filter((item) => item.id !== merged.id),
              ],
        }));
        audit(
          release.guildId,
          exists ? "Build release updated" : "Build release added",
          remote.name,
        );
        void persistGuildSnapshot(get());
        return {
          ok: true,
          message: `${remote.name} catalog entry saved.`,
        };
      } catch (err) {
        return {
          ok: false,
          message:
            err instanceof Error ? err.message : "Could not save guild build",
        };
      }
    },
    deleteBuildRelease: async (guildId, releaseId) => {
      if (!capabilitiesForRole(actor(guildId)?.role).manageBuilds) {
        return denied();
      }
      const target = get().buildReleases.find(
        (release) => release.id === releaseId,
      );
      try {
        const { deleteGuildBuild } = await import("../lib/guildBuildApi");
        await deleteGuildBuild(guildId, releaseId);
        set((state) => ({
          buildReleases: state.buildReleases.filter(
            (release) => release.id !== releaseId,
          ),
        }));
        audit(guildId, "Build release removed", target?.name ?? releaseId);
        void persistGuildSnapshot(get());
        return {
          ok: true,
          message: "Build catalog entry removed.",
        };
      } catch (err) {
        return {
          ok: false,
          message:
            err instanceof Error ? err.message : "Could not delete guild build",
        };
      }
    },
  };
});
