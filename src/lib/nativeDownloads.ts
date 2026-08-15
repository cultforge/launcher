import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ModrinthInstallPlan } from "./modrinth";

export type DownloadPhase =
  | "queued"
  | "downloading"
  | "verifying"
  | "installing"
  | "done"
  | "error"
  | "cancelled";

export type NativeDownloadProgress = {
  jobId: string;
  itemId: string;
  name: string;
  phase: DownloadPhase;
  downloadedBytes: number;
  totalBytes: number;
  error?: string | null;
};

export type DownloadJobSnapshot = {
  jobId: string;
  phase: string;
  itemCount: number;
};

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function startModrinthInstall(
  plan: ModrinthInstallPlan,
): Promise<string> {
  if (!isTauri()) {
    throw new Error("Native downloads require the CultForge desktop shell.");
  }
  return invoke<string>("start_modrinth_install", { plan });
}

export async function cancelNativeDownload(jobId: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("cancel_download", { jobId });
}

export async function listNativeDownloadJobs(): Promise<DownloadJobSnapshot[]> {
  if (!isTauri()) return [];
  return invoke<DownloadJobSnapshot[]>("list_download_jobs");
}

export async function listenNativeDownloadProgress(
  handler: (event: NativeDownloadProgress) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return () => undefined;
  }
  return listen<NativeDownloadProgress>("download-progress", (event) => {
    handler(event.payload);
  });
}
