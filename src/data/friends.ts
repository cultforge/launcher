import { canonicalizeHostedAvatarUrl } from "../lib/authProfile";

export type FriendStatus = "online" | "idle" | "offline";

export type FriendRanking = {
  label: string;
  rank: number;
  of: number;
  score: string;
};

export type FriendStats = {
  kills: number;
  deaths: number;
  mobsKilled: number;
  blocksPlaced: number;
  distanceKm: number;
  playtimeHours: number;
  level: number;
};

export type PlayerAchievement = {
  id: string;
  title: string;
  description: string;
  rarity: number;
  unlocked: string;
};

export type PlayerActivity = {
  id: string;
  title: string;
  detail: string;
  when: string;
  type: "achievement" | "server" | "build" | "guild";
};

export type PlayerBuildSummary = {
  id: string;
  name: string;
  version: string;
  playtimeHours: number;
  completion: number;
};

export type FriendProfile = {
  id: string;
  name: string;
  activity: string;
  status: FriendStatus;
  guild: string | null;
  title: string;
  joined: string;
  mainBuild: string;
  stats: FriendStats;
  rankings: FriendRanking[];
  banner: string;
  bio: string;
  relationship: "friend" | "pending" | "none";
  lastSeen: string;
  achievements: PlayerAchievement[];
  recentActivity: PlayerActivity[];
  playedBuilds: PlayerBuildSummary[];
  performance: number[];
  avatarUrl?: string;
};

export function kdRatio(stats: FriendStats): string {
  if (stats.deaths <= 0) return stats.kills > 0 ? stats.kills.toFixed(1) : "0.00";
  return (stats.kills / stats.deaths).toFixed(2);
}

const EMPTY_STATS: FriendStats = {
  kills: 0,
  deaths: 0,
  mobsKilled: 0,
  blocksPlaced: 0,
  distanceKm: 0,
  playtimeHours: 0,
  level: 1,
};

function mapStats(raw: unknown): FriendStats {
  if (!raw || typeof raw !== "object") return { ...EMPTY_STATS };
  const obj = raw as Record<string, unknown>;
  const playMin =
    typeof obj.playtime_minutes === "number"
      ? obj.playtime_minutes
      : typeof obj.playtimeHours === "number"
        ? obj.playtimeHours * 60
        : 0;
  const distance =
    typeof obj.distance_traveled === "number"
      ? obj.distance_traveled
      : typeof obj.distanceKm === "number"
        ? obj.distanceKm * 1000
        : 0;
  return {
    kills: typeof obj.kills === "number" ? obj.kills : 0,
    deaths: typeof obj.deaths === "number" ? obj.deaths : 0,
    mobsKilled:
      typeof obj.mobsKilled === "number" ? obj.mobsKilled : 0,
    blocksPlaced:
      typeof obj.blocksPlaced === "number" ? obj.blocksPlaced : 0,
    distanceKm: distance / 1000,
    playtimeHours: playMin / 60,
    level:
      typeof obj.level_ingame === "number"
        ? obj.level_ingame
        : typeof obj.level === "number"
          ? obj.level
          : 1,
  };
}

/** Live profiles from search (and similar) — not a friends graph. */
const playerCache = new Map<string, FriendProfile>();

export function cachePlayerProfile(profile: FriendProfile): void {
  playerCache.set(profile.id, profile);
  if (profile.name) playerCache.set(`name:${profile.name.toLowerCase()}`, profile);
}

export function clearPlayerProfileCache(): void {
  playerCache.clear();
}

/** Map API FriendRecord (GET /v1/friends) into FriendProfile. */
export function mapFriendRecord(raw: unknown): FriendProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const id =
    (typeof obj.user_id === "string" && obj.user_id) ||
    (typeof obj.id === "string" && obj.id) ||
    "";
  const username =
    (typeof obj.username === "string" && obj.username) ||
    (typeof obj.name === "string" && obj.name) ||
    "";
  if (!id && !username) return null;
  const handle =
    (typeof obj.handle_name === "string" && obj.handle_name) ||
    (typeof obj.handle === "string" && obj.handle) ||
    "";
  const online = Boolean(obj.is_online);
  const profileId = id || `user:${username.toLowerCase()}`;
  const rawAvatar =
    (typeof obj.avatar_url === "string" && obj.avatar_url) ||
    (typeof obj.avatarUrl === "string" && obj.avatarUrl) ||
    "";
  const avatarUrl = canonicalizeHostedAvatarUrl(profileId, rawAvatar);
  const profile: FriendProfile = {
    id: profileId,
    name: username || handle || "Player",
    activity: online ? "Online" : "Offline",
    status: online ? "online" : "offline",
    guild: null,
    title: handle ? `@${handle.replace(/^@/, "")}` : "Member",
    joined: "",
    mainBuild: "",
    stats: mapStats(obj.stats),
    rankings: [],
    banner: "/art/cultforge-fallback.webp",
    bio: typeof obj.note === "string" ? obj.note : "",
    relationship: "friend",
    lastSeen: online ? "Online now" : "Offline",
    achievements: [],
    recentActivity: [],
    playedBuilds: [],
    performance: [],
    avatarUrl,
  };
  return profile;
}

/** Friends roster — populated live via friendsRoster store. */
export const FRIENDS: FriendProfile[] = [];

export const FRIENDS_ONLINE: {
  name: string;
  activity: string;
  rank: boolean;
  status: FriendStatus;
}[] = [];

export const FRIENDS_LIST = FRIENDS;

export function friendById(id: string | null): FriendProfile | null {
  if (!id) return null;
  return playerCache.get(id) ?? null;
}

export function friendByName(name: string): FriendProfile | undefined {
  return playerCache.get(`name:${name.toLowerCase()}`);
}
