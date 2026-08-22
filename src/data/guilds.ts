import type { BuildInstance } from "../stores/build";
import { guildInstanceId } from "../lib/guildInstanceId";

export type GuildRole = "Leader" | "Officer" | "Member";
export type MemberStatus = "online" | "idle" | "offline";
export type EventType = "raid" | "contest" | "drive" | "social" | "custom";
export type RankingMetric = "xp" | "kills" | "playtime";

export type Guild = {
  id: string;
  name: string;
  tag: string;
  level: number;
  xp: number;
  xpMax: number;
  memberCount: number;
  motto: string;
  accent: string;
  /** Hosted or external guild logo URL when available. */
  icon?: string | null;
  banner: string;
  joined: boolean;
  discordSource?: string;
  /** CultForge account id of the guild owner when known from the manifest. */
  ownerId?: string;
};

export type GuildMember = {
  id: string;
  userId: string;
  guildId: string;
  name: string;
  role: GuildRole;
  status: MemberStatus;
  contribution: number;
  avatarUrl?: string | null;
};

export type GuildContentLink = {
  label: string;
  href: string;
};

export type GuildBodyFormat = "plain" | "markdown";

export type GuildEvent = {
  id: string;
  guildId: string;
  title: string;
  tagline?: string | null;
  /** Markdown or plain description body. */
  body?: string | null;
  bodyFormat?: GuildBodyFormat;
  location?: string | null;
  coverUrl?: string | null;
  links?: GuildContentLink[];
  deepLink?: string;
  startsAt: string;
  /** Optional; open-ended events omit this. */
  endsAt?: string;
  timeZone?: string;
  /** Legacy local taxonomy — remote API does not require it. */
  type?: EventType;
  customType?: string;
  isPublished?: boolean;
  authorId?: string;
  myRsvp?: string;
  rsvpCount?: number;
  maxParticipants?: number;
};

const EVENT_TYPE_LABELS: Record<Exclude<EventType, "custom">, string> = {
  raid: "Raid",
  contest: "Contest",
  drive: "Resource drive",
  social: "Social",
};

export function eventTypeLabel(
  event: Pick<GuildEvent, "type" | "customType" | "tagline" | "location">,
) {
  if (event.type === "custom") {
    return event.customType?.trim() || "Custom";
  }
  if (event.type && event.type in EVENT_TYPE_LABELS) {
    return EVENT_TYPE_LABELS[event.type as Exclude<EventType, "custom">];
  }
  return event.tagline?.trim() || event.location?.trim() || "Event";
}

export type GuildNewsItem = {
  id: string;
  guildId: string;
  title: string;
  tagline?: string | null;
  body: string;
  bodyFormat?: GuildBodyFormat;
  coverUrl?: string | null;
  links?: GuildContentLink[];
  deepLink?: string;
  /** Display relative/absolute time label. */
  when: string;
  publishedAt?: string;
  isPublished?: boolean;
  authorId?: string;
  /** Local-only pin fallback when API omits is_pinned. */
  pinned?: boolean;
};

export type LeaderboardRow = {
  rank: number;
  name: string;
  score: string;
  guildId: string;
  metric: RankingMetric;
};

export type ChatMessage = {
  id: string;
  guildId: string;
  author: string;
  text: string;
  time: string;
  role: GuildRole;
  /** CultForge user id when loaded from live channel history. */
  authorId?: string;
  channelId?: string;
  createdAt?: string;
};

export type GuildServer = {
  id: string;
  guildId: string;
  name: string;
  /**
   * Join / mping address — prefers live tunnel (`effectiveAddress`) when the
   * agent overrides catalog defaults.
   */
  address: string;
  /** GuildMaster-configured host (catalog default). */
  configuredAddress?: string;
  configuredPort?: number;
  /** Live tunnel host when `addressSource === "tunnel"`. */
  effectiveAddress?: string;
  effectivePort?: number;
  addressSource?: "configured" | "tunnel" | string;
  tunnelUpdatedAt?: string | null;
  playersOnline: number;
  playersMax: number;
  pingMs: number;
  version: string;
  region: string;
  description: string;
  /** Cover art used on cards (alias of coverUrl when set). */
  thumbnail: string;
  /** Square server icon (header / list). */
  iconUrl?: string | null;
  /** Wide cover / landscape art. */
  coverUrl?: string | null;
  tags: string[];
  loader: string;
  status: "online" | "maintenance" | "offline";
  requiredBuildId: string;
  requiredBuildVersion: string;
};

/** Host:port used for join, clipboard, and mping. */
export function guildServerJoinAddress(server: {
  address: string;
  effectiveAddress?: string;
  effectivePort?: number;
  configuredAddress?: string;
  configuredPort?: number;
  addressSource?: string;
}): string {
  const source = (server.addressSource || "").toLowerCase();
  const eff = server.effectiveAddress?.trim();
  // Prefer live tunnel/effective unless API explicitly says configured-only.
  if (eff && source !== "configured") {
    if (eff.includes(":")) return eff;
    return `${eff}:${server.effectivePort ?? 25565}`;
  }
  if (server.address?.trim()) return server.address.trim();
  const cfg = server.configuredAddress?.trim();
  if (cfg) {
    if (cfg.includes(":")) return cfg;
    return `${cfg}:${server.configuredPort ?? 25565}`;
  }
  return "";
}

/** Catalog default address for admin display. */
export function guildServerConfiguredAddress(server: {
  address: string;
  configuredAddress?: string;
  configuredPort?: number;
}): string {
  if (server.configuredAddress?.trim()) {
    const host = server.configuredAddress.trim();
    if (host.includes(":")) return host;
    return `${host}:${server.configuredPort ?? 25565}`;
  }
  return server.address;
}

export type ServerCompatibility =
  | { state: "ready"; build: BuildInstance | null }
  | { state: "update-required"; build: BuildInstance }
  | { state: "missing"; build: null };

export type ActivityItem = {
  id: string;
  text: string;
  when: string;
  guildTag?: string;
};

export type PlayerCard = {
  id: string;
  name: string;
  status: MemberStatus;
  mutualGuild?: string;
  lookingFor: string;
};

export type ForumThread = {
  id: string;
  category: string;
  title: string;
  replies: number;
  lastActive: string;
  author: string;
};

export const GUILD_HUB_TABS = [
  "Overview",
  "News",
  "Events",
  "Chat",
  "Servers",
  "Builds",
  "Members",
  "Activity",
  "Players",
  "Forums",
  "Rankings",
  "Discord",
  "Manage",
] as const;

export type GuildHubTab = (typeof GUILD_HUB_TABS)[number];

/** Short labels for scrollable hub tab bar. */
export const GUILD_HUB_TAB_LABELS: Record<GuildHubTab, string> = {
  Overview: "Overview",
  News: "News",
  Events: "Events",
  Chat: "Chat",
  Servers: "Servers",
  Builds: "Builds",
  Members: "Members",
  Activity: "Activity",
  Players: "Players",
  Forums: "Forums",
  Rankings: "Rankings",
  Discord: "Discord",
  Manage: "Manage",
};

/** Live guild catalog — filled from CultForge guild manifests after sign-in. */
export const DEMO_GUILDS: Guild[] = [];
export const DEMO_MEMBERS: GuildMember[] = [];
export const DEMO_EVENTS: GuildEvent[] = [];
export const DEMO_NEWS: GuildNewsItem[] = [];
export const DEMO_LEADERBOARD: LeaderboardRow[] = [];
export const DEMO_CHAT: ChatMessage[] = [];
export const DEMO_SERVERS: GuildServer[] = [];
export const DEMO_ACTIVITY: ActivityItem[] = [];
export const DEMO_PLAYERS: PlayerCard[] = [];
export const DEMO_FORUMS: ForumThread[] = [];

/** Runtime catalog hydrated from the guilds API (preferred over DEMO_*). */
let liveGuilds: Guild[] = [];

export function setLiveGuilds(guilds: Guild[]) {
  liveGuilds = guilds;
}

export function upsertLiveGuild(guild: Guild) {
  const i = liveGuilds.findIndex((g) => g.id === guild.id);
  if (i >= 0) {
    liveGuilds = [
      ...liveGuilds.slice(0, i),
      { ...liveGuilds[i], ...guild },
      ...liveGuilds.slice(i + 1),
    ];
  } else {
    liveGuilds = [...liveGuilds, guild];
  }
}

export function clearLiveGuilds() {
  liveGuilds = [];
}

export function allGuilds(): Guild[] {
  return liveGuilds.length ? liveGuilds : DEMO_GUILDS;
}

export function joinedGuilds(): Guild[] {
  return allGuilds().filter((g) => g.joined);
}

export function publicGuilds(): Guild[] {
  return allGuilds().filter((g) => !g.joined);
}

export function getGuild(id: string): Guild | undefined {
  return allGuilds().find((g) => g.id === id);
}

export function discordSourceForGuild(
  guildId: string,
  overrides: Record<string, string | undefined> = {},
): string | undefined {
  const override = overrides[guildId]?.trim();
  if (override) return override;
  return getGuild(guildId)?.discordSource?.trim() || undefined;
}

export function membersForGuild(guildId: string): GuildMember[] {
  return DEMO_MEMBERS.filter((m) => m.guildId === guildId);
}

export function eventsForGuild(guildId: string): GuildEvent[] {
  return DEMO_EVENTS.filter((e) => e.guildId === guildId);
}

export function newsForGuild(guildId: string): GuildNewsItem[] {
  return DEMO_NEWS.filter((n) => n.guildId === guildId);
}

export function leaderboardForGuild(
  guildId: string,
  metric: RankingMetric,
): LeaderboardRow[] {
  return DEMO_LEADERBOARD.filter(
    (r) => r.guildId === guildId && r.metric === metric,
  ).sort((a, b) => a.rank - b.rank);
}

export function chatForGuild(guildId: string): ChatMessage[] {
  return DEMO_CHAT.filter((c) => c.guildId === guildId);
}

export function serversForGuild(guildId: string): GuildServer[] {
  return DEMO_SERVERS.filter((s) => s.guildId === guildId);
}

/** @deprecated Prefer useGuildAgentPresenceStore — kept for callers. */
export { playersOnServer } from "../stores/guildAgentPresence";

function versionParts(version: string): number[] {
  return version.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

function versionAtLeast(installed: string, required: string): boolean {
  const left = versionParts(installed);
  const right = versionParts(required);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
}

export function serverCompatibility(
  server: GuildServer,
  builds: BuildInstance[],
): ServerCompatibility {
  const required = (server.requiredBuildId || "").trim();
  if (!required) {
    // No linked build — don't scare players with "Build missing".
    return { state: "ready", build: null };
  }

  const managedId = guildInstanceId(server.guildId, required);
  const build =
    builds.find((item) => item.id === required) ??
    builds.find((item) => item.id === managedId) ??
    builds.find(
      (item) =>
        item.buildKey === required ||
        (item.guildId === server.guildId && item.buildKey === required),
    ) ??
    builds.find(
      (item) =>
        item.managed &&
        item.guildId === server.guildId &&
        (item.releaseId === required || item.id.includes(required)),
    );

  if (!build) return { state: "missing", build: null };

  const loaderOk =
    !server.loader ||
    server.loader === "—" ||
    build.loader.toLowerCase().startsWith(server.loader.toLowerCase()) ||
    server.loader.toLowerCase().startsWith(build.loader.toLowerCase());
  const mcOk =
    !server.version ||
    server.version === "—" ||
    !build.mc ||
    build.mc === "—" ||
    build.mc === server.version;
  const versionOk =
    !server.requiredBuildVersion ||
    server.requiredBuildVersion === "any" ||
    versionAtLeast(build.version, server.requiredBuildVersion);
  const readyStatus =
    build.status === "Ready" ||
    build.syncStatus === "synced" ||
    build.source === "guild";

  if (!loaderOk || !mcOk || !versionOk || !readyStatus) {
    return { state: "update-required", build };
  }
  return { state: "ready", build };
}

/** Ping history for charts — flat line from current ping until live metrics exist. */
export function pingSeries(
  _serverId: string,
  points = 24,
  basePing = 50,
): { x: number; y: number }[] {
  return Array.from({ length: points }, (_, i) => ({
    x: i,
    y: Math.max(1, Math.round(basePing)),
  }));
}
