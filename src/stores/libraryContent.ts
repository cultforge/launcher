import { create } from "zustand";
import {
  cacheEnsureImage,
  cacheGetMeta,
  cachePutMeta,
  hashContentFile,
  listLocalContent,
  readMinecraftOptions,
  scanModsFolder,
  scanWorldFolder,
  scanWorldsFolder,
  setModEnabled as setModEnabledNative,
  setResourcePackEnabled as setResourcePackEnabledNative,
  setShaderPack as setShaderPackNative,
  type LocalFile,
  type OptionsEntry,
  type OptionsFile,
} from "../lib/localContent";
import {
  normalizeFsPath,
  parseWorldScan,
  scannerImageToDataUrl,
  type WorldDifficulty,
  type WorldGameMode,
} from "../lib/worldScan";
import {
  getOptionValue,
  isPackEnabledInOptions,
  normalizeShaderName,
} from "../lib/minecraftOptions";
import {
  getModrinthProject,
  getModrinthVersionByFileHash,
} from "../lib/modrinth";
import { logger } from "../lib/logger";
import { scheduleChloeInventorySync } from "../lib/chloeInventory";
import { useSettingsStore } from "./settings";
import { useBuildStore } from "./build";

function assertContentEditable() {
  const active = useBuildStore.getState().active();
  if (active.managed) {
    throw new Error(
      "This build is guild-managed. Content follows the guild manifest and cannot be edited locally.",
    );
  }
}

export type LibraryKind =
  | "mod"
  | "shader"
  | "resource-pack"
  | "datapack"
  | "world";

export type LibraryContentItem = {
  id: string;
  kind: LibraryKind;
  name: string;
  fileName: string;
  path: string;
  sizeMb: number;
  modifiedMs: number | null;
  enabled: boolean;
  /** Modrinth-enriched fields (live or from disk cache) */
  title?: string;
  description?: string;
  iconDataUrl?: string;
  versionNumber?: string;
  projectId?: string;
  slug?: string;
  sha1?: string;
  enriched?: boolean;
  seed?: string;
  spawn?: string;
  gameMode?: WorldGameMode;
  difficulty?: WorldDifficulty;
  cheats?: boolean;
  mcVersion?: string;
};

type LibraryContentStore = {
  root: string;
  items: LibraryContentItem[];
  scanning: boolean;
  enriching: boolean;
  scanned: boolean;
  optionsPath: string;
  optionsExists: boolean;
  optionsEntries: OptionsEntry[];
  activeShaderName: string | null;
  optionsLoading: boolean;
  scan: (root?: string) => Promise<void>;
  enrich: (online: boolean) => Promise<void>;
  loadOptions: (root?: string) => Promise<OptionsFile | null>;
  applyOptionsFile: (file: OptionsFile) => void;
  setModEnabled: (id: string, enabled: boolean) => Promise<void>;
  setPackEnabled: (id: string, enabled: boolean) => Promise<void>;
  setActiveShaderPack: (fileName: string | null) => Promise<void>;
  itemsOfKind: (kind: LibraryKind) => LibraryContentItem[];
};

function toItem(file: LocalFile, kind: LibraryKind): LibraryContentItem {
  return {
    id: `${kind}:${file.path}`,
    kind,
    name: file.name,
    fileName: file.fileName,
    path: file.path,
    sizeMb: file.sizeMb,
    modifiedMs: file.modifiedMs,
    enabled: file.enabled,
  };
}

function cacheRoot(): string {
  return useSettingsStore.getState().settings.downloadsPath;
}

function applyPackEnabledFromOptions(
  items: LibraryContentItem[],
  entries: OptionsEntry[],
): LibraryContentItem[] {
  return items.map((item) => {
    if (item.kind !== "resource-pack") return item;
    return {
      ...item,
      enabled: isPackEnabledInOptions(entries, item.fileName),
    };
  });
}

/** Limit concurrent enrichment work so we don't hammer disk/API. */
async function mapLimit<T>(
  values: T[],
  limit: number,
  worker: (value: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  const lanes = Array.from({ length: Math.min(limit, values.length) }, () =>
    (async () => {
      while (index < values.length) {
        const current = values[index];
        index += 1;
        await worker(current);
      }
    })(),
  );
  await Promise.all(lanes);
}

export const useLibraryContentStore = create<LibraryContentStore>(
  (set, get) => ({
    root: "",
    items: [],
    scanning: false,
    enriching: false,
    scanned: false,
    optionsPath: "",
    optionsExists: false,
    optionsEntries: [],
    activeShaderName: null,
    optionsLoading: false,

    scan: async (root = "") => {
      set({ scanning: true });
      try {
        const content = await listLocalContent(root);
        if (!content) {
          set({ scanning: false, scanned: true, items: [] });
          return;
        }

        let items: LibraryContentItem[] = [
          ...content.mods.map((f) => toItem(f, "mod")),
          ...content.shaderpacks.map((f) => toItem(f, "shader")),
          ...content.resourcepacks.map((f) => toItem(f, "resource-pack")),
          ...content.datapacks.map((f) => toItem(f, "datapack")),
          ...content.worlds.map((f) => toItem(f, "world")),
        ];

        try {
          const scanned = await scanModsFolder(`${content.root}\\mods`);
          const byPath = new Map(
            scanned.map((mod) => [normalizeFsPath(mod.path), mod]),
          );
          for (const item of items) {
            if (item.kind !== "mod") continue;
            const mod = byPath.get(normalizeFsPath(item.path));
            if (!mod) continue;
            if (mod.name) item.name = mod.name;
            const icon = scannerImageToDataUrl(mod.image);
            if (icon) item.iconDataUrl = icon;
          }
        } catch (e) {
          logger.warn(
            `scanner.exe mods scan failed: ${e instanceof Error ? e.message : String(e)}`,
          );
        }

        try {
          const worldItems = items.filter((item) => item.kind === "world");
          let scannedWorlds: Awaited<ReturnType<typeof scanWorldsFolder>> = [];
          try {
            scannedWorlds = await scanWorldsFolder(`${content.root}\\saves`);
          } catch (e) {
            logger.debug(
              `scanner.exe scan_worlds failed, falling back to scan_world: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
          if (scannedWorlds.length === 0 && worldItems.length > 0) {
            scannedWorlds = (
              await Promise.all(
                worldItems.map((item) => scanWorldFolder(item.path)),
              )
            ).filter((row): row is NonNullable<typeof row> => row !== null);
          }
          const byPath = new Map<string, NonNullable<ReturnType<typeof parseWorldScan>>>();
          for (const world of scannedWorlds) {
            const parsed = parseWorldScan(world);
            const path = parsed?.path || world.path;
            if (!parsed || !path) continue;
            byPath.set(normalizeFsPath(path), parsed);
          }
          for (const item of items) {
            if (item.kind !== "world") continue;
            const parsed = byPath.get(normalizeFsPath(item.path));
            if (!parsed) continue;
            if (parsed.name) item.name = parsed.name;
            if (parsed.iconDataUrl) item.iconDataUrl = parsed.iconDataUrl;
            if (parsed.seed) item.seed = parsed.seed;
            if (parsed.spawn) item.spawn = parsed.spawn;
            if (parsed.gameMode) item.gameMode = parsed.gameMode;
            if (parsed.difficulty) item.difficulty = parsed.difficulty;
            if (parsed.cheats !== undefined) item.cheats = parsed.cheats;
            if (parsed.mcVersion) item.mcVersion = parsed.mcVersion;
            if (parsed.lastPlayedMs) item.modifiedMs = parsed.lastPlayedMs;
          }
        } catch (e) {
          logger.warn(
            `scanner.exe world scan failed: ${e instanceof Error ? e.message : String(e)}`,
          );
        }

        try {
          const opts = await readMinecraftOptions(content.root);
          items = applyPackEnabledFromOptions(items, opts.entries);
          set({
            optionsPath: opts.path,
            optionsExists: opts.exists,
            optionsEntries: opts.entries,
            activeShaderName:
              normalizeShaderName(
                getOptionValue(opts.entries, "shaderPack"),
              ) || null,
          });
        } catch (e) {
          logger.debug(
            `options.txt load during scan failed: ${e instanceof Error ? e.message : String(e)}`,
          );
        }

        set({
          root: content.root,
          items,
          scanning: false,
          scanned: true,
        });
        logger.info(
          `Scanned local content: ${content.mods.length} mods, ${content.shaderpacks.length} shaders, ${content.resourcepacks.length} resource packs, ${content.datapacks.length} datapacks, ${content.worlds.length} worlds`,
        );
        scheduleChloeInventorySync();
      } catch (e) {
        set({ scanning: false, scanned: true });
        logger.error(
          `Local content scan failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },

    enrich: async (online: boolean) => {
      const { items, enriching } = get();
      if (enriching) return;
      const targets = items.filter(
        (item) => item.kind !== "world" && !item.enriched,
      );
      if (targets.length === 0) return;

      set({ enriching: true });
      const root = cacheRoot();
      let enrichedCount = 0;

      const applyPatch = (id: string, patch: Partial<LibraryContentItem>) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, ...patch } : item,
          ),
        }));
      };

      await mapLimit(targets, 4, async (item) => {
        try {
          const hashes = await hashContentFile(item.path);
          let meta = await cacheGetMeta(root, hashes.sha1);

          if (!meta && online) {
            const version = await getModrinthVersionByFileHash(hashes.sha1);
            if (version) {
              const project = await getModrinthProject(version.project_id);
              meta = {
                matched: true,
                title: project.title,
                description: project.description,
                iconUrl: project.icon_url,
                slug: project.slug,
                projectId: project.id,
                projectType: project.project_type,
                versionNumber: version.version_number,
                fetchedAt: Date.now(),
              };
            } else {
              meta = { matched: false, fetchedAt: Date.now() };
            }
            await cachePutMeta(root, hashes.sha1, meta);
          }

          const patch: Partial<LibraryContentItem> = {
            sha1: hashes.sha1,
            enriched: true,
          };
          if (meta?.matched) {
            patch.title = meta.title;
            patch.description = meta.description;
            patch.versionNumber = meta.versionNumber;
            patch.projectId = meta.projectId;
            patch.slug = meta.slug;
            const icon = await cacheEnsureImage(
              root,
              hashes.sha1,
              online ? meta.iconUrl : null,
            );
            if (icon) patch.iconDataUrl = icon;
            enrichedCount += 1;
          }
          applyPatch(item.id, patch);
        } catch (e) {
          logger.debug(
            `Enrichment failed for ${item.fileName}: ${e instanceof Error ? e.message : String(e)}`,
          );
          applyPatch(item.id, { enriched: true });
        }
      });

      set({ enriching: false });
      if (enrichedCount > 0) {
        logger.success(
          `Enriched ${enrichedCount} item(s) with Modrinth metadata${online ? "" : " (from cache)"}`,
        );
      }
    },

    loadOptions: async (root) => {
      set({ optionsLoading: true });
      try {
        const file = await readMinecraftOptions(root ?? get().root);
        get().applyOptionsFile(file);
        return file;
      } catch (e) {
        logger.warn(
          `Failed to read options.txt: ${e instanceof Error ? e.message : String(e)}`,
        );
        return null;
      } finally {
        set({ optionsLoading: false });
      }
    },

    applyOptionsFile: (file) => {
      const activeShaderName =
        normalizeShaderName(getOptionValue(file.entries, "shaderPack")) || null;
      set((state) => ({
        optionsPath: file.path,
        optionsExists: file.exists,
        optionsEntries: file.entries,
        activeShaderName,
        items: applyPackEnabledFromOptions(state.items, file.entries),
      }));
    },

    setModEnabled: async (id, enabled) => {
      assertContentEditable();
      const item = get().items.find((i) => i.id === id && i.kind === "mod");
      if (!item) throw new Error("Mod not found");
      const result = await setModEnabledNative(item.path, enabled, get().root);
      set((state) => ({
        items: state.items.map((i) => {
          if (i.id !== id) return i;
          return {
            ...i,
            id: `mod:${result.path}`,
            path: result.path,
            fileName: result.fileName,
            enabled: result.enabled,
            name: result.fileName
              .replace(/\.disabled$/i, "")
              .replace(/\.(jar|zip)$/i, ""),
          };
        }),
      }));
      scheduleChloeInventorySync();
    },

    setPackEnabled: async (id, enabled) => {
      assertContentEditable();
      const item = get().items.find(
        (i) => i.id === id && i.kind === "resource-pack",
      );
      if (!item) throw new Error("Resource pack not found");
      const file = await setResourcePackEnabledNative(
        item.fileName,
        enabled,
        get().root,
      );
      get().applyOptionsFile(file);
    },

    setActiveShaderPack: async (fileName) => {
      assertContentEditable();
      const file = await setShaderPackNative(fileName, get().root);
      get().applyOptionsFile(file);
    },

    itemsOfKind: (kind) => get().items.filter((item) => item.kind === kind),
  }),
);
