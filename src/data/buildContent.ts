import {
  useLibraryContentStore,
  type LibraryContentItem,
} from "../stores/libraryContent";

export type ContentFilter = "All" | "Enabled" | "Disabled" | "Updates";

export type ModItem = {
  id: string;
  name: string;
  author: string;
  version: string;
  size: string;
  enabled: boolean;
  updateAvailable?: boolean;
  image?: string;
  description?: string;
};

export type PackItem = {
  id: string;
  name: string;
  resolution: string;
  size: string;
  enabled: boolean;
  image?: string;
  description?: string;
};

export type ShaderItem = {
  id: string;
  name: string;
  version: string;
  size: string;
  image?: string;
  description?: string;
};

export type WorldItem = {
  id: string;
  name: string;
  mode: "Survival" | "Creative" | "Hardcore" | "Adventure" | "Spectator";
  difficulty: "Peaceful" | "Easy" | "Normal" | "Hard";
  seed: string;
  cheats: boolean;
  lastPlayed: string;
  size: string;
  spawn: string;
  mcVersion: string;
  buildId: string;
  image?: string;
  path?: string;
};

export type BackupItem = {
  id: string;
  when: string;
  size: string;
  type: "Full" | "Worlds only";
  buildId: string;
};

function formatSize(sizeMb: number): string {
  if (sizeMb >= 1024) return `${(sizeMb / 1024).toFixed(1)} GB`;
  return `${sizeMb.toFixed(sizeMb < 10 ? 1 : 0)} MB`;
}

function relativeTime(ms: number | null): string {
  if (!ms) return "Unknown";
  const diff = Date.now() - ms;
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return "Today";
  if (diff < 2 * day) return "Yesterday";
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function modItemFrom(item: LibraryContentItem): ModItem {
  return {
    id: item.id,
    name: item.title ?? item.name,
    author: item.slug ?? "Unknown author",
    version: item.versionNumber ?? "—",
    size: formatSize(item.sizeMb),
    enabled: item.enabled,
    image: item.iconDataUrl,
    description: item.description,
  };
}

export function packItemFrom(item: LibraryContentItem): PackItem {
  return {
    id: item.id,
    name: item.title ?? item.name,
    resolution: item.versionNumber ?? "—",
    size: formatSize(item.sizeMb),
    enabled: item.enabled,
    image: item.iconDataUrl,
    description: item.description,
  };
}

export function shaderItemFrom(item: LibraryContentItem): ShaderItem {
  return {
    id: item.id,
    name: item.title ?? item.name,
    version: item.versionNumber ?? "—",
    size: formatSize(item.sizeMb),
    image: item.iconDataUrl,
    description: item.description,
  };
}

export function worldItemFrom(
  item: LibraryContentItem,
  buildId: string,
): WorldItem {
  return {
    id: item.id,
    name: item.name,
    mode: item.gameMode ?? "Survival",
    difficulty: item.difficulty ?? "Normal",
    seed: item.seed?.trim() || "—",
    cheats: item.cheats ?? false,
    lastPlayed: relativeTime(item.modifiedMs),
    size: item.sizeMb > 0 ? formatSize(item.sizeMb) : "—",
    spawn: item.spawn?.trim() || "—",
    mcVersion: item.mcVersion?.trim() || "—",
    buildId,
    image: item.iconDataUrl,
    path: item.path,
  };
}

/*
 * Each BuildInstance has its own CultForge instance folder
 * (%APPDATA%/CultForge/instances/{buildId}/). Lookups use that root.
 */
export function modsForBuild(_buildId: string): ModItem[] {
  return useLibraryContentStore
    .getState()
    .itemsOfKind("mod")
    .map(modItemFrom);
}

export function packsForBuild(_buildId: string): PackItem[] {
  return useLibraryContentStore
    .getState()
    .itemsOfKind("resource-pack")
    .map(packItemFrom);
}

export function shadersForBuild(_buildId: string): ShaderItem[] {
  return useLibraryContentStore
    .getState()
    .itemsOfKind("shader")
    .map(shaderItemFrom);
}

export function worldsForBuild(buildId: string): WorldItem[] {
  return useLibraryContentStore
    .getState()
    .itemsOfKind("world")
    .map((item) => worldItemFrom(item, buildId));
}

/** No real backup system exists yet; report none instead of demo rows. */
export function backupsForBuild(_buildId: string): BackupItem[] {
  return [];
}

export function filterContent<T extends { enabled?: boolean; updateAvailable?: boolean; name: string }>(
  items: T[],
  filter: ContentFilter,
  search: string,
): T[] {
  const q = search.trim().toLowerCase();
  return items.filter((item) => {
    if (q && !item.name.toLowerCase().includes(q)) return false;
    if (filter === "Enabled") return item.enabled !== false;
    if (filter === "Disabled") return item.enabled === false;
    if (filter === "Updates") return Boolean(item.updateAvailable);
    return true;
  });
}
