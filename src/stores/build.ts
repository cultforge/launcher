import { create } from "zustand";
import {
  ensureBuildInstance,
  duplicateBuildInstance,
  getMinecraftRoot,
  listLocalBuilds,
  listManagedInstances,
  listenScannerEvents,
  parseBuildFoundParams,
  scanBuildsFolder,
  type LocalBuild,
  type ManagedInstanceMeta,
} from "../lib/localContent";
import {
  formatPlaytime,
  readBuildMeta,
  setJavaGpuPreference,
  toUiConfig,
  writeBuildConfig,
  writeBuildNotes,
  type BuildMetaSnapshot,
  type DuplicateIncludes,
} from "../lib/buildMeta";
import { logger } from "../lib/logger";
import { resolveMinecraftVersionImage } from "../lib/minecraftMedia";
import { scheduleChloeInventorySync } from "../lib/chloeInventory";
import { useLibraryContentStore } from "./libraryContent";

export type BuildScreenshot = {
  id: string;
  thumb: string;
};

export type BuildConfig = {
  memoryMinGb: number;
  memoryMaxGb: number;
  jvmArgs: string;
  wrapper: string;
  resolution: string;
  fullscreen: boolean;
  closeOnLaunch: boolean;
  dedicatedGpu: boolean;
};

export type BuildSource = "local" | "guild";

export type BuildSyncStatus = "synced" | "syncing" | "drift" | "error" | "unknown";

export type BuildInstance = {
  id: string;
  name: string;
  mc: string;
  loader: string;
  java: string;
  mods: number;
  lastPlayed: string;
  /** Epoch ms of last successful launch; 0 if never. */
  lastPlayedMs: number;
  status: "Ready" | "Update" | "Offline";
  accent: string;
  description: string;
  tags: string[];
  heroLandscape: string;
  /** Scanner pack icon (data:/https:) when available. */
  image: string | null;
  created: string;
  version: string;
  playtime: string;
  /** Accumulated minutes on disk (cultforge/config.json). */
  playtimeMinutes: number;
  worlds: string;
  size: string;
  /** CultForge per-build instance root (mods/packs/options live here). */
  location: string;
  /** Original .minecraft/versions/{id} path for discovery / icons. */
  versionPath: string;
  screenshots: BuildScreenshot[];
  notes: string;
  config: BuildConfig;
  activeShaderId: string | null;
  /** Local scanned version vs guild-managed install. */
  source: BuildSource;
  /** When true, content is enforced by the guild manifest (no local edits). */
  managed: boolean;
  guildId: string | null;
  releaseId: string | null;
  /** Stable guild build key (release.buildId). */
  buildKey: string | null;
  manifestGeneratedAt: string | null;
  syncStatus: BuildSyncStatus;
};

export const DEFAULT_BUILD_CONFIG: BuildConfig = {
  memoryMinGb: 4,
  memoryMaxGb: 8,
  jvmArgs:
    "-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions -XX:G1NewSizePercent=20",
  wrapper: "",
  resolution: "1920x1080",
  fullscreen: false,
  closeOnLaunch: false,
  dedicatedGpu: true,
};

const ACCENTS = [
  "from-primary-dvivd to-primary-muted",
  "from-primary-muted to-primary-base",
  "from-primary-dvivd to-primary-soft",
];

const HERO_GRADIENTS = [
  "linear-gradient(135deg,#1a1528_0%,#2d3a5c_35%,#1e2838_70%,#0f141c_100%)",
  "linear-gradient(135deg,#0a1628_0%,#1a3050_40%,#2a4870_65%,#0d1218_100%)",
  "linear-gradient(135deg,#1a1810_0%,#3a3420_45%,#2a2818_75%,#101010_100%)",
];

function relativeTime(ms: number | null): string {
  if (!ms) return "Unknown";
  const diff = Date.now() - ms;
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return "Today";
  if (diff < 2 * day) return "Yesterday";
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  if (diff < 30 * day) return `${Math.floor(diff / (7 * day))}w ago`;
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDate(ms: number | null): string {
  if (!ms) return "Unknown";
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function applyPersistedMeta(
  build: BuildInstance,
  meta: BuildMetaSnapshot,
): BuildInstance {
  const minutes = meta.config.playtimeMinutes;
  const lastMs = meta.config.lastPlayedMs;
  return {
    ...build,
    notes: meta.notes,
    config: toUiConfig(meta.config),
    playtimeMinutes: minutes,
    playtime: formatPlaytime(minutes),
    lastPlayedMs: lastMs,
    lastPlayed: lastMs > 0 ? relativeTime(lastMs) : "Never",
  };
}

async function loadPersistedMeta(build: BuildInstance): Promise<BuildInstance> {
  try {
    const meta = await readBuildMeta(build.id);
    if (!meta) return build;
    return applyPersistedMeta(build, meta);
  } catch {
    return build;
  }
}

function localDefaults(index: number) {
  return {
    accent: ACCENTS[index % ACCENTS.length],
    heroLandscape: HERO_GRADIENTS[index % HERO_GRADIENTS.length],
    source: "local" as const,
    managed: false,
    guildId: null,
    releaseId: null,
    buildKey: null,
    manifestGeneratedAt: null,
    syncStatus: "unknown" as const,
  };
}

function fromLocalBuild(local: LocalBuild, index: number): BuildInstance {
  return {
    id: local.id,
    name: local.name,
    mc: local.mc,
    loader: local.loader,
    java: "—",
    mods: 0,
    lastPlayed: "Never",
    lastPlayedMs: 0,
    status: "Ready",
    description: `Local ${local.loader} installation for Minecraft ${local.mc}.`,
    tags: [local.loader, local.mc].filter(Boolean),
    image: null,
    created: formatDate(local.createdMs),
    version: local.mc,
    playtime: "—",
    playtimeMinutes: 0,
    worlds: "0",
    size: "—",
    location: "",
    versionPath: local.path,
    screenshots: [],
    notes: "",
    config: { ...DEFAULT_BUILD_CONFIG },
    activeShaderId: null,
    ...localDefaults(index),
  };
}

function fromManagedMeta(
  meta: ManagedInstanceMeta,
  index: number,
): BuildInstance {
  return {
    id: meta.instanceId,
    name: meta.name,
    mc: meta.mc,
    loader: meta.loader,
    java: meta.java || "—",
    mods: 0,
    lastPlayed: "Never",
    lastPlayedMs: 0,
    status: meta.syncStatus === "synced" ? "Ready" : "Update",
    accent: ACCENTS[index % ACCENTS.length],
    description: `Guild-managed build for ${meta.guildId}.`,
    tags: ["Guild", meta.loader, meta.mc].filter(Boolean),
    heroLandscape: HERO_GRADIENTS[index % HERO_GRADIENTS.length],
    image: meta.image,
    created: meta.created || "—",
    version: meta.version,
    playtime: "—",
    playtimeMinutes: 0,
    worlds: "0",
    size: "—",
    location: meta.path,
    versionPath: "",
    screenshots: [],
    notes: "",
    config: { ...DEFAULT_BUILD_CONFIG },
    activeShaderId: null,
    source: "guild",
    managed: true,
    guildId: meta.guildId,
    releaseId: meta.releaseId,
    buildKey: meta.buildKey,
    manifestGeneratedAt: meta.manifestGeneratedAt,
    syncStatus: (["synced", "syncing", "drift", "error", "unknown"].includes(
      meta.syncStatus,
    )
      ? meta.syncStatus
      : "unknown") as BuildInstance["syncStatus"],
  };
}

/** Honest placeholder shown only when no local builds were detected. */
const EMPTY_BUILD: BuildInstance = {
  id: "none",
  name: "No builds found",
  mc: "—",
  loader: "—",
  java: "—",
  mods: 0,
  lastPlayed: "Never",
  lastPlayedMs: 0,
  status: "Offline",
  accent: ACCENTS[0],
  description:
    "No Minecraft versions yet. Add a build from Mojang, or install one under .minecraft/versions.",
  tags: [],
  heroLandscape: HERO_GRADIENTS[0],
  image: null,
  created: "—",
  version: "—",
  playtime: "—",
  playtimeMinutes: 0,
  worlds: "0",
  size: "—",
  location: "",
  versionPath: "",
  screenshots: [],
  notes: "",
  config: { ...DEFAULT_BUILD_CONFIG },
  activeShaderId: null,
  source: "local",
  managed: false,
  guildId: null,
  releaseId: null,
  buildKey: null,
  manifestGeneratedAt: null,
  syncStatus: "unknown",
};

function buildMatchesId(build: BuildInstance, buildId: string, path: string) {
  if (buildId && (build.id === buildId || build.name === buildId)) return true;
  if (path) {
    const norm = path.replace(/\\/g, "/").toLowerCase();
    const ver = build.versionPath.replace(/\\/g, "/").toLowerCase();
    if (ver && (ver === norm || ver.endsWith(`/${buildId.toLowerCase()}`))) {
      return true;
    }
    if (norm.endsWith(`/${build.id.toLowerCase()}`)) return true;
  }
  return false;
}

type BuildStore = {
  builds: BuildInstance[];
  activeId: string;
  hydrated: boolean;
  hydrating: boolean;
  hydrate: (root?: string) => Promise<void>;
  applyBuildImage: (
    buildId: string,
    image: string | null,
    path?: string,
  ) => void;
  applyContentStats: (stats: { mods: number; worlds: number }) => void;
  upsertBuild: (build: BuildInstance) => void;
  patchBuild: (id: string, patch: Partial<BuildInstance>) => void;
  active: () => BuildInstance;
  setActive: (id: string) => void;
  cycleNext: () => void;
  cyclePrev: () => void;
  setNotes: (id: string, notes: string) => void;
  setConfig: (id: string, config: BuildConfig) => void;
  setActiveShader: (id: string, shaderId: string | null) => void;
  duplicateBuild: (
    sourceId: string,
    name: string,
    includes?: DuplicateIncludes,
  ) => string;
};

let scannerUnlisten: (() => void) | null = null;

export const useBuildStore = create<BuildStore>((set, get) => ({
  builds: [],
  activeId: "",
  hydrated: false,
  hydrating: false,

  hydrate: async (root = "") => {
    if (get().hydrating) return;
    set({ hydrating: true });
    try {
      const locals = await listLocalBuilds(root);
      const builds: BuildInstance[] = [];
      for (let index = 0; index < locals.length; index += 1) {
        const local = locals[index];
        const mapped = fromLocalBuild(local, index);
        try {
          const instance = await ensureBuildInstance(local.id, local.loader);
          if (instance?.path) {
            mapped.location = instance.path;
            if (instance.created) {
              logger.info(`Created instance folder for ${local.id}`);
            }
          }
        } catch (e) {
          logger.warn(
            `Instance ensure failed for ${local.id}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
        builds.push(await loadPersistedMeta(mapped));
      }

      // Version artwork from CultForge minecraft media catalog.
      await Promise.all(
        builds
          .filter((b) => b.source === "local" && !b.image)
          .map(async (b) => {
            try {
              const url = await resolveMinecraftVersionImage(b.id);
              if (url) b.image = url;
            } catch {
              /* ignore */
            }
          }),
      );

      try {
        const managed = await listManagedInstances();
        const offset = builds.length;
        for (let i = 0; i < managed.length; i += 1) {
          const mapped = fromManagedMeta(managed[i], offset + i);
          builds.push(await loadPersistedMeta(mapped));
        }
        if (managed.length) {
          logger.info(`Loaded ${managed.length} guild-managed build(s)`);
        }
      } catch (e) {
        logger.warn(
          `Managed instance scan failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      set((state) => ({
        builds,
        activeId: builds.some((b) => b.id === state.activeId)
          ? state.activeId
          : (builds[0]?.id ?? ""),
        hydrated: true,
        hydrating: false,
      }));
      logger.info(`Discovered ${builds.length} build(s)`);
      scheduleChloeInventorySync();

      // Progressive icons from scanner.exe (event.build_found).
      if (scannerUnlisten) {
        scannerUnlisten();
        scannerUnlisten = null;
      }
      try {
        scannerUnlisten = await listenScannerEvents((evt) => {
          if (evt.method !== "event.build_found") return;
          const found = parseBuildFoundParams(evt.params);
          if (!found?.image) return;
          get().applyBuildImage(found.build_id, found.image, found.path);
        });
        const scanRoot = root.trim() || (await getMinecraftRoot());
        if (scanRoot) {
          await scanBuildsFolder(scanRoot);
        }
      } catch (e) {
        logger.warn(
          `Build image scan skipped: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    } catch (e) {
      set({ hydrated: true, hydrating: false });
      logger.error(
        `Build discovery failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  },

  upsertBuild: (build) => {
    set((state) => {
      const idx = state.builds.findIndex((b) => b.id === build.id);
      if (idx < 0) {
        return {
          builds: [...state.builds, build],
          activeId: state.activeId || build.id,
        };
      }
      const builds = state.builds.slice();
      builds[idx] = { ...builds[idx], ...build };
      return { builds };
    });
    scheduleChloeInventorySync();
  },

  patchBuild: (id, patch) => {
    set((state) => ({
      builds: state.builds.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
  },
  applyBuildImage: (buildId, image, path = "") => {
    if (!image) return;
    set((state) => {
      let matched = false;
      const builds = state.builds.map((b) => {
        if (!buildMatchesId(b, buildId, path)) return b;
        matched = true;
        return { ...b, image };
      });
      if (!matched) return state;
      return { builds };
    });
  },

  // Per-build instance stats (active build only).
  applyContentStats: ({ mods, worlds }) => {
    set((state) => ({
      builds: state.builds.map((b) =>
        b.id === state.activeId
          ? { ...b, mods, worlds: String(worlds) }
          : b,
      ),
    }));
    scheduleChloeInventorySync();
  },

  active: () =>
    get().builds.find((b) => b.id === get().activeId) ??
    get().builds[0] ??
    EMPTY_BUILD,
  setActive: (id) => {
    set({ activeId: id });
    const build = get().builds.find((b) => b.id === id);
    if (build?.managed && build.releaseId && navigator.onLine) {
      void import("../lib/guildBuildSync").then(({ syncManagedBuild }) =>
        syncManagedBuild(id, { quiet: true }).catch((e) => {
          logger.warn(
            `Managed sync on select failed: ${e instanceof Error ? e.message : String(e)}`,
          );
          get().patchBuild(id, { syncStatus: "drift", status: "Update" });
        }),
      );
    }
    if (build?.location) {
      void useLibraryContentStore.getState().scan(build.location).then(() => {
        const content = useLibraryContentStore.getState();
        get().applyContentStats({
          mods: content.itemsOfKind("mod").length,
          worlds: content.itemsOfKind("world").length,
        });
      });
    } else {
      useLibraryContentStore.setState({
        items: [],
        scanned: true,
        scanning: false,
        root: "",
        optionsPath: "",
        optionsExists: false,
        optionsEntries: [],
        activeShaderName: null,
      });
    }
    if (build && build.id !== "none") {
      void loadPersistedMeta(build).then((next) => {
        if (get().activeId !== id) return;
        get().patchBuild(id, {
          notes: next.notes,
          config: next.config,
          playtimeMinutes: next.playtimeMinutes,
          playtime: next.playtime,
          lastPlayedMs: next.lastPlayedMs,
          lastPlayed: next.lastPlayed,
        });
      });
    }
  },
  cycleNext: () => {
    const { builds, activeId } = get();
    if (builds.length === 0) return;
    const i = builds.findIndex((b) => b.id === activeId);
    const next = builds[(i + 1) % builds.length];
    get().setActive(next.id);
  },
  cyclePrev: () => {
    const { builds, activeId } = get();
    if (builds.length === 0) return;
    const i = builds.findIndex((b) => b.id === activeId);
    const prev = builds[(i - 1 + builds.length) % builds.length];
    get().setActive(prev.id);
  },
  setNotes: (id, notes) => {
    set((s) => ({
      builds: s.builds.map((b) => (b.id === id ? { ...b, notes } : b)),
    }));
    void writeBuildNotes(id, notes).catch((e) => {
      logger.warn(
        `Write notes failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    });
  },
  setConfig: (id, config) => {
    const prev = get().builds.find((b) => b.id === id);
    set((s) => ({
      builds: s.builds.map((b) => (b.id === id ? { ...b, config } : b)),
    }));
    void writeBuildConfig(
      id,
      config,
      prev?.playtimeMinutes ?? 0,
      prev?.lastPlayedMs ?? 0,
    ).catch((e) => {
      logger.warn(
        `Write config failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    });
    if (prev && prev.config.dedicatedGpu !== config.dedicatedGpu) {
      void setJavaGpuPreference(config.dedicatedGpu).catch((e) => {
        logger.warn(
          `GPU preference failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      });
    }
  },
  setActiveShader: (id, activeShaderId) =>
    set((s) => ({
      builds: s.builds.map((b) =>
        b.id === id ? { ...b, activeShaderId } : b,
      ),
    })),
  duplicateBuild: (sourceId, name, includes) => {
    const source = get().builds.find((b) => b.id === sourceId);
    if (!source) return get().activeId;
    if (source.managed) {
      logger.warn("Cannot duplicate a guild-managed build");
      return get().activeId;
    }
    const id = `copy-${source.id}-${Date.now()}`;
    const clone: BuildInstance = {
      ...source,
      id,
      name,
      lastPlayed: "Never",
      lastPlayedMs: 0,
      status: "Ready",
      created: new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      location: "",
      versionPath: source.versionPath,
      config: { ...source.config },
      tags: [...source.tags],
      screenshots: source.screenshots.map((s) => ({ ...s })),
      image: source.image,
      mods: source.mods,
      worlds: source.worlds,
      source: "local",
      managed: false,
      guildId: null,
      releaseId: null,
      buildKey: null,
      manifestGeneratedAt: null,
      syncStatus: "unknown",
    };
    set((s) => ({ builds: [...s.builds, clone], activeId: id }));

    const finish = (path: string) => {
      set((s) => ({
        builds: s.builds.map((b) =>
          b.id === id ? { ...b, location: path } : b,
        ),
      }));
      if (get().activeId === id) {
        get().setActive(id);
      }
    };

    void (async () => {
      try {
        // Ensure source folder exists before copy.
        if (!source.location) {
          await ensureBuildInstance(source.id, source.loader);
        }
        const instance = await duplicateBuildInstance(
          source.id,
          id,
          source.loader,
          includes,
        );
        if (instance?.path) finish(instance.path);
      } catch (e) {
        logger.warn(
          `Duplicate copy failed for ${id}, falling back to empty instance: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
        try {
          const instance = await ensureBuildInstance(id, source.loader);
          if (instance?.path) finish(instance.path);
        } catch (err) {
          logger.warn(
            `Instance ensure failed for duplicate ${id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    })();
    return id;
  },
}));
