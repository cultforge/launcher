import { create } from "zustand";
import type {
  UpdateFilter,
  UpdateHistoryItem,
  UpdateItem,
} from "../data/updates";
import { getModrinthVersions, resolveModrinthInstallPlan } from "../lib/modrinth";
import { fetchGlobalHotUpdates } from "../lib/guildHotUpdatesApi";
import {
  checkLauncherUpdate,
  installLauncherUpdate,
  type LauncherUpdateInfo,
} from "../lib/launcherUpdater";
import { logger } from "../lib/logger";
import { startModrinthInstall } from "../lib/nativeDownloads";
import { useDownloadStore } from "../typlibs";
import { useLibraryContentStore } from "./libraryContent";
import { useBuildStore } from "./build";
import { useSettingsStore } from "./settings";
import { toast } from "sonner";

function sizeLabel(sizeMb: number): string {
  if (sizeMb >= 1024) return `${(sizeMb / 1024).toFixed(1)} GB`;
  return `${sizeMb.toFixed(sizeMb < 10 ? 1 : 0)} MB`;
}

type UpdatesStore = {
  filter: UpdateFilter;
  setFilter: (filter: UpdateFilter) => void;
  lastChecked: string;
  items: UpdateItem[];
  history: UpdateHistoryItem[];
  checking: boolean;
  checked: boolean;
  /** Active Tauri updater handle for install (not serializable). */
  pendingLauncher: LauncherUpdateInfo | null;
  check: (online: boolean) => Promise<void>;
  applyItem: (id: string) => Promise<void>;
  applyPendingMods: () => Promise<void>;
};

export const useUpdatesStore = create<UpdatesStore>((set, get) => ({
  filter: "All",
  setFilter: (filter) => set({ filter }),
  lastChecked: "Never",
  items: [],
  history: [],
  checking: false,
  checked: false,
  pendingLauncher: null,

  check: async (online: boolean) => {
    if (get().checking) return;
    if (!online) {
      set({ checked: true });
      return;
    }
    set({ checking: true, pendingLauncher: null });

    const found: UpdateItem[] = [];
    let pendingLauncher: LauncherUpdateInfo | null = null;

    try {
      const launcher = await checkLauncherUpdate();
      if (launcher) {
        pendingLauncher = launcher;
        found.push({
          id: `launcher:${launcher.availableVersion}`,
          name: "CultForge launcher",
          from: launcher.currentVersion,
          to: launcher.availableVersion,
          kind: "launcher",
          size: "—",
          sizeMb: 0,
          changelog: launcher.notes.slice(0, 200),
          status: "pending",
        });
      }
    } catch (err) {
      logger.warn(
        `Launcher updater check failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    try {
      const hot = await fetchGlobalHotUpdates();
      for (const row of hot) {
        if (!row.isPublished) continue;
        found.push({
          id: `hot:${row.id}`,
          name: row.title,
          from: row.channel,
          to: row.severity,
          kind: "launcher",
          size: "—",
          sizeMb: 0,
          changelog: row.body.slice(0, 160),
          status: "pending",
        });
      }
    } catch (err) {
      logger.warn(
        `Hot updates fetch failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    const matched = useLibraryContentStore
      .getState()
      .items.filter(
        (item) =>
          item.kind !== "world" && item.projectId && item.versionNumber,
      )
      .slice(0, 40);

    for (const item of matched) {
      try {
        const versions = await getModrinthVersions(item.projectId as string);
        const latest = versions[0];
        if (!latest) continue;
        if (latest.version_number !== item.versionNumber) {
          found.push({
            id: `up:${item.id}`,
            name: item.title ?? item.name,
            from: item.versionNumber as string,
            to: latest.version_number,
            kind: item.kind === "shader" ? "mod" : item.kind === "resource-pack" ? "mod" : "mod",
            size: sizeLabel(item.sizeMb),
            sizeMb: item.sizeMb,
            changelog:
              latest.changelog?.split("\n")[0] ??
              "New version available on Modrinth.",
            status: "pending",
            projectId: item.projectId,
            projectType:
              item.kind === "shader"
                ? "shader"
                : item.kind === "resource-pack"
                  ? "resourcepack"
                  : "mod",
            libraryItemId: item.id,
          });
        }
      } catch {
        // skip
      }
    }

    set({
      items: found,
      pendingLauncher,
      checking: false,
      checked: true,
      lastChecked: new Date().toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }),
    });
    logger.info(
      found.length > 0
        ? `Updates check: ${found.length} update(s) available`
        : "Updates check: everything is up to date",
    );
  },

  applyItem: async (id) => {
    const item = get().items.find((u) => u.id === id);
    if (!item) return;

    if (id.startsWith("launcher:")) {
      const pending = get().pendingLauncher;
      if (!pending || `launcher:${pending.availableVersion}` !== id) {
        toast.error("Launcher update expired — check again");
        return;
      }
      set({
        items: get().items.map((u) =>
          u.id === id ? { ...u, status: "updating" } : u,
        ),
      });
      try {
        toast.message("Installing launcher update…", {
          description: `${pending.currentVersion} → ${pending.availableVersion}`,
        });
        await installLauncherUpdate(pending.update);
      } catch (err) {
        set({
          items: get().items.map((u) =>
            u.id === id ? { ...u, status: "pending" } : u,
          ),
        });
        toast.error(
          err instanceof Error ? err.message : "Launcher update failed",
        );
      }
      return;
    }

    if (item.kind === "launcher" || item.kind !== "mod" || !item.projectId) {
      toast.message("Launcher notes only", {
        description:
          "This is an announcement — Discord/UI layout fixes ship as a full launcher update.",
      });
      return;
    }
    const build = useBuildStore.getState().active();
    if (!build.location) {
      toast.error("No build selected to install into");
      return;
    }
    set({
      items: get().items.map((u) =>
        u.id === id ? { ...u, status: "updating" } : u,
      ),
    });
    try {
      const cacheRoot = useSettingsStore.getState().settings.downloadsPath;
      const plan = await resolveModrinthInstallPlan({
        projectId: item.projectId,
        buildId: build.id,
        buildLocation: build.location,
        cacheRoot,
        gameVersion: build.mc !== "—" ? build.mc : undefined,
        loader: build.loader !== "—" ? build.loader : undefined,
        projectType: item.projectType,
      });
      useDownloadStore.getState().enqueue({
        id: plan.jobId,
        jobId: plan.jobId,
        name: item.name,
        totalMb: item.sizeMb,
        totalBytes: Math.round(item.sizeMb * 1024 * 1024),
        downloadedBytes: 0,
        doneMb: 0,
        progress: 0,
        status: "queued",
        phase: "queued",
      });
      await startModrinthInstall(plan);
      set({
        items: get().items.map((u) =>
          u.id === id ? { ...u, status: "done" } : u,
        ),
        history: [
          {
            id: item.id,
            name: item.name,
            kind: item.kind,
            to: item.to,
            when: new Date().toLocaleTimeString(),
          },
          ...get().history,
        ],
      });
      toast.success(`Updating ${item.name}`);
    } catch (err) {
      set({
        items: get().items.map((u) =>
          u.id === id ? { ...u, status: "pending" } : u,
        ),
      });
      toast.error(
        err instanceof Error ? err.message : "Could not start update",
      );
    }
  },

  applyPendingMods: async () => {
    const pending = get().items.filter(
      (u) => u.kind === "mod" && u.status === "pending" && u.projectId,
    );
    for (const item of pending) {
      await get().applyItem(item.id);
    }
  },
}));
