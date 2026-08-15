import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

type LaunchStatus = {
  running: boolean;
  buildId: string | null;
  pid: number | null;
  startedMs: number | null;
  gameDir: string | null;
};

type LaunchStore = {
  starting: boolean;
  startingBuildId: string | null;
  runningBuildId: string | null;
  pid: number | null;
  gameDir: string | null;
  startedMs: number | null;
  setStarting: (starting: boolean, buildId?: string | null) => void;
  setRunning: (
    buildId: string | null,
    pid?: number | null,
    meta?: { gameDir?: string | null; startedMs?: number | null },
  ) => void;
  clearRunning: () => void;
  refreshStatus: () => Promise<void>;
};

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export const useLaunchStore = create<LaunchStore>((set) => ({
  starting: false,
  startingBuildId: null,
  runningBuildId: null,
  pid: null,
  gameDir: null,
  startedMs: null,
  setStarting: (starting, buildId = null) =>
    set({
      starting,
      startingBuildId: starting ? buildId : null,
    }),
  setRunning: (buildId, pid = null, meta) =>
    set({
      runningBuildId: buildId,
      pid,
      gameDir: meta?.gameDir ?? null,
      startedMs: meta?.startedMs ?? Date.now(),
      starting: false,
      startingBuildId: null,
    }),
  clearRunning: () =>
    set({
      runningBuildId: null,
      pid: null,
      gameDir: null,
      startedMs: null,
      starting: false,
      startingBuildId: null,
    }),
  refreshStatus: async () => {
    if (!isTauri()) {
      set({ runningBuildId: null, pid: null, gameDir: null, startedMs: null });
      return;
    }
    try {
      const status = await invoke<LaunchStatus>("get_launch_status");
      if (status.running) {
        set({
          runningBuildId: status.buildId,
          pid: status.pid,
          gameDir: status.gameDir,
          startedMs: status.startedMs,
          starting: false,
          startingBuildId: null,
        });
      } else {
        set({
          runningBuildId: null,
          pid: null,
          gameDir: null,
          startedMs: null,
        });
      }
    } catch {
      // ignore
    }
  },
}));
