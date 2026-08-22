import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useBuildStore } from "../stores/build";
import { useLaunchStore } from "../stores/launch";
import { useLogConsoleUiStore } from "../stores/logConsoleUi";
import { useLobbyMusicStore } from "../stores/lobbyMusic";
import { useSystemMetricsStore } from "../stores/systemMetrics";
import { logger } from "./logger";
import {
  generateCrashReport,
  isCrashExit,
  pushLaunchLogTail,
  readInstanceLogTail,
  type ContentSnapshot,
} from "./crashReport";
import { useAppStore } from "../userstore";
import { addBuildPlaytimeMinutes, formatPlaytime } from "./buildMeta";

export type MinecraftExitPayload = {
  buildId: string;
  gameDir: string;
  startedMs: number;
  exitCode: number | null;
  killed: boolean;
};

let started = false;
let pollTimer: number | null = null;
let unlistenExit: UnlistenFn | null = null;
let handlingExit = false;
/** Set when launcher intentionally stops MC (tray quit / stop). */
let intentionalStop = false;

/** Content snapshot captured at last successful launch (for crash reports). */
let lastSnapshot: ContentSnapshot | null = null;
let lastVersionId: string | null = null;
let lastGameDir: string | null = null;
let idleActive = false;

function playerNameFallback(): string {
  const user = useAppStore.getState().currentUser;
  const title = user?.title?.trim() ?? "";
  const handle = title.startsWith("@") ? title.replace(/^@/, "").trim() : "";
  const name = user?.name?.trim();
  const raw = handle || name || "Player";
  const cleaned = raw.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 16);
  return cleaned.length >= 3 ? cleaned : cleaned || "Player";
}

export function rememberLaunchContext(opts: {
  versionId: string;
  gameDir: string;
  snapshot: ContentSnapshot;
}) {
  lastVersionId = opts.versionId;
  lastGameDir = opts.gameDir;
  lastSnapshot = opts.snapshot;
  intentionalStop = false;
}

export function markIntentionalMinecraftStop() {
  intentionalStop = true;
}

export async function enterLaunchIdleMode(): Promise<void> {
  if (idleActive) return;
  idleActive = true;
  try {
    useLobbyMusicStore.getState().setPlaying(false);
  } catch {
    // ignore
  }
  try {
    useSystemMetricsStore.getState().forceStopPolling();
  } catch {
    // ignore
  }
  try {
    useLaunchStore.getState().setVisualIdle(true);
  } catch {
    // ignore
  }
  logger.info("Launcher idle mode: metrics paused, lobby music stopped, visuals frozen");
}

export async function exitLaunchIdleMode(): Promise<void> {
  if (!idleActive) return;
  idleActive = false;
  try {
    useLaunchStore.getState().setVisualIdle(false);
  } catch {
    // ignore
  }
  logger.info("Launcher idle mode ended");
}

async function handleMinecraftExit(payload: MinecraftExitPayload) {
  if (handlingExit) return;
  handlingExit = true;
  const wasIntentional = intentionalStop;
  intentionalStop = false;
  try {
    const launch = useLaunchStore.getState();
    launch.clearRunning();
    await exitLaunchIdleMode();

    try {
      await invoke("restore_from_tray");
    } catch {
      // window may already be visible
    }

    const code = payload.exitCode;
    logger.info(
      `Minecraft exited (build=${payload.buildId}, code=${code ?? "?"}, killed=${payload.killed}, intentional=${wasIntentional})`,
    );

    const builds = useBuildStore.getState().builds;
    const build =
      builds.find((b) => b.id === payload.buildId) ??
      useBuildStore.getState().active();
    const gameDir = payload.gameDir || lastGameDir || build.location || "";

    if (payload.startedMs > 0 && payload.buildId) {
      const minutes = Math.max(
        1,
        Math.round((Date.now() - payload.startedMs) / 60_000),
      );
      try {
        const next = await addBuildPlaytimeMinutes(payload.buildId, minutes);
        if (next) {
          useBuildStore.getState().patchBuild(payload.buildId, {
            playtimeMinutes: next.playtimeMinutes,
            playtime: formatPlaytime(next.playtimeMinutes),
          });
        }
      } catch (err) {
        logger.warn(
          `Playtime update failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (wasIntentional) {
      toast.message("Minecraft stopped", { description: build.name });
      lastSnapshot = null;
      return;
    }

    const [latest, launchLog] = await Promise.all([
      readInstanceLogTail(gameDir, "latest"),
      readInstanceLogTail(gameDir, "launch"),
    ]);

    const crashed = isCrashExit({
      exitCode: code,
      startedMs: payload.startedMs || null,
      latestLog: latest,
      launchLog,
      intentionalStop: false,
    });

    if (crashed) {
      try {
        await pushLaunchLogTail(gameDir);
      } catch {
        // ignore
      }
      useLogConsoleUiStore.getState().setOpen(true);
      const reportPath = await generateCrashReport({
        build,
        gameDir,
        versionId: lastVersionId || build.id,
        playerName: playerNameFallback(),
        exitCode: code,
        startedMs: payload.startedMs || null,
        snapshot: lastSnapshot,
        force: true,
      });

      toast.error("Minecraft crashed", {
        description: reportPath
          ? "Crash report saved under crash-reports/. Open the log console for details."
          : "Check the log console for details.",
        duration: 8000,
      });
    } else {
      toast.message("Minecraft closed", {
        description: build.name,
      });
    }

    lastSnapshot = null;
  } finally {
    handlingExit = false;
  }
}

function ensurePolling() {
  if (pollTimer != null) return;
  pollTimer = window.setInterval(() => {
    const state = useLaunchStore.getState();
    if (!state.runningBuildId) return;
    const buildId = state.runningBuildId;
    const gameDir = state.gameDir || lastGameDir || "";
    const startedMs = state.startedMs || Date.now();
    void state.refreshStatus().then(() => {
      const next = useLaunchStore.getState();
      if (!next.runningBuildId && buildId) {
        // Fallback when the native exit event was missed — do not assume crash.
        void handleMinecraftExit({
          buildId,
          gameDir,
          startedMs,
          exitCode: 0,
          killed: false,
        });
      }
    });
  }, 2000);
}

/** Start listening for Minecraft exit + status polling. Call once from App. */
export function startLaunchLifecycle(): () => void {
  if (started) {
    return () => {};
  }
  started = true;
  ensurePolling();

  void listen<MinecraftExitPayload>("minecraft-exit", (event) => {
    void handleMinecraftExit(event.payload);
  }).then((fn) => {
    unlistenExit = fn;
  });

  void useLaunchStore.getState().refreshStatus();

  return () => {
    started = false;
    if (pollTimer != null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
    if (unlistenExit) {
      unlistenExit();
      unlistenExit = null;
    }
  };
}
