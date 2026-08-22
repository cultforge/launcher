import { ClientHttpError, send } from "./client";
import type { CatalogBuildRecord } from "../types/catalog";

export class BuildCatalogError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "BuildCatalogError";
    this.status = status;
  }
}

function wrap(prefix: string, err: unknown): BuildCatalogError {
  if (err instanceof ClientHttpError)
    return new BuildCatalogError(`${prefix}: ${err.message}`, err.status);
  if (err instanceof BuildCatalogError) return err;
  return new BuildCatalogError(
    `${prefix}: ${err instanceof Error ? err.message : String(err)}`,
  );
}

function asRecord(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : null;
}

function unwrapList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const obj = asRecord(data);
  if (!obj) return [];
  for (const key of ["data", "items", "builds", "results"]) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  return [];
}

function catalogRecordFromApi(raw: unknown): CatalogBuildRecord | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const id = String(obj.id ?? "").trim();
  const name = String(obj.name ?? "").trim();
  if (!id || !name) return null;
  return {
    id,
    buildScope: obj.build_scope === "user" ? "user" : "guild",
    guildId: typeof obj.guild_id === "string" ? obj.guild_id : null,
    ownerId: String(obj.owner_id ?? ""),
    name,
    tagline: typeof obj.tagline === "string" ? obj.tagline : undefined,
    loader: String(obj.loader ?? "fabric"),
    minecraftVersion: String(
      obj.minecraft_version ?? obj.minecraftVersion ?? "",
    ),
    keywords: Array.isArray(obj.keywords)
      ? (obj.keywords as string[]).filter((k) => typeof k === "string")
      : [],
    isPublicCatalog: Boolean(obj.is_public_catalog),
    isInstallable: Boolean(obj.is_installable),
    hasInstallManifest: Boolean(obj.has_install_manifest),
    iconUrl: typeof obj.icon_url === "string" ? obj.icon_url : undefined,
    coverUrl: typeof obj.cover_url === "string" ? obj.cover_url : undefined,
  };
}

export type CatalogSearchParams = {
  q?: string;
  keywords?: string;
  loader?: string;
  minecraftVersion?: string;
  limit?: number;
  offset?: number;
};

export async function searchPublicBuilds(
  params: CatalogSearchParams = {},
): Promise<CatalogBuildRecord[]> {
  try {
    const p: Record<string, string> = {};
    if (params.q) p.q = params.q;
    if (params.keywords) p.keywords = params.keywords;
    if (params.loader) p.loader = params.loader;
    if (params.minecraftVersion)
      p.minecraft_version = params.minecraftVersion;
    if (params.limit) p.limit = String(params.limit);
    if (params.offset) p.offset = String(params.offset);
    const raw = await send<unknown>(
      "api",
      "search_public_build_catalog",
      p,
    );
    return unwrapList(raw)
      .map(catalogRecordFromApi)
      .filter((x): x is CatalogBuildRecord => Boolean(x));
  } catch (err) {
    throw wrap("Could not search build catalog", err);
  }
}

export async function fetchCatalogBuildDetail(
  buildId: string,
): Promise<CatalogBuildRecord> {
  try {
    const raw = await send<unknown>(
      "api",
      "get_public_catalog_build_detail",
      { build_id: buildId },
    );
    const obj = asRecord(raw);
    const inner = obj?.data ?? obj?.build ?? raw;
    const record = catalogRecordFromApi(inner);
    if (!record) throw new BuildCatalogError("Build not found", 404);
    return record;
  } catch (err) {
    throw wrap("Could not fetch build detail", err);
  }
}
