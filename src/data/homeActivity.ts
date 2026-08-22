export type ActivityKind = "builds" | "social" | "downloads" | "system";

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  title: string;
  meta: string;
  time: string;
  action?: "updates" | "builds" | "store" | "guilds";
};

export const QUICK_ACTIONS = [
  { id: "folder", label: "Open game folder", icon: "FolderOpen" as const },
  { id: "settings", label: "Instance settings", icon: "Settings2" as const },
];

export type FeaturedAddon = {
  id: string;
  title: string;
  tag: string;
  rating: string;
  downloads: string;
  image?: string;
};

export type {
  UpdateItem,
  UpdateKind,
  UpdateFilter,
  UpdateStatus,
} from "./updates";

export {
  FRIENDS,
  FRIENDS_ONLINE,
  FRIENDS_LIST,
  kdRatio,
  friendById,
  friendByName,
  type FriendProfile,
  type FriendStatus,
  type FriendStats,
  type FriendRanking,
} from "./friends";
