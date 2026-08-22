import { invoke } from "@tauri-apps/api/core";
import type { BuildConfig } from "../stores/build";
import { DEFAULT_BUILD_CONFIG } from "../stores/build";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export type PersistedBuildConfig = BuildConfig & {
  playtimeMinutes: number;
  lastPlayedMs: number;
};

export type BuildMetaSnapshot = {
  notes: string;
  config: PersistedBuildConfig;
};

export type BackupInfo = {
  id: string;
  path: string;
  createdMs: number;
  sizeBytes: number;
};

export type DisplayResolutions = {
  maxWidth: number;
  maxHeight: number;
  presets: string[];
};

export type DuplicateIncludes = {
  full: boolean;
  mods: boolean;
  resourcepacks: boolean;
  shaderpacks: boolean;
  config: boolean;
  worlds: boolean;
};

function fromNativeConfig(raw: {
  memoryMinGb: number;
  memoryMaxGb: number;
  jvmArgs: string;
  wrapper: string;
  resolution: string;
  fullscreen: boolean;
  closeOnLaunch: boolean;
  dedicatedGpu: boolean;
  playtimeMinutes?: number;
  lastPlayedMs?: number;
}): PersistedBuildConfig {
  return {
    memoryMinGb: raw.memoryMinGb,
    memoryMaxGb: raw.memoryMaxGb,
    jvmArgs: raw.jvmArgs,
    wrapper: raw.wrapper,
    resolution: raw.resolution,
    fullscreen: raw.fullscreen,
    closeOnLaunch: raw.closeOnLaunch,
    dedicatedGpu: raw.dedicatedGpu,
    playtimeMinutes:
      typeof raw.playtimeMinutes === "number" ? raw.playtimeMinutes : 0,
    lastPlayedMs: typeof raw.lastPlayedMs === "number" ? raw.lastPlayedMs : 0,
  };
}

export function formatPlaytime(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

export function toUiConfig(cfg: PersistedBuildConfig): BuildConfig {
  return {
    memoryMinGb: cfg.memoryMinGb,
    memoryMaxGb: cfg.memoryMaxGb,
    jvmArgs: cfg.jvmArgs,
    wrapper: cfg.wrapper,
    resolution: cfg.resolution,
    fullscreen: cfg.fullscreen,
    closeOnLaunch: cfg.closeOnLaunch,
    dedicatedGpu: cfg.dedicatedGpu,
  };
}

export async function readBuildMeta(
  buildId: string,
): Promise<BuildMetaSnapshot | null> {
  if (!isTauri() || !buildId.trim()) return null;
  const raw = await invoke<{
    notes: string;
    config: {
      memoryMinGb: number;
      memoryMaxGb: number;
      jvmArgs: string;
      wrapper: string;
      resolution: string;
      fullscreen: boolean;
      closeOnLaunch: boolean;
      dedicatedGpu: boolean;
      playtimeMinutes?: number;
      lastPlayedMs?: number;
    };
  }>("read_build_meta", { buildId });
  return {
    notes: raw.notes ?? "",
    config: fromNativeConfig(raw.config),
  };
}

export async function writeBuildNotes(
  buildId: string,
  notes: string,
): Promise<void> {
  if (!isTauri()) return;
  await invoke("write_build_notes", { buildId, notes });
}

export async function writeBuildConfig(
  buildId: string,
  config: BuildConfig,
  playtimeMinutes = 0,
  lastPlayedMs = 0,
): Promise<void> {
  if (!isTauri()) return;
  await invoke("write_build_config", {
    buildId,
    config: {
      memoryMinGb: config.memoryMinGb,
      memoryMaxGb: config.memoryMaxGb,
      jvmArgs: config.jvmArgs,
      wrapper: config.wrapper,
      resolution: config.resolution,
      fullscreen: config.fullscreen,
      closeOnLaunch: config.closeOnLaunch,
      dedicatedGpu: config.dedicatedGpu,
      playtimeMinutes,
      lastPlayedMs,
    },
  });
}

export async function addBuildPlaytimeMinutes(
  buildId: string,
  minutes: number,
): Promise<PersistedBuildConfig | null> {
  if (!isTauri() || !buildId.trim() || !(minutes > 0)) return null;
  const raw = await invoke<{
    memoryMinGb: number;
    memoryMaxGb: number;
    jvmArgs: string;
    wrapper: string;
    resolution: string;
    fullscreen: boolean;
    closeOnLaunch: boolean;
    dedicatedGpu: boolean;
    playtimeMinutes?: number;
    lastPlayedMs?: number;
  }>("add_build_playtime_minutes", { buildId, minutes });
  return fromNativeConfig(raw);
}

export async function touchBuildLastPlayed(
  buildId: string,
): Promise<PersistedBuildConfig | null> {
  if (!isTauri() || !buildId.trim()) return null;
  const raw = await invoke<{
    memoryMinGb: number;
    memoryMaxGb: number;
    jvmArgs: string;
    wrapper: string;
    resolution: string;
    fullscreen: boolean;
    closeOnLaunch: boolean;
    dedicatedGpu: boolean;
    playtimeMinutes?: number;
    lastPlayedMs?: number;
  }>("touch_build_last_played", { buildId });
  return fromNativeConfig(raw);
}

export async function setJavaGpuPreference(
  dedicated: boolean,
  javaHint?: string | null,
): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string>("set_java_gpu_preference", {
    javaHint: javaHint ?? null,
    dedicated,
  });
}

export async function listBuildBackups(buildId: string): Promise<BackupInfo[]> {
  if (!isTauri()) return [];
  return invoke<BackupInfo[]>("list_build_backups", { buildId });
}

export async function createBuildBackup(
  buildId: string,
  worldsOnly = false,
): Promise<BackupInfo> {
  if (!isTauri()) throw new Error("Backup requires the CultForge desktop app");
  return invoke<BackupInfo>("create_build_backup", { buildId, worldsOnly });
}

export async function restoreBuildBackup(
  buildId: string,
  backupId: string,
): Promise<void> {
  if (!isTauri()) throw new Error("Restore requires the CultForge desktop app");
  await invoke("restore_build_backup", { buildId, backupId });
}

export async function deleteBuildBackup(
  buildId: string,
  backupId: string,
): Promise<void> {
  if (!isTauri()) throw new Error("Delete requires the CultForge desktop app");
  await invoke("delete_build_backup", { buildId, backupId });
}

export async function listDisplayResolutions(): Promise<DisplayResolutions> {
  if (!isTauri()) {
    return {
      maxWidth: 1920,
      maxHeight: 1080,
      presets: ["1280x720", "1600x900", "1920x1080"],
    };
  }
  return invoke<DisplayResolutions>("list_display_resolutions");
}

export async function openInstanceSubdir(
  buildId: string,
  subdir: string,
): Promise<void> {
  if (!isTauri()) throw new Error("Open folder requires the CultForge desktop app");
  await invoke("open_instance_subdir", { buildId, subdir });
}

export async function pickContentFiles(kind: string): Promise<string[]> {
  if (!isTauri()) return [];
  return invoke<string[]>("pick_content_files", { kind });
}

export type ImportReroute = {
  name: string;
  fromKind: string;
  toKind: string;
};

export type ImportFilesResult = {
  imported: number;
  reroutes: ImportReroute[];
};

export async function importInstanceFiles(
  buildId: string,
  destKind: string,
  paths: string[],
): Promise<ImportFilesResult> {
  if (!isTauri()) throw new Error("Import requires the CultForge desktop app");
  return invoke<ImportFilesResult>("import_instance_files", {
    buildId,
    destKind,
    paths,
  });
}

export type ImportWorldResult = {
  worldPath: string;
  worldName: string;
};

export async function importWorldNative(
  buildId: string,
  source: string,
  sourceKind?: "folder" | "zip" | "url",
): Promise<ImportWorldResult> {
  if (!isTauri()) throw new Error("Import requires the CultForge desktop app");
  return invoke<ImportWorldResult>("import_world", {
    buildId,
    source,
    sourceKind: sourceKind ?? null,
  });
}

export async function importContentUrlNative(
  buildId: string,
  destKind: string,
  url: string,
): Promise<ImportFilesResult> {
  if (!isTauri()) throw new Error("Import requires the CultForge desktop app");
  return invoke<ImportFilesResult>("import_content_url", {
    buildId,
    destKind,
    url,
  });
}

export async function duplicateBuildInstanceWithIncludes(
  sourceBuildId: string,
  destBuildId: string,
  loader: string,
  includes: DuplicateIncludes,
): Promise<{ buildId: string; path: string; created: boolean; loader: string }> {
  if (!isTauri()) {
    throw new Error("Duplicate requires the CultForge desktop app");
  }
  return invoke("duplicate_build_instance", {
    sourceBuildId,
    destBuildId,
    loader,
    includes,
  });
}

export function defaultPersistedConfig(): PersistedBuildConfig {
  return { ...DEFAULT_BUILD_CONFIG, playtimeMinutes: 0, lastPlayedMs: 0 };
}
