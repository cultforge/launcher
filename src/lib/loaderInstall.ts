import { invoke } from "@tauri-apps/api/core";
import { getMinecraftRoot } from "./localContent";
import type { MojangInstallResult } from "./mojangInstall";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export type ClientLoader = "forge" | "neoforge" | "fabric" | "quilt";

export type LoaderKind = "vanilla" | ClientLoader;

export type LoaderVersionInfo = {
  version: string;
  stable: boolean;
  recommended: boolean;
  latest: boolean;
};

export type LoaderInstallResult = MojangInstallResult & {
  loader: string;
};

export const CLIENT_LOADERS: { id: LoaderKind; label: string }[] = [
  { id: "vanilla", label: "Vanilla" },
  { id: "forge", label: "Forge" },
  { id: "neoforge", label: "NeoForge" },
  { id: "fabric", label: "Fabric" },
  { id: "quilt", label: "Quilt" },
];

export function loaderLabel(loader: LoaderKind): string {
  return CLIENT_LOADERS.find((row) => row.id === loader)?.label ?? "Vanilla";
}

export function sortLoaderVersions(
  rows: LoaderVersionInfo[],
): LoaderVersionInfo[] {
  return [...rows].sort((a, b) => {
    const rank = (row: LoaderVersionInfo) =>
      (row.recommended ? 0 : 4) +
      (row.latest ? 0 : 2) +
      (row.stable ? 0 : 1);
    const diff = rank(a) - rank(b);
    if (diff !== 0) return diff;
    return b.version.localeCompare(a.version, undefined, { numeric: true });
  });
}

export async function listLoaderVersions(
  loader: ClientLoader,
  minecraftVersion: string,
): Promise<LoaderVersionInfo[]> {
  if (!isTauri()) {
    throw new Error("Loader catalog requires the CultForge desktop app");
  }
  return invoke<LoaderVersionInfo[]>("list_loader_versions", {
    loader,
    minecraftVersion,
  });
}

export async function installLoaderBuild(
  minecraftVersion: string,
  loader: ClientLoader,
  loaderVersion: string,
): Promise<LoaderInstallResult> {
  if (!isTauri()) {
    throw new Error("Loader install requires the CultForge desktop app");
  }
  let minecraftRoot: string | null = null;
  try {
    minecraftRoot = (await getMinecraftRoot()) || null;
  } catch {
    minecraftRoot = null;
  }
  return invoke<LoaderInstallResult>("install_loader_build", {
    minecraftVersion,
    loader,
    loaderVersion,
    minecraftRoot,
  });
}
