import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type LocalBuild = {
  id: string;
  name: string;
  path: string;
  mc: string;
  loader: string;
  createdMs: number | null;
  modifiedMs: number | null;
};

export type LocalFile = {
  name: string;
  fileName: string;
  path: string;
  sizeMb: number;
  modifiedMs: number | null;
  enabled: boolean;
};

export type LocalContent = {
  root: string;
  mods: LocalFile[];
  resourcepacks: LocalFile[];
  shaderpacks: LocalFile[];
  datapacks: LocalFile[];
  worlds: LocalFile[];
};

export type FileHashes = { sha1: string; sha512: string };

export type CachedContentMeta = {
  matched: boolean;
  title?: string;
  description?: string;
  iconUrl?: string | null;
  slug?: string;
  projectId?: string;
  projectType?: string;
  versionNumber?: string;
  fetchedAt?: number;
};

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function getMinecraftRoot(): Promise<string> {
  if (!isTauri()) return "";
  return invoke<string>("get_minecraft_root");
}

export type BuildInstanceRoot = {
  buildId: string;
  path: string;
  created: boolean;
  loader: string;
};

export type ManagedInstanceMeta = {
  instanceId: string;
  path: string;
  guildId: string;
  releaseId: string;
  buildKey: string;
  name: string;
  mc: string;
  loader: string;
  java: string;
  version: string;
  image: string | null;
  created: string;
  manifestGeneratedAt: string | null;
  syncStatus: "synced" | "syncing" | "drift" | "error" | "unknown";
};

export type GuildManifestSyncFile = {
  path: string;
  name: string;
  url: string;
  sizeBytes: number;
  sha512: string;
  environment: string;
};

export type GuildManifestSyncPlan = {
  jobId: string;
  instanceId: string;
  buildLocation: string;
  cacheRoot: string;
  loader: string;
  releaseId: string;
  guildId: string;
  buildKey: string;
  name: string;
  mc: string;
  version: string;
  java: string;
  image: string | null;
  manifestGeneratedAt: string;
  excludes: string[];
  files: GuildManifestSyncFile[];
  manifestJson: string;
};

export type GuildSyncCheckResult = {
  synced: boolean;
  missing: string[];
  mismatched: string[];
  extras: string[];
};

export async function getInstancesRoot(): Promise<string> {
  if (!isTauri()) return "";
  return invoke<string>("get_instances_root");
}

export async function ensureBuildInstance(
  buildId: string,
  loader = "Vanilla",
): Promise<BuildInstanceRoot | null> {
  if (!isTauri() || !buildId.trim() || buildId === "none") return null;
  return invoke<BuildInstanceRoot>("ensure_build_instance", {
    buildId,
    loader,
  });
}

export async function openInstanceFolder(path: string): Promise<void> {
  if (!isTauri()) {
    throw new Error("Open folder requires the CultForge desktop app");
  }
  const trimmed = path.trim();
  if (!trimmed) throw new Error("Missing instance folder path");
  await invoke("open_instance_folder", { path: trimmed });
}

export async function duplicateBuildInstance(
  sourceBuildId: string,
  destBuildId: string,
  loader = "Vanilla",
  includes?: {
    full: boolean;
    mods: boolean;
    resourcepacks: boolean;
    shaderpacks: boolean;
    config: boolean;
    worlds: boolean;
  },
): Promise<BuildInstanceRoot> {
  if (!isTauri()) {
    throw new Error("Duplicate requires the CultForge desktop app");
  }
  return invoke<BuildInstanceRoot>("duplicate_build_instance", {
    sourceBuildId,
    destBuildId,
    loader,
    includes: includes ?? null,
  });
}

export type ExportPackResult = {
  path: string;
  bytes: number;
};

export async function exportBuildPack(args: {
  buildId: string;
  packName: string;
  includeMods: boolean;
  includeConfig: boolean;
  includeWorlds: boolean;
}): Promise<ExportPackResult> {
  if (!isTauri()) {
    throw new Error("Export requires the CultForge desktop app");
  }
  return invoke<ExportPackResult>("export_build_pack", { args });
}

export async function listManagedInstances(): Promise<ManagedInstanceMeta[]> {
  if (!isTauri()) return [];
  return invoke<ManagedInstanceMeta[]>("list_managed_instances");
}

export async function checkGuildManifestSync(
  buildLocation: string,
  files: GuildManifestSyncFile[],
  excludes: string[] = [],
): Promise<GuildSyncCheckResult> {
  if (!isTauri()) {
    return { synced: false, missing: [], mismatched: [], extras: [] };
  }
  return invoke<GuildSyncCheckResult>("check_guild_manifest_sync", {
    buildLocation,
    files,
    excludes,
  });
}

export async function startGuildManifestSync(
  plan: GuildManifestSyncPlan,
): Promise<string> {
  if (!isTauri()) {
    throw new Error("Guild sync requires the CultForge desktop app");
  }
  return invoke<string>("start_guild_manifest_sync", { plan });
}

export async function listLocalBuilds(root = ""): Promise<LocalBuild[]> {
  if (!isTauri()) return [];
  return invoke<LocalBuild[]>("list_local_builds", { root });
}

export async function listLocalContent(root = ""): Promise<LocalContent | null> {
  if (!isTauri() || !root.trim()) return null;
  return invoke<LocalContent>("list_local_content", { root });
}

/** Raw scanner.exe JSON-RPC call (scan_mods / scan_mod / scan_world / scan_worlds / scan_builds). */
export async function scannerCall<T = unknown>(
  method:
    | "scan_mods"
    | "scan_mod"
    | "scan_world"
    | "scan_worlds"
    | "scan_builds",
  params: Record<string, unknown>,
): Promise<T> {
  return invoke<T>("scanner_call", { method, params });
}

export type ScannerModResult = {
  filename: string;
  id: number;
  image: string | null;
  name: string;
  path: string;
  size_mb: number;
};

export type ScannerBuildFound = {
  build_id: string;
  image: string | null;
  name: string;
  path: string;
  size_bytes?: number;
};

export type ScannerEventPayload = {
  method: string;
  params: unknown;
};

/** Start scanning local builds; images arrive via `event.build_found` notifications. */
export async function scanBuildsFolder(root: string): Promise<void> {
  if (!isTauri()) return;
  await scannerCall("scan_builds", { root });
}

/** Listen for scanner.exe notification methods (e.g. event.build_found). */
export async function listenScannerEvents(
  onEvent: (event: ScannerEventPayload) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  return listen<ScannerEventPayload>("scanner-event", (event) => {
    const payload = event.payload;
    if (!payload || typeof payload !== "object") return;
    const method =
      typeof payload.method === "string" ? payload.method : "";
    if (!method) return;
    onEvent({ method, params: payload.params });
  });
}

export function parseBuildFoundParams(
  params: unknown,
): ScannerBuildFound | null {
  if (!params || typeof params !== "object") return null;
  const obj = params as Record<string, unknown>;
  const buildId =
    (typeof obj.build_id === "string" && obj.build_id) ||
    (typeof obj.id === "string" && obj.id) ||
    "";
  const name = typeof obj.name === "string" ? obj.name : "";
  const path = typeof obj.path === "string" ? obj.path : "";
  if (!buildId && !path && !name) return null;
  const image =
    typeof obj.image === "string" && obj.image.trim() ? obj.image : null;
  return {
    build_id: buildId || name,
    image,
    name: name || buildId,
    path,
    size_bytes:
      typeof obj.size_bytes === "number" ? obj.size_bytes : undefined,
  };
}

export async function scanModsFolder(
  path: string,
): Promise<ScannerModResult[]> {
  if (!isTauri()) return [];
  const result = await scannerCall<ScannerModResult[] | null>("scan_mods", {
    path,
  });
  return Array.isArray(result) ? result : [];
}

export type ScannerWorldResult = {
  path?: string;
  name?: string;
  image?: string | null;
  level_dat?: unknown;
};

function asWorldResult(value: unknown): ScannerWorldResult | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  if (
    typeof obj.path !== "string" &&
    typeof obj.name !== "string" &&
    !("level_dat" in obj)
  ) {
    return null;
  }
  return {
    path: typeof obj.path === "string" ? obj.path : undefined,
    name: typeof obj.name === "string" ? obj.name : undefined,
    image: typeof obj.image === "string" ? obj.image : null,
    level_dat: obj.level_dat,
  };
}

export async function scanWorldFolder(
  path: string,
): Promise<ScannerWorldResult | null> {
  if (!isTauri() || !path.trim()) return null;
  const result = await scannerCall<unknown>("scan_world", { path });
  return asWorldResult(result);
}

export async function scanWorldsFolder(
  path: string,
): Promise<ScannerWorldResult[]> {
  if (!isTauri() || !path.trim()) return [];
  const result = await scannerCall<unknown>("scan_worlds", { path });
  if (Array.isArray(result)) {
    return result
      .map(asWorldResult)
      .filter((row): row is ScannerWorldResult => row !== null);
  }
  const single = asWorldResult(result);
  return single ? [single] : [];
}

export async function hashContentFile(path: string): Promise<FileHashes> {
  return invoke<FileHashes>("content_hash_file", { path });
}

export async function cacheGetMeta(
  cacheRoot: string,
  sha1: string,
): Promise<CachedContentMeta | null> {
  return invoke<CachedContentMeta | null>("cache_get_meta", {
    cacheRoot,
    sha1,
  });
}

export async function cachePutMeta(
  cacheRoot: string,
  sha1: string,
  meta: CachedContentMeta,
): Promise<void> {
  await invoke("cache_put_meta", { cacheRoot, sha1, meta });
}

export async function cacheEnsureImage(
  cacheRoot: string,
  sha1: string,
  url?: string | null,
): Promise<string | null> {
  return invoke<string | null>("cache_ensure_image", {
    cacheRoot,
    sha1,
    url: url ?? null,
  });
}

export type OptionsEntry = {
  key: string;
  value: string;
  kind: "entry" | "raw" | string;
};

export type OptionsFile = {
  path: string;
  exists: boolean;
  entries: OptionsEntry[];
};

export type SetEnabledResult = {
  path: string;
  fileName: string;
  enabled: boolean;
};

export async function setModEnabled(
  path: string,
  enabled: boolean,
  root: string,
): Promise<SetEnabledResult> {
  if (!isTauri()) {
    throw new Error("Mod enable/disable requires the CultForge desktop app");
  }
  return invoke<SetEnabledResult>("set_mod_enabled", { path, enabled, root });
}

export async function readMinecraftOptions(
  root = "",
): Promise<OptionsFile> {
  if (!isTauri()) {
    return { path: "", exists: false, entries: [] };
  }
  return invoke<OptionsFile>("read_minecraft_options", { root });
}

export async function writeMinecraftOptions(
  entries: OptionsEntry[],
  root = "",
): Promise<OptionsFile> {
  if (!isTauri()) {
    throw new Error("Writing options.txt requires the CultForge desktop app");
  }
  return invoke<OptionsFile>("write_minecraft_options", { root, entries });
}

export async function setResourcePackEnabled(
  packFileName: string,
  enabled: boolean,
  root = "",
): Promise<OptionsFile> {
  if (!isTauri()) {
    throw new Error("Pack enable/disable requires the CultForge desktop app");
  }
  return invoke<OptionsFile>("set_resource_pack_enabled", {
    root,
    packFileName,
    enabled,
  });
}

export async function setShaderPack(
  shaderName: string | null,
  root = "",
): Promise<OptionsFile> {
  if (!isTauri()) {
    throw new Error("Shader selection requires the CultForge desktop app");
  }
  return invoke<OptionsFile>("set_shader_pack", {
    root,
    shaderName,
  });
}
