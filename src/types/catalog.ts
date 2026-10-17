/** Shared types for the agent-bindings / public-catalog / personal-mode contract. */

import type { GuildBuildModRef } from "./buildManifest";

export interface CatalogBuildRecord {
  id: string;
  buildScope: "guild" | "user";
  guildId: string | null;
  ownerId: string;
  name: string;
  tagline?: string;
  loader: string;
  minecraftVersion: string;
  keywords: string[];
  isPublicCatalog: boolean;
  isInstallable: boolean;
  hasInstallManifest: boolean;
  iconUrl?: string;
  coverUrl?: string;
}

export interface UserBuildRecord {
  id: string;
  ownerId: string;
  name: string;
  minecraftVersion: string;
  loader: string;
  tagline?: string;
  description?: string;
  downloadUrl?: string;
  sourceUrl?: string;
  iconUrl?: string;
  coverUrl?: string;
  isPublished: boolean;
  isPublicCatalog: boolean;
  keywords: string[];
  hasInstallManifest: boolean;
  isInstallable: boolean;
  installMode?: string;
  requiredMods?: GuildBuildModRef[];
  optionalMods?: GuildBuildModRef[];
  shaders?: GuildBuildModRef[];
  resourcePacks?: GuildBuildModRef[];
  createdAt: string;
  updatedAt?: string;
}

export type PersonalServerVisibility = "private" | "unlisted" | "public";
export type PersonalServerJoinPolicy =
  | "open"
  | "allowlist"
  | "guild_members"
  | "friends";

export interface UserPersonalServerRecord {
  id: string;
  ownerId: string;
  name: string;
  serverAddress: string;
  port: number;
  configuredAddress: string;
  configuredPort: number;
  effectiveAddress: string;
  effectivePort: number;
  addressSource: "configured" | "tunnel";
  buildId?: string;
  themeColor: string;
  isActive: boolean;
  visibility: PersonalServerVisibility;
  joinPolicy: PersonalServerJoinPolicy;
  allowlistUserIds: string[];
  allowlistUsernames: string[];
  denylistUserIds: string[];
  preferredAgentNodeId?: string | null;
}

export interface CultAgentServerBindingRecord {
  id: string;
  nodeId: string;
  scope: "guild" | "personal";
  guildId?: string;
  guildServerId?: string;
  personalServerId?: string;
  workloadId?: string;
  revokedAt?: string | null;
  createdAt: string;
}

/**
 * Validate a single keyword tag: 1–13 chars, lowercase `[a-z0-9_-]` only.
 */
export function isValidKeyword(tag: string): boolean {
  return /^[a-z0-9_-]{1,13}$/.test(tag);
}

/**
 * Normalize + validate a keyword list. Returns clean array (max 13).
 * Drops invalid entries silently.
 */
export function normalizeKeywords(raw: string[]): string[] {
  return raw
    .map((t) => t.trim().toLowerCase())
    .filter(isValidKeyword)
    .slice(0, 13);
}
