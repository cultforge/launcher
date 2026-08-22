import { invoke } from "@tauri-apps/api/core";
import { getMinecraftRoot, listLocalBuilds } from "./localContent";
import type { MojangInstallResult } from "./mojangInstall";
import { installMojangVersion } from "./mojangInstall";
import type { BuildInstance } from "../stores/build";
import { useBuildStore } from "../stores/build";
import { logger } from "./logger";

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

/** Normalize catalog / instance loader strings to a launcher kind. */
export function normalizeLoaderKind(loader: string | null | undefined): LoaderKind {
  const raw = (loader || "").trim().toLowerCase();
  if (!raw || raw === "—" || raw === "vanilla" || raw === "mojang") {
    return "vanilla";
  }
  if (raw.includes("neoforge") || raw === "neo") return "neoforge";
  if (raw.includes("fabric")) return "fabric";
  if (raw.includes("quilt")) return "quilt";
  if (raw.includes("forge")) return "forge";
  return "vanilla";
}

function localMatchesLoader(localLoader: string, want: LoaderKind): boolean {
  const a = localLoader.trim().toLowerCase();
  if (want === "vanilla") {
    return (
      !a ||
      a === "vanilla" ||
      a === "mojang" ||
      (!a.includes("forge") &&
        !a.includes("fabric") &&
        !a.includes("quilt"))
    );
  }
  if (want === "neoforge") return a.includes("neoforge");
  if (want === "forge") return a.includes("forge") && !a.includes("neoforge");
  if (want === "fabric") return a.includes("fabric");
  if (want === "quilt") return a.includes("quilt");
  return false;
}

function mcMatches(localMc: string, localId: string, wantMc: string): boolean {
  const mc = wantMc.trim();
  if (!mc) return false;
  if (localMc.trim() === mc) return true;
  if (localId === mc) return true;
  if (localId.startsWith(`${mc}-`)) return true;
  if (localId.includes(`-${mc}-`)) return true;
  return false;
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

/**
 * Resolve a Minecraft version profile that matches the build's loader.
 * Installs Forge/Fabric/etc. when the profile is missing (guild packs used to
 * launch vanilla MC because only the numeric game version was selected).
 */
export async function ensureRuntimeVersionId(
  build: BuildInstance,
): Promise<string> {
  const mc = (build.mc || "").trim();
  if (!mc || mc === "—") {
    throw new Error("This build has no Minecraft version.");
  }

  const kind = normalizeLoaderKind(build.loader);
  const locals = await listLocalBuilds();

  const preferId = (() => {
    if (build.versionPath?.trim()) {
      const base = build.versionPath
        .replace(/\\/g, "/")
        .replace(/\/+$/, "")
        .split("/")
        .pop();
      if (base) return base;
    }
    return null;
  })();

  if (preferId) {
    const hit = locals.find(
      (row) =>
        row.id === preferId &&
        localMatchesLoader(row.loader, kind) &&
        mcMatches(row.mc, row.id, mc),
    );
    if (hit) return hit.id;
  }

  const matches = locals
    .filter(
      (row) =>
        localMatchesLoader(row.loader, kind) && mcMatches(row.mc, row.id, mc),
    )
    .sort((a, b) => (b.modifiedMs ?? 0) - (a.modifiedMs ?? 0));

  if (matches[0]) {
    useBuildStore.getState().patchBuild(build.id, {
      versionPath: matches[0].path,
    });
    return matches[0].id;
  }

  if (kind === "vanilla") {
    const exact = locals.find((row) => row.id === mc);
    if (exact) {
      useBuildStore.getState().patchBuild(build.id, {
        versionPath: exact.path,
      });
      return exact.id;
    }
    logger.info(`Installing vanilla Minecraft ${mc} for launch`);
    const result = await installMojangVersion(mc);
    useBuildStore.getState().patchBuild(build.id, {
      versionPath: result.versionPath,
    });
    return result.versionId;
  }

  logger.info(`Installing ${kind} for Minecraft ${mc} (guild/runtime ensure)`);
  const catalog = sortLoaderVersions(await listLoaderVersions(kind, mc));
  const pick = catalog[0];
  if (!pick?.version) {
    throw new Error(
      `No ${loaderLabel(kind)} builds are available for Minecraft ${mc}.`,
    );
  }

  const result = await installLoaderBuild(mc, kind, pick.version);
  useBuildStore.getState().patchBuild(build.id, {
    versionPath: result.versionPath,
  });
  logger.success(`Runtime ready: ${result.versionId} (${result.loader})`);
  return result.versionId;
}
