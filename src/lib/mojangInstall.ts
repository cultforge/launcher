import { invoke } from "@tauri-apps/api/core";
import { getMinecraftRoot } from "./localContent";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export type MojangVersionInfo = {
  id: string;
  type: string;
  releaseTime: string;
  url: string;
  sha1?: string | null;
  latestRelease: boolean;
  latestSnapshot: boolean;
};

export type MojangInstallResult = {
  versionId: string;
  instancePath: string;
  versionPath: string;
  javaMajor: number | null;
  downloadedFiles: number;
  skippedFiles: number;
};

export async function listMojangVersions(): Promise<MojangVersionInfo[]> {
  if (!isTauri()) {
    throw new Error("Mojang catalog requires the CultForge desktop app");
  }
  return invoke<MojangVersionInfo[]>("list_mojang_versions");
}

export async function installMojangVersion(
  versionId: string,
): Promise<MojangInstallResult> {
  if (!isTauri()) {
    throw new Error("Minecraft install requires the CultForge desktop app");
  }
  let minecraftRoot: string | null = null;
  try {
    minecraftRoot = (await getMinecraftRoot()) || null;
  } catch {
    minecraftRoot = null;
  }
  return invoke<MojangInstallResult>("install_mojang_version", {
    versionId,
    minecraftRoot,
  });
}
