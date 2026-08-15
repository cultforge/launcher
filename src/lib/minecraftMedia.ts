import { send } from "./client";

export type MinecraftMediaAsset = {
  snapshot?: string;
  banner?: string;
  hero?: string;
  background?: string;
  snapshot_source?: string;
  banner_source?: string;
  source?: string;
  type?: string;
  asset_index?: string;
};

export type MinecraftMediaCatalog = {
  updated_at?: string;
  base_url: string;
  version_count?: number;
  notes?: string;
  versions: Record<string, MinecraftMediaAsset>;
};

let cached: MinecraftMediaCatalog | null = null;
let inflight: Promise<MinecraftMediaCatalog | null> | null = null;

function absolutize(baseUrl: string, path: string | undefined): string | null {
  if (!path?.trim()) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/")) {
    try {
      return `${new URL(baseUrl).origin}${path}`;
    } catch {
      return `https://api.cultforge.com${path}`;
    }
  }
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

/** Public CultForge Minecraft version art catalog. */
export async function fetchMinecraftMediaCatalog(
  force = false,
): Promise<MinecraftMediaCatalog | null> {
  if (!force && cached) return cached;
  if (!force && inflight) return inflight;

  inflight = (async () => {
    try {
      const data = await send<MinecraftMediaCatalog>(
        "api",
        "minecraft_media_index",
      );
      if (!data?.versions || !data.base_url) return null;
      cached = data;
      return data;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Resolve a version id (e.g. `1.20.1` or `1.20.1-forge-…`) to a snapshot URL. */
export async function resolveMinecraftVersionImage(
  versionId: string,
): Promise<string | null> {
  const catalog = await fetchMinecraftMediaCatalog();
  if (!catalog) return null;

  const id = versionId.trim();
  if (!id) return null;

  const direct = catalog.versions[id];
  if (direct?.snapshot) {
    return absolutize(catalog.base_url, direct.snapshot);
  }

  // Try Minecraft version token from loader-qualified ids.
  const mc = id.split(/[-_]/).find((part) => /^\d+\.\d+/.test(part));
  if (mc && catalog.versions[mc]?.snapshot) {
    return absolutize(catalog.base_url, catalog.versions[mc].snapshot);
  }

  // Case-insensitive fallback.
  const lower = id.toLowerCase();
  for (const [key, asset] of Object.entries(catalog.versions)) {
    if (key.toLowerCase() === lower && asset.snapshot) {
      return absolutize(catalog.base_url, asset.snapshot);
    }
  }
  return null;
}
