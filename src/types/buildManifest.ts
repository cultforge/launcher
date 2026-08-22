export type BuildContentKind =
  | "mod"
  | "resource-pack"
  | "shader"
  | "config"
  | "server-metadata";

export type BuildManifestEnvironment = "client" | "server" | "both";

export type BuildManifestFile = {
  path: string;
  kind: BuildContentKind;
  environment: BuildManifestEnvironment;
  downloads: string[];
  sizeBytes: number;
  hashes: {
    sha256: string;
    sha512: string;
  };
};

export type BuildContentSummary = {
  mods: number;
  resourcePacks: number;
  shaders: number;
  configs: number;
};

/** Catalog content ref on a guild build (API: required_mods / optional_mods / …). */
export type GuildBuildModRef = {
  name: string;
  slug?: string;
  version?: string;
  sourceUrl?: string;
};

export type GuildBuildLoader =
  | "fabric"
  | "forge"
  | "neoforge"
  | "quilt"
  | "vanilla"
  | string;

export type GuildBuildRelease = {
  id: string;
  buildId: string;
  guildId: string;
  /** Optional local link to a guild server row (not required by guilds API). */
  serverId: string;
  name: string;
  summary: string;
  version: string;
  publishedAt: string;
  publishedAtIso: string;
  image: string;
  dependencies: {
    minecraft: string;
    loader: GuildBuildLoader;
    java: string;
  };
  sizes: {
    downloadBytes: number;
    installedBytes: number;
    /** True when launcher estimated locally (API had no sizes). */
    estimated?: boolean;
  };
  content: BuildContentSummary;
  changelog: string[];
  excludes: string[];
  /** External pack zip URL (Modrinth/CDN) — catalog only; launcher downloads later. */
  downloadUrl?: string | null;
  sourceUrl?: string | null;
  coverUrl?: string | null;
  /** Square build icon (https). Falls back to cover/image when absent. */
  iconUrl?: string | null;
  tagline?: string | null;
  description?: string | null;
  isPublished?: boolean;
  isFeatured?: boolean;
  isPublicCatalog?: boolean;
  keywords?: string[];
  hasInstallManifest?: boolean;
  isInstallable?: boolean;
  installMode?: string;
  deepLink?: string;
  requiredMods?: GuildBuildModRef[];
  optionalMods?: GuildBuildModRef[];
  shaders?: GuildBuildModRef[];
  resourcePacks?: GuildBuildModRef[];
};

export type BuildManifest = {
  schemaVersion: 1;
  releaseId: string;
  generatedAt: string;
  excludes: string[];
  files: BuildManifestFile[];
};

export type GuildBuildInstallState =
  | { state: "installed"; localVersion: string }
  | { state: "installing"; localVersion: string | null }
  | { state: "update-available"; localVersion: string }
  | { state: "not-installed"; localVersion: null };
