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
  { id: "settings", label: "Edit Instance Settings", icon: "Settings2" as const },
  { id: "folder", label: "Open Folder", icon: "FolderOpen" as const },
  { id: "backup", label: "Create Backup", icon: "Database" as const },
  { id: "export", label: "Export Pack", icon: "Package" as const },
  { id: "duplicate", label: "Duplicate Build", icon: "Copy" as const },
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
