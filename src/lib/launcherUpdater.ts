import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

/** True when running inside the Tauri webview (not Vite browser). */
export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export type LauncherUpdateInfo = {
  currentVersion: string;
  availableVersion: string;
  notes: string;
  update: Update;
};

/**
 * Query the CultForge updater feed (api.cultforge.com, then GitHub Releases)
 * via the Tauri updater plugin.
 */
export async function checkLauncherUpdate(): Promise<LauncherUpdateInfo | null> {
  if (!isTauriRuntime()) return null;
  const currentVersion = await getVersion();
  const update = await check();
  if (!update) return null;
  return {
    currentVersion,
    availableVersion: update.version,
    notes: (update.body ?? "").trim() || "CultForge launcher update available.",
    update,
  };
}

/** Download the signed NSIS update, install (passive), then relaunch. */
export async function installLauncherUpdate(update: Update): Promise<void> {
  await update.downloadAndInstall();
  await relaunch();
}
