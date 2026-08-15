import { toast } from "sonner";
import type { GuildBuildRelease } from "../types/buildManifest";
import type { BuildManifest } from "../types/buildManifest";
import {
  DEFAULT_BUILD_CONFIG,
  useBuildStore,
  type BuildInstance,
} from "../stores/build";
import { useSettingsStore } from "../stores/settings";
import {
  ensureBuildInstance,
  startGuildManifestSync,
  type GuildManifestSyncFile,
  type GuildManifestSyncPlan,
} from "./localContent";
import { fetchBuildManifest } from "./guildBuildApi";
import { guildInstanceId } from "./guildInstanceId";
import { listenNativeDownloadProgress } from "./nativeDownloads";
import { logger } from "./logger";

function manifestToSyncFiles(manifest: BuildManifest): GuildManifestSyncFile[] {
  return manifest.files.map((file) => ({
    path: file.path,
    name: file.path.split(/[/\\]/).pop() || file.path,
    url: file.downloads[0] ?? "",
    sizeBytes: file.sizeBytes,
    sha512: file.hashes.sha512,
    environment: file.environment,
  }));
}

function buildManagedInstance(
  release: GuildBuildRelease,
  instanceId: string,
  location: string,
  manifest: BuildManifest,
  syncStatus: BuildInstance["syncStatus"],
): BuildInstance {
  return {
    id: instanceId,
    name: release.name,
    mc: release.dependencies.minecraft,
    loader: release.dependencies.loader,
    java: release.dependencies.java || "—",
    mods: release.content.mods,
    lastPlayed: "Never",
    lastPlayedMs: 0,
    status: syncStatus === "synced" ? "Ready" : "Update",
    accent: "from-primary-dvivd to-primary-muted",
    description: release.summary || `Guild-managed build (${release.guildId}).`,
    tags: ["Guild", release.dependencies.loader, release.dependencies.minecraft],
    heroLandscape:
      "linear-gradient(135deg,#1a1528_0%,#2d3a5c_35%,#1e2838_70%,#0f141c_100%)",
    image: release.image || null,
    created: release.publishedAt,
    version: release.version,
    playtime: "—",
    playtimeMinutes: 0,
    worlds: "0",
    size: "—",
    location,
    versionPath: "",
    screenshots: [],
    notes: "",
    config: { ...DEFAULT_BUILD_CONFIG },
    activeShaderId: null,
    source: "guild",
    managed: true,
    guildId: release.guildId,
    releaseId: release.id,
    buildKey: release.buildId,
    manifestGeneratedAt: manifest.generatedAt,
    syncStatus,
  };
}

async function waitForJob(jobId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      void unlisten.then((fn) => fn());
      if (err) reject(err);
      else resolve();
    };

    const unlisten = listenNativeDownloadProgress((event) => {
      if (event.jobId !== jobId) return;
      if (event.itemId !== "job" && event.phase !== "error" && event.phase !== "cancelled") {
        return;
      }
      if (event.phase === "done" && event.itemId === "job") {
        finish();
        return;
      }
      if (event.phase === "error") {
        finish(new Error(event.error || "Guild sync failed"));
        return;
      }
      if (event.phase === "cancelled") {
        finish(new Error("Guild sync cancelled"));
      }
    });

    void unlisten.catch((e) =>
      finish(e instanceof Error ? e : new Error(String(e))),
    );
  });
}

async function runSyncPlan(
  release: GuildBuildRelease,
  manifest: BuildManifest,
  location: string,
  instanceId: string,
  _quiet = false,
): Promise<void> {
  const downloadsPath = useSettingsStore.getState().settings.downloadsPath;
  const cacheRoot =
    downloadsPath || `${location.replace(/[/\\]+$/, "")}/.cultforge-cache`;

  const excludes = [
    ...new Set([...(manifest.excludes ?? []), ...(release.excludes ?? []), "saves/**"]),
  ];

  const plan: GuildManifestSyncPlan = {
    jobId: "",
    instanceId,
    buildLocation: location,
    cacheRoot,
    loader: release.dependencies.loader,
    releaseId: release.id,
    guildId: release.guildId,
    buildKey: release.buildId,
    name: release.name,
    mc: release.dependencies.minecraft,
    version: release.version,
    java: release.dependencies.java,
    image: release.image || null,
    manifestGeneratedAt: manifest.generatedAt,
    excludes,
    files: manifestToSyncFiles(manifest),
    manifestJson: JSON.stringify(manifest, null, 2),
  };

  useBuildStore.getState().patchBuild(instanceId, {
    syncStatus: "syncing",
    status: "Update",
  });

  const jobId = await startGuildManifestSync(plan);
  await waitForJob(jobId);

  useBuildStore.getState().patchBuild(instanceId, {
    syncStatus: "synced",
    status: "Ready",
    releaseId: release.id,
    version: release.version,
    manifestGeneratedAt: manifest.generatedAt,
  });
}

/** Install or repair a guild release into a managed instance, then activate it. */
export async function installGuildRelease(
  release: GuildBuildRelease,
): Promise<string> {
  const instanceId = guildInstanceId(release.guildId, release.buildId);
  const manifest = await fetchBuildManifest(release.id);

  const ensured = await ensureBuildInstance(
    instanceId,
    release.dependencies.loader,
  );
  if (!ensured?.path) {
    throw new Error("Could not create guild instance folder");
  }

  const build = buildManagedInstance(
    release,
    instanceId,
    ensured.path,
    manifest,
    "syncing",
  );
  useBuildStore.getState().upsertBuild(build);
  useBuildStore.getState().setActive(instanceId);

  try {
    await runSyncPlan(release, manifest, ensured.path, instanceId);
    toast.success(`${release.name} is synced`, {
      description: "Content matches the guild manifest.",
    });
  } catch (e) {
    useBuildStore.getState().patchBuild(instanceId, {
      syncStatus: "error",
      status: "Update",
    });
    throw e;
  }

  return instanceId;
}

/** Re-fetch the release manifest and reconcile a managed local instance. */
export async function syncManagedBuild(
  instanceId: string,
  options: { quiet?: boolean } = {},
): Promise<void> {
  const quiet = options.quiet === true;
  const build = useBuildStore.getState().builds.find((b) => b.id === instanceId);
  if (!build?.managed || !build.releaseId || !build.location) {
    throw new Error("Not a guild-managed build");
  }

  const manifest = await fetchBuildManifest(build.releaseId);
  const releaseLike: GuildBuildRelease = {
    id: build.releaseId,
    buildId: build.buildKey || build.id,
    guildId: build.guildId || "",
    serverId: "",
    name: build.name,
    summary: build.description,
    version: build.version,
    publishedAt: build.created,
    publishedAtIso: build.created,
    image: build.image || "",
    dependencies: {
      minecraft: build.mc,
      loader: build.loader,
      java: build.java === "—" ? "" : build.java,
    },
    sizes: { downloadBytes: 0, installedBytes: 0 },
    content: {
      mods: build.mods,
      resourcePacks: 0,
      shaders: 0,
      configs: 0,
    },
    changelog: [],
    excludes: ["saves/**"],
  };

  try {
    await runSyncPlan(releaseLike, manifest, build.location, instanceId, quiet);
    if (!quiet) {
      toast.success(`${build.name} repaired`, {
        description: "Instance matches the guild manifest again.",
      });
    }
  } catch (e) {
    useBuildStore.getState().patchBuild(instanceId, {
      syncStatus: "error",
      status: "Update",
    });
    throw e;
  }
}

/** Best-effort sync for all managed builds when online (boot / focus). */
export async function syncAllManagedBuilds(online: boolean): Promise<void> {
  if (!online) {
    const managed = useBuildStore.getState().builds.filter((b) => b.managed);
    for (const build of managed) {
      if (build.syncStatus === "synced") continue;
      useBuildStore.getState().patchBuild(build.id, {
        syncStatus: build.syncStatus === "unknown" ? "drift" : build.syncStatus,
        status: "Update",
      });
    }
    return;
  }

  const managed = useBuildStore
    .getState()
    .builds.filter((b) => b.managed && b.releaseId);
  for (const build of managed) {
    try {
      await syncManagedBuild(build.id, { quiet: true });
    } catch (e) {
      logger.warn(
        `Managed sync skipped for ${build.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
      useBuildStore.getState().patchBuild(build.id, {
        syncStatus: "drift",
        status: "Update",
      });
    }
  }
}
