import { toast } from "sonner";
import type { GuildBuildRelease } from "../types/buildManifest";
import type { BuildManifest } from "../types/buildManifest";
import {
  DEFAULT_BUILD_CONFIG,
  useBuildStore,
  type BuildInstance,
} from "../stores/build";
import { useSettingsStore } from "../stores/settings";
import { useLibraryContentStore } from "../stores/libraryContent";
import {
  ensureBuildInstance,
  startGuildManifestSync,
  checkGuildManifestSync,
  markGuildInstanceSynced,
  type GuildManifestSyncFile,
  type GuildManifestSyncPlan,
  type GuildSyncCheckResult,
} from "./localContent";
import { fetchGuildBuildRelease, resolveGuildInstallManifest } from "./guildBuildApi";
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

async function rescanLibrary(location: string | undefined | null) {
  const path = location?.trim();
  if (!path) return;
  try {
    await useLibraryContentStore.getState().scan(path);
    const items = useLibraryContentStore.getState().items;
    useBuildStore.getState().applyContentStats({
      mods: items.filter((i) => i.kind === "mod").length,
      worlds: items.filter((i) => i.kind === "world").length,
    });
  } catch (err) {
    logger.warn(
      `Library rescan after sync failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function fetchBytesForPaths(
  files: GuildManifestSyncFile[],
  paths: string[],
  syncMode: "play" | "full",
): number {
  const want = new Set(paths.map((p) => p.replace(/\\/g, "/").toLowerCase()));
  return files
    .filter((file) => {
      const path = file.path.replace(/\\/g, "/").toLowerCase();
      if (syncMode === "play") {
        if (
          !path.startsWith("mods/") &&
          !path.startsWith("resourcepacks/") &&
          !path.startsWith("datapacks/")
        ) {
          return false;
        }
      }
      return want.has(path);
    })
    .reduce((sum, file) => sum + (Number(file.sizeBytes) || 0), 0);
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
      // Only settle on job-level terminal events so parallel file work can finish
      // reporting without racing the waiter.
      if (event.itemId !== "job") return;
      if (event.phase === "done") {
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
  opts: {
    quiet?: boolean;
    force?: boolean;
    syncMode?: "play" | "full";
    onJob?: (jobId: string) => void;
  } = {},
): Promise<string> {
  const syncMode = opts.syncMode ?? "full";
  const downloadsPath = useSettingsStore.getState().settings.downloadsPath;
  const cacheRoot =
    downloadsPath || `${location.replace(/[/\\]+$/, "")}/.cultforge-cache`;

  const excludes = [
    ...new Set([...(manifest.excludes ?? []), ...(release.excludes ?? []), "saves/**"]),
  ];

  const files = manifestToSyncFiles(manifest);

  let onlyPaths: string[] | null = null;
  let priorCheck: GuildSyncCheckResult | null = null;

  // Fast path: already on disk and matching — do not start a download job.
  if (!opts.force) {
    try {
      const check = await checkGuildManifestSync(
        location,
        files,
        excludes,
        syncMode,
      );
      priorCheck = check;
      if (check.synced) {
        const syncedPlan: GuildManifestSyncPlan = {
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
          files,
          manifestJson: JSON.stringify(manifest, null, 2),
          syncMode,
        };
        try {
          await markGuildInstanceSynced(syncedPlan);
        } catch (err) {
          logger.warn(
            `Could not persist synced meta: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        useBuildStore.getState().patchBuild(instanceId, {
          syncStatus: "synced",
          status: "Ready",
          releaseId: release.id,
          buildKey: release.buildId,
          version: release.version,
          manifestGeneratedAt: manifest.generatedAt,
        });
        await rescanLibrary(location);
        return "";
      }
      onlyPaths = [...check.missing, ...check.mismatched];
      if (check.extras.length && !opts.quiet) {
        toast.message("Removing files not in guild manifest…", {
          description: `${check.extras.length} extra file${check.extras.length === 1 ? "" : "s"} will be pruned.`,
        });
      }
      if (syncMode === "play") {
        logger.info(
          `Level-1 play sync: ${check.missing.length} missing, ${check.mismatched.length} mismatched, ${check.extras.length} extras`,
        );
      }
    } catch (err) {
      logger.warn(
        `Guild sync check failed; continuing with sync (${err instanceof Error ? err.message : String(err)})`,
      );
    }
  }

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
    files,
    manifestJson: JSON.stringify(manifest, null, 2),
    syncMode,
    onlyPaths,
  };

  useBuildStore.getState().patchBuild(instanceId, {
    syncStatus: "syncing",
    status: "Update",
  });

  const totalBytes =
    onlyPaths != null
      ? fetchBytesForPaths(files, onlyPaths, syncMode)
      : priorCheck
        ? fetchBytesForPaths(
            files,
            [...priorCheck.missing, ...priorCheck.mismatched],
            syncMode,
          )
        : files
            .filter((file) => {
              if (syncMode !== "play") return true;
              const path = file.path.replace(/\\/g, "/").toLowerCase();
              return (
                path.startsWith("mods/") ||
                path.startsWith("resourcepacks/") ||
                path.startsWith("datapacks/")
              );
            })
            .reduce((sum, file) => sum + (Number(file.sizeBytes) || 0), 0);

  const jobId = await startGuildManifestSync(plan);
  opts.onJob?.(jobId);

  // Seed Downloads queue so Guild Builds + dock show live progress immediately.
  const { useDownloadStore } = await import("../typlibs");
  useDownloadStore.getState().enqueue({
    id: jobId,
    jobId,
    name: release.name,
    totalMb: totalBytes / (1024 * 1024),
    totalBytes: Math.max(totalBytes, 1),
    doneMb: 0,
    progress: 0,
    status: "active",
    phase: totalBytes > 0 ? "checking" : "installing",
  });

  await waitForJob(jobId);

  // Verify disk matches the manifest — incomplete first installs used to mark
  // "synced" while mods were still missing.
  try {
    const verify = await checkGuildManifestSync(
      location,
      files,
      excludes,
      syncMode,
    );
    if (!verify.synced) {
      const remaining = [...verify.missing, ...verify.mismatched];
      if (remaining.length > 0) {
        logger.warn(
          `Guild sync incomplete (${remaining.length} files) — retrying remaining`,
        );
        if (!opts.quiet) {
          toast.message("Finishing install…", {
            description: `${remaining.length} file${remaining.length === 1 ? "" : "s"} still needed.`,
          });
        }
        const retryPlan: GuildManifestSyncPlan = {
          ...plan,
          jobId: "",
          onlyPaths: remaining,
        };
        const retryJobId = await startGuildManifestSync(retryPlan);
        opts.onJob?.(retryJobId);
        useDownloadStore.getState().enqueue({
          id: retryJobId,
          jobId: retryJobId,
          name: `${release.name} (repair)`,
          totalMb:
            fetchBytesForPaths(files, remaining, syncMode) / (1024 * 1024),
          totalBytes: Math.max(
            fetchBytesForPaths(files, remaining, syncMode),
            1,
          ),
          doneMb: 0,
          progress: 0,
          status: "active",
          phase: "downloading",
        });
        await waitForJob(retryJobId);
        const verify2 = await checkGuildManifestSync(
          location,
          files,
          excludes,
          syncMode,
        );
        if (!verify2.synced) {
          const still = verify2.missing.length + verify2.mismatched.length;
          throw new Error(
            `Guild install incomplete — ${still} file${still === 1 ? "" : "s"} still missing after retry`,
          );
        }
      }
    }
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.startsWith("Guild install incomplete")
    ) {
      throw err;
    }
    logger.warn(
      `Guild sync verify failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  useBuildStore.getState().patchBuild(instanceId, {
    syncStatus: "synced",
    status: "Ready",
    releaseId: release.id,
    buildKey: release.buildId,
    version: release.version,
    manifestGeneratedAt: manifest.generatedAt,
  });

  await rescanLibrary(location);

  return jobId;
}

/** Force a full reinstall/repair of a guild-managed local instance. */
export async function reinstallGuildBuild(instanceId: string): Promise<void> {
  await syncManagedBuild(instanceId, { force: true, quiet: false });
}

/**
 * Level-1 play gate: compare local instance to the guild manifest (mods +
 * resource packs, including deps). Shaders are not strict. If anything required
 * is missing/mismatched, download only those files — then the build is playable.
 */
export async function ensureGuildPlayReady(instanceId: string): Promise<void> {
  const build = useBuildStore.getState().builds.find((b) => b.id === instanceId);
  if (!build?.managed || !build.releaseId || !build.location) {
    return;
  }

  // Fast path: already synced to same release — skip manifest hash check entirely.
  let releaseLike: GuildBuildRelease = {
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

  if (build.guildId && build.releaseId && navigator.onLine) {
    try {
      releaseLike = await fetchGuildBuildRelease(build.guildId, build.releaseId);
    } catch (err) {
      logger.warn(
        `Play sync: catalog refresh failed, using cached release (${err instanceof Error ? err.message : String(err)})`,
      );
    }
  }

  // If the local build is already synced to this exact release+version, skip
  // the expensive disk hash check — just play.
  if (
    build.syncStatus === "synced" &&
    build.releaseId === releaseLike.id &&
    (!releaseLike.version || build.version === releaseLike.version)
  ) {
    return;
  }

  const manifest = await resolveGuildInstallManifest(releaseLike);
  const excludes = [
    ...new Set([
      ...(manifest.excludes ?? []),
      ...(releaseLike.excludes ?? []),
      "saves/**",
    ]),
  ];
  const files = manifestToSyncFiles(manifest);

  const check = await checkGuildManifestSync(
    build.location,
    files,
    excludes,
    "play",
  );

  if (check.synced) {
    useBuildStore.getState().patchBuild(instanceId, {
      syncStatus: "synced",
      status: "Ready",
      releaseId: releaseLike.id,
      buildKey: releaseLike.buildId,
      version: releaseLike.version,
      manifestGeneratedAt: manifest.generatedAt,
    });
    return;
  }

  const need = check.missing.length + check.mismatched.length;
  if (need === 0 && check.extras.length > 0) {
    // Only extras differ — don't block launch to remove them. Mark synced and
    // let a background full-sync prune later.
    logger.info(
      `Play sync: ${check.extras.length} extras but no missing files — launching without pruning`,
    );
    useBuildStore.getState().patchBuild(instanceId, {
      syncStatus: "synced",
      status: "Ready",
      releaseId: releaseLike.id,
      buildKey: releaseLike.buildId,
      version: releaseLike.version,
      manifestGeneratedAt: manifest.generatedAt,
    });
    return;
  }

  toast.message("Updating build files…", {
    description: `Downloading ${need} missing or changed file${need === 1 ? "" : "s"}.`,
  });

  await runSyncPlan(releaseLike, manifest, build.location, instanceId, {
    quiet: true,
    syncMode: "play",
  });
}

/** Install or repair a guild release into a managed instance, then activate it. */
export async function installGuildRelease(
  release: GuildBuildRelease,
  opts?: { onJob?: (jobId: string) => void },
): Promise<string> {
  const instanceId = guildInstanceId(release.guildId, release.buildId);

  // Prefer a fresh catalog row from guilds.cultforge.com (source of truth).
  let catalog = release;
  try {
    catalog = await fetchGuildBuildRelease(release.guildId, release.id);
  } catch (err) {
    logger.warn(
      `Guild install: using in-memory catalog row (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  const manifest = await resolveGuildInstallManifest(catalog);

  const ensured = await ensureBuildInstance(
    instanceId,
    catalog.dependencies.loader,
  );
  if (!ensured?.path) {
    throw new Error("Could not create guild instance folder");
  }

  const build = buildManagedInstance(
    catalog,
    instanceId,
    ensured.path,
    manifest,
    "syncing",
  );
  useBuildStore.getState().upsertBuild(build);
  useBuildStore.getState().setActive(instanceId);

  try {
    await runSyncPlan(catalog, manifest, ensured.path, instanceId, {
      onJob: opts?.onJob,
    });

    // Install Forge/Fabric/etc. so Play does not fall back to vanilla MC.
    try {
      const { ensureRuntimeVersionId } = await import("./loaderInstall");
      const ready = useBuildStore.getState().builds.find((b) => b.id === instanceId);
      if (ready) {
        const versionId = await ensureRuntimeVersionId(ready);
        logger.info(`Guild install runtime ready: ${versionId}`);
      }
    } catch (loaderErr) {
      logger.warn(
        `Guild install: loader ensure deferred (${loaderErr instanceof Error ? loaderErr.message : String(loaderErr)})`,
      );
    }

    toast.success(`${catalog.name} is synced`, {
      description: `Installed ${manifest.files.length} files from the guild catalog.`,
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

/** Re-fetch the release catalog + install plan and reconcile a managed local instance. */
export async function syncManagedBuild(
  instanceId: string,
  options: {
    quiet?: boolean;
    force?: boolean;
    onJob?: (jobId: string) => void;
  } = {},
): Promise<void> {
  const quiet = options.quiet === true;
  const force = options.force === true;
  const build = useBuildStore.getState().builds.find((b) => b.id === instanceId);
  if (!build?.managed || !build.releaseId || !build.location) {
    throw new Error("Not a guild-managed build");
  }

  // Quiet background passes must not re-download a healthy install.
  if (!force && quiet && build.syncStatus === "synced") {
    return;
  }

  let releaseLike: GuildBuildRelease = {
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

  if (build.guildId && build.releaseId) {
    try {
      releaseLike = await fetchGuildBuildRelease(build.guildId, build.releaseId);
    } catch (err) {
      logger.warn(
        `Managed sync: catalog refresh failed for ${build.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Same published release + already synced → skip unless the user forced repair.
  if (
    !force &&
    quiet &&
    build.syncStatus === "synced" &&
    build.releaseId === releaseLike.id &&
    (!build.version || !releaseLike.version || build.version === releaseLike.version)
  ) {
    return;
  }

  const manifest = await resolveGuildInstallManifest(releaseLike);

  try {
    useBuildStore.getState().patchBuild(instanceId, { syncStatus: "syncing" });
    await runSyncPlan(releaseLike, manifest, build.location, instanceId, {
      quiet,
      force,
      onJob: options.onJob,
    });
    if (!quiet) {
      toast.success(`${build.name} repaired`, {
        description: "Instance matches the guild catalog again.",
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
    // Leave healthy installs alone on boot — only repair drifted/errored/unknown.
    if (build.syncStatus === "synced") continue;
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
