import type { BuildManifest, GuildBuildRelease } from "../types/buildManifest";
import {
  fetchGuildBuildInstallManifest,
  resolveCatalogInstallManifest,
} from "./guildBuildApi";
import { CacheKeys, readApiCache, writeApiCache } from "./apiCache";

export type GuildBuildSizeEstimate = {
  downloadBytes: number;
  installedBytes: number;
  estimated: boolean;
  source: "api" | "manifest" | "modrinth" | "heuristic";
};

/** Rough average payload sizes for catalog-only estimation (bytes). */
const AVG_BYTES = {
  mod: 2_600_000,
  resourcePack: 9_000_000,
  shader: 18_000_000,
  config: 400_000,
} as const;

function contentCounts(release: GuildBuildRelease) {
  const mods =
    (release.requiredMods?.length ?? 0) + (release.optionalMods?.length ?? 0) ||
    release.content.mods ||
    0;
  const resourcePacks =
    release.resourcePacks?.length || release.content.resourcePacks || 0;
  const shaders = release.shaders?.length || release.content.shaders || 0;
  const configs = release.content.configs || 0;
  return { mods, resourcePacks, shaders, configs };
}

function fromManifest(manifest: BuildManifest): GuildBuildSizeEstimate | null {
  const downloadBytes = manifest.files.reduce(
    (sum, file) => sum + (Number(file.sizeBytes) || 0),
    0,
  );
  if (downloadBytes <= 0) return null;
  return {
    downloadBytes,
    installedBytes: Math.round(downloadBytes * 1.12),
    estimated: false,
    source: "manifest",
  };
}

/** Instant local estimate from content counts (no network). */
export function heuristicGuildBuildSizes(
  release: GuildBuildRelease,
): GuildBuildSizeEstimate {
  const { mods, resourcePacks, shaders, configs } = contentCounts(release);
  let downloadBytes =
    mods * AVG_BYTES.mod +
    resourcePacks * AVG_BYTES.resourcePack +
    shaders * AVG_BYTES.shader +
    configs * AVG_BYTES.config;

  // Loader + vanilla libraries baseline so empty catalogs aren't still "—".
  if (downloadBytes <= 0) {
    downloadBytes = 180_000_000;
  } else {
    downloadBytes += 120_000_000;
  }

  return {
    downloadBytes: Math.round(downloadBytes),
    installedBytes: Math.round(downloadBytes * 1.18),
    estimated: true,
    source: "heuristic",
  };
}

function cacheKey(release: GuildBuildRelease) {
  return `${CacheKeys.guildBuilds(release.guildId)}.size.${release.id}`;
}

/**
 * Prefer API sizes, then install-manifest sum, then Modrinth catalog resolve,
 * then content-count heuristic. Results are cached per build id.
 */
export async function estimateGuildBuildSizes(
  release: GuildBuildRelease,
  opts?: { allowModrinth?: boolean },
): Promise<GuildBuildSizeEstimate> {
  if (release.sizes.downloadBytes > 0) {
    return {
      downloadBytes: release.sizes.downloadBytes,
      installedBytes:
        release.sizes.installedBytes > 0
          ? release.sizes.installedBytes
          : Math.round(release.sizes.downloadBytes * 1.12),
      estimated: Boolean(release.sizes.estimated),
      source: release.sizes.estimated ? "heuristic" : "api",
    };
  }

  const cached = await readApiCache<GuildBuildSizeEstimate>(cacheKey(release));
  if (cached && cached.downloadBytes > 0) return cached;

  if (release.guildId && release.id) {
    try {
      const manifest = await fetchGuildBuildInstallManifest(
        release.guildId,
        release.id,
      );
      const fromApi = fromManifest(manifest);
      if (fromApi) {
        await writeApiCache(cacheKey(release), fromApi);
        return fromApi;
      }
    } catch {
      /* fall through */
    }
  }

  if (opts?.allowModrinth !== false) {
    const hasRefs =
      (release.requiredMods?.length ?? 0) +
        (release.optionalMods?.length ?? 0) +
        (release.shaders?.length ?? 0) +
        (release.resourcePacks?.length ?? 0) >
      0;
    if (hasRefs) {
      try {
        const manifest = await resolveCatalogInstallManifest(release);
        const fromMods = fromManifest(manifest);
        if (fromMods) {
          const result: GuildBuildSizeEstimate = {
            ...fromMods,
            estimated: true,
            source: "modrinth",
          };
          await writeApiCache(cacheKey(release), result);
          return result;
        }
      } catch {
        /* fall through to heuristic */
      }
    }
  }

  const heuristic = heuristicGuildBuildSizes(release);
  await writeApiCache(cacheKey(release), heuristic);
  return heuristic;
}

/** Human size label — avoids "0.00 GB" for small/missing payloads. */
export function formatBuildSizeBytes(
  bytes: number,
  opts?: { estimated?: boolean },
): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return opts?.estimated ? "~…" : "—";
  }
  const prefix = opts?.estimated ? "~" : "";
  const abs = Math.abs(bytes);
  if (abs < 1024) return `${prefix}${Math.round(abs)} B`;
  if (abs < 1024 ** 2) return `${prefix}${(abs / 1024).toFixed(0)} KB`;
  if (abs < 1024 ** 3) {
    const mib = abs / 1024 ** 2;
    return `${prefix}${mib >= 100 ? mib.toFixed(0) : mib.toFixed(1)} MB`;
  }
  const gib = abs / 1024 ** 3;
  return `${prefix}${gib >= 10 ? gib.toFixed(1) : gib.toFixed(2)} GB`;
}
