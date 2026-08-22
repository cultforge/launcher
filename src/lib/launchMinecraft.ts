import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import type { BuildInstance } from "../stores/build";
import { useLaunchStore } from "../stores/launch";
import { useLogConsoleUiStore } from "../stores/logConsoleUi";
import { useSettingsStore } from "../stores/settings";
import { useAppStore } from "../userstore";
import { snapshotInstanceContent } from "./crashReport";
import { canLaunchBuild } from "./launchGate";
import {
  enterLaunchIdleMode,
  rememberLaunchContext,
} from "./launchLifecycle";
import { logger } from "./logger";
import {
  ensureBuildInstance,
  getMinecraftRoot,
  listLocalBuilds,
} from "./localContent";
import { formatPlaytime, touchBuildLastPlayed } from "./buildMeta";
import { useBuildStore } from "../stores/build";
import { ensureJavaForBuild, javaMajorFromBuild } from "./javaRuntime";
import {
  ensureRuntimeVersionId,
  loaderLabel,
  normalizeLoaderKind,
} from "./loaderInstall";
import { resolveServersForBuild } from "./resolveServersForBuild";
import { useGuildStore } from "../stores/guilds";
import { usePersonalServersStore } from "../stores/personalServers";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export type LaunchStatus = {
  running: boolean;
  buildId: string | null;
  pid: number | null;
  startedMs: number | null;
  gameDir?: string | null;
};

export type LaunchMinecraftNativeArgs = {
  versionId: string;
  gameDir: string;
  buildId: string;
  minecraftRoot?: string | null;
  javaHint?: string | null;
  memoryMinMb?: number | null;
  memoryMaxMb?: number | null;
  jvmArgs?: string | null;
  playerName: string;
  fullscreen?: boolean | null;
  width?: number | null;
  height?: number | null;
  dedicatedGpu?: boolean | null;
  wrapper?: string | null;
  serverList?: Array<{ name: string; ip: string }> | null;
};

function basenamePath(path: string): string {
  const norm = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const idx = norm.lastIndexOf("/");
  return idx >= 0 ? norm.slice(idx + 1) : norm;
}

/** Prefer CultForge handle (@title) then display name for offline session. */
export function offlinePlayerNameFromProfile(): string {
  const user = useAppStore.getState().currentUser;
  const title = user?.title?.trim() ?? "";
  const handle = title.startsWith("@")
    ? title.replace(/^@/, "").trim()
    : "";
  const name = user?.name?.trim();
  const raw = handle || name || "Player";
  const cleaned = raw.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 16);
  if (cleaned.length >= 3) return cleaned;
  if (cleaned.length > 0) return (cleaned + "Player").slice(0, 16);
  return "Player";
}

export function parseResolution(
  value: string | undefined,
): { width?: number; height?: number } {
  if (!value?.trim()) return {};
  const m = value.trim().match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (!m) return {};
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return {};
  return { width, height };
}

export async function resolveMinecraftVersionId(
  build: BuildInstance,
): Promise<string | null> {
  if (build.versionPath?.trim()) {
    const id = basenamePath(build.versionPath.trim());
    if (id) return id;
  }
  if (build.source === "local" && build.id && build.id !== "none") {
    return build.id;
  }

  const wantLoader = normalizeLoaderKind(build.loader);
  const mc = (build.mc || "").trim();
  const candidates = [build.version, build.mc]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s && s !== "—"));

  if (candidates.length === 0 && !mc) return null;

  try {
    const locals = await listLocalBuilds();

    // Prefer an installed profile that matches both MC + loader (Forge ≠ vanilla).
    if (mc) {
      const loaderHits = locals
        .filter((b) => {
          const loader = (b.loader || "").toLowerCase();
          const matchesLoader =
            wantLoader === "vanilla"
              ? !loader.includes("forge") &&
                !loader.includes("fabric") &&
                !loader.includes("quilt")
              : wantLoader === "neoforge"
                ? loader.includes("neoforge")
                : wantLoader === "forge"
                  ? loader.includes("forge") && !loader.includes("neoforge")
                  : loader.includes(wantLoader);
          const matchesMc =
            b.mc === mc ||
            b.id === mc ||
            b.id.startsWith(`${mc}-`) ||
            b.id.includes(`-${mc}-`);
          return matchesLoader && matchesMc;
        })
        .sort((a, b) => (b.modifiedMs ?? 0) - (a.modifiedMs ?? 0));
      if (loaderHits[0]) return loaderHits[0].id;
    }

    for (const want of candidates) {
      const exact = locals.find((b) => b.id === want);
      if (exact) return exact.id;
    }
    for (const want of candidates) {
      const byMc = locals.find(
        (b) => b.mc === want || b.id === want || b.id.endsWith(`-${want}`),
      );
      if (byMc) return byMc.id;
    }
  } catch {
    // Fall through
  }

  return mc || candidates[0] || null;
}

export async function getLaunchStatus(): Promise<LaunchStatus> {
  if (!isTauri()) {
    return { running: false, buildId: null, pid: null, startedMs: null };
  }
  return invoke<LaunchStatus>("get_launch_status");
}

export async function stopMinecraft(): Promise<void> {
  if (!isTauri()) return;
  const { markIntentionalMinecraftStop } = await import("./launchLifecycle");
  markIntentionalMinecraftStop();
  await invoke("stop_minecraft");
  useLaunchStore.getState().clearRunning();
}

function launchErrorMessage(err: unknown): string {
  if (typeof err === "string" && err.trim()) return err;
  if (err instanceof Error && err.message.trim()) return err.message;
  return "Failed to launch Minecraft.";
}

export async function launchMinecraft(build: BuildInstance): Promise<boolean> {
  const gate = canLaunchBuild(build);
  if (!gate.ok) {
    toast.message("Cannot launch yet", { description: gate.reason });
    return false;
  }

  if (!isTauri()) {
    toast.error("Launch requires the CultForge desktop app");
    return false;
  }

  if (build.id === "none") {
    toast.message("No build selected", {
      description: "Install a Minecraft version under .minecraft/versions first.",
    });
    return false;
  }

  const launchStore = useLaunchStore.getState();
  if (launchStore.starting) {
    toast.message("Launch already in progress");
    return false;
  }

  try {
    const status = await getLaunchStatus();
    if (status.running) {
      toast.message("Minecraft is already running", {
        description: status.buildId
          ? `Stop the current session before launching another build.`
          : undefined,
      });
      return false;
    }
  } catch {
    // continue
  }

  const loaderKind = normalizeLoaderKind(build.loader);
  let versionId: string | null = null;
  try {
    // If we already resolved a versionPath for this build, try it directly
    // instead of re-scanning all local builds every launch.
    if (build.versionPath?.trim()) {
      const cached = build.versionPath.replace(/\\/g, "/").replace(/\/+$/, "").split("/").pop();
      if (cached) versionId = cached;
    }

    if (!versionId) {
      if (loaderKind !== "vanilla" || build.managed) {
        if (loaderKind !== "vanilla") {
          toast.message(`Preparing ${loaderLabel(loaderKind)}…`, {
            description: `Minecraft ${build.mc} · ${loaderLabel(loaderKind)}`,
          });
        }
        versionId = await ensureRuntimeVersionId(build);
      } else {
        versionId = await resolveMinecraftVersionId(build);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    toast.error("Could not prepare Minecraft runtime", {
      description: message,
    });
    return false;
  }
  if (!versionId) {
    toast.error("No Minecraft version linked", {
      description:
        "Add this version from Mojang (Builds → Add), or install it under .minecraft/versions.",
    });
    return false;
  }

  launchStore.setStarting(true, build.id);
  logger.info(`Launch requested: ${build.name} (${versionId})`);

  try {
    // Guild-managed: level-1 manifest sync (mods + resource packs). If already
    // matching locally → play immediately. Otherwise download only what's missing.
    if (build.managed && build.releaseId) {
      logger.info(`Level-1 play sync for guild build: ${build.releaseId}`);
      try {
        const { ensureGuildPlayReady } = await import("./guildBuildSync");
        await ensureGuildPlayReady(build.id);
      } catch (syncErr) {
        const msg =
          syncErr instanceof Error ? syncErr.message : String(syncErr);
        logger.warn(`Level-1 play sync failed: ${msg}`);
        toast.error("Build not ready to play", {
          description: msg,
        });
        return false;
      }
    }

    const ensured = await ensureBuildInstance(build.id, build.loader);
    const gameDir = (ensured?.path || build.location || "").trim();
    if (!gameDir) {
      throw new Error("Could not prepare the CultForge instance folder.");
    }

    const snapshot = await snapshotInstanceContent(gameDir);
    rememberLaunchContext({ versionId, gameDir, snapshot });
    logger.debug(
      `Content snapshot: ${snapshot.mods.length} mods, ${snapshot.resourcepacks.length} resource packs, ${snapshot.shaderpacks.length} shaders, ${snapshot.datapacks.length} datapacks`,
    );

    const settings = useSettingsStore.getState().settings;
    const cfg = build.config;
    const { width, height } = parseResolution(cfg.resolution);
    const javaHint =
      build.java !== "—" && build.java.trim()
        ? build.java
        : settings.javaDefault;
    const javaMajor = javaMajorFromBuild(build, settings.javaDefault);
    logger.info(`Ensuring Java ${javaMajor} for ${build.name}`);
    const runtime = await ensureJavaForBuild(build, settings.javaDefault);
    logger.info(
      `Using Java ${runtime.major ?? javaMajor} (${runtime.source}) · ${runtime.path}`,
    );

    const memoryMinMb = Math.round((cfg.memoryMinGb || 4) * 1024);
    const memoryMaxMb = Math.round((cfg.memoryMaxGb || 8) * 1024);

    let minecraftRoot: string | undefined;
    try {
      minecraftRoot = await getMinecraftRoot();
    } catch {
      minecraftRoot = undefined;
    }

    const playerName = offlinePlayerNameFromProfile();
    const guildServers = useGuildStore.getState().servers;
    const personalServers = usePersonalServersStore.getState().servers;
    const serverList = resolveServersForBuild(
      build,
      guildServers,
      personalServers,
    );
    if (serverList.length) {
      logger.info(
        `Writing servers.dat (${serverList.length}): ${serverList
          .map((s) => s.ip)
          .join(", ")}`,
      );
    }
    const args: LaunchMinecraftNativeArgs = {
      versionId,
      gameDir,
      buildId: build.id,
      minecraftRoot: minecraftRoot || null,
      javaHint: String(runtime.major ?? javaMajor ?? javaHint ?? ""),
      memoryMinMb,
      memoryMaxMb,
      jvmArgs: cfg.jvmArgs || null,
      playerName,
      fullscreen: cfg.fullscreen,
      width: width ?? null,
      height: height ?? null,
      dedicatedGpu: cfg.dedicatedGpu,
      wrapper: cfg.wrapper?.trim() || null,
      serverList: serverList.length ? serverList : null,
    };

    const result = await invoke<LaunchStatus>("launch_minecraft", { args });
    useLaunchStore.getState().setRunning(build.id, result.pid ?? null, {
      gameDir,
      startedMs: result.startedMs ?? Date.now(),
    });

    void touchBuildLastPlayed(build.id)
      .then((meta) => {
        useBuildStore.getState().patchBuild(build.id, {
          lastPlayed: "Today",
          lastPlayedMs: meta?.lastPlayedMs || Date.now(),
          ...(meta
            ? {
                playtimeMinutes: meta.playtimeMinutes,
                playtime: formatPlaytime(meta.playtimeMinutes),
              }
            : {}),
        });
        void import("./client").then(({ getClientOrigin, sidecarFetch }) =>
          getClientOrigin().then((origin) =>
            sidecarFetch(`${origin}/chloe/last-played`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                build_id: build.id,
                build_name: build.name,
                build: build.name,
                label: build.name,
                at: new Date().toISOString(),
              }),
            }).catch(() => undefined),
          ),
        );
      })
      .catch(() => {
        useBuildStore.getState().patchBuild(build.id, {
          lastPlayed: "Today",
          lastPlayedMs: Date.now(),
        });
      });

    logger.success(
      `Minecraft started pid=${result.pid ?? "?"} as ${playerName} · ${versionId}`,
    );

    toast.success(`Launching ${build.name}`, {
      description: `Offline as ${playerName} · ${versionId}`,
    });

    await enterLaunchIdleMode();

    const draft = useSettingsStore.getState().draft;
    const toTray =
      cfg.closeOnLaunch || settings.closeOnLaunch || draft.closeOnLaunch;
    if (toTray) {
      try {
        await invoke("minimize_to_tray");
        logger.info("Minimized CultForge to system tray (idle while game runs)");
      } catch (err) {
        logger.warn(
          `Tray minimize failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return true;
  } catch (err) {
    useLaunchStore.getState().clearRunning();
    const message = launchErrorMessage(err);
    logger.error(`Launch failed: ${message}`);
    useLogConsoleUiStore.getState().setOpen(true);
    toast.error("Launch failed", { description: message });
    return false;
  } finally {
    useLaunchStore.getState().setStarting(false);
  }
}
