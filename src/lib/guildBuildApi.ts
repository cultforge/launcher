import { ClientHttpError, send, sendMutate } from "./client";
import {
  CacheKeys,
  cachedRead,
  invalidateGuildCaches,
  writeApiCache,
} from "./apiCache";
import type {
  BuildContentKind,
  BuildManifest,
  BuildManifestFile,
  GuildBuildModRef,
  GuildBuildRelease,
} from "../types/buildManifest";
import {
  destKindForProjectType,
  getModrinthProject,
  getModrinthVersion,
  getModrinthVersions,
  versionMatchesFilters,
  type ModrinthVersion,
} from "./modrinth";

export class GuildBuildApiError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "GuildBuildApiError";
    this.status = status;
  }
}

export type GuildBuildWritePayload = {
  name: string;
  version?: string;
  minecraftVersion?: string;
  loader?: string;
  tagline?: string | null;
  description?: string | null;
  downloadUrl?: string | null;
  sourceUrl?: string | null;
  /** External https URL on create/update — mutually exclusive with iconUpload. */
  coverUrl?: string | null;
  iconUrl?: string | null;
  /** Dedicated POST …/icon after the build exists (base64 bytes). */
  iconUpload?: GuildBuildImageUpload | null;
  /** Dedicated POST …/cover after the build exists (base64 bytes). */
  coverUpload?: GuildBuildImageUpload | null;
  isPublished?: boolean;
  isFeatured?: boolean;
  isPublicCatalog?: boolean;
  keywords?: string[];
  requiredMods?: GuildBuildModRef[];
  optionalMods?: GuildBuildModRef[];
  shaders?: GuildBuildModRef[];
  resourcePacks?: GuildBuildModRef[];
};

/** JSON body for POST …/builds/{id}/icon|cover — exactly one of base64 or url. */
export type GuildBuildImageUpload = {
  image_base64?: string;
  image_url?: string;
  content_type?: string;
};

export const GUILD_BUILD_ICON_MAX_BYTES = 1 * 1024 * 1024;
export const GUILD_BUILD_COVER_MAX_BYTES = 4 * 1024 * 1024;
export const GUILD_BUILD_IMAGE_URL_MAX = 500;
export const GUILD_BUILD_IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

function wrapError(prefix: string, err: unknown): GuildBuildApiError {
  if (err instanceof ClientHttpError) {
    return new GuildBuildApiError(`${prefix}: ${err.message}`, err.status);
  }
  if (err instanceof GuildBuildApiError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new GuildBuildApiError(`${prefix}: ${message}`);
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
  for (const key of ["data", "items", "builds", "releases", "results"]) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  const nested = asRecord(obj.data);
  if (nested) {
    for (const key of ["items", "builds", "releases", "results", "data"]) {
      if (Array.isArray(nested[key])) return nested[key] as unknown[];
    }
  }
  return [];
}

function unwrapOne(data: unknown): unknown {
  const obj = asRecord(data);
  if (!obj) return data;
  for (const key of ["data", "build", "item", "release"]) {
    if (obj[key] !== undefined) return obj[key];
  }
  return data;
}

export function parseModRefs(raw: unknown): GuildBuildModRef[] {
  if (!Array.isArray(raw)) return [];
  const out: GuildBuildModRef[] = [];
  for (const row of raw) {
    const obj = asRecord(row);
    if (!obj) continue;
    const name = String(obj.name ?? obj.slug ?? "").trim();
    if (!name) continue;
    const ref: GuildBuildModRef = { name };
    if (typeof obj.slug === "string" && obj.slug.trim()) {
      ref.slug = obj.slug.trim();
    }
    if (typeof obj.version === "string" && obj.version.trim()) {
      ref.version = obj.version.trim();
    }
    const versionId =
      typeof obj.version_id === "string" && obj.version_id.trim()
        ? obj.version_id.trim()
        : typeof obj.versionId === "string" && obj.versionId.trim()
          ? obj.versionId.trim()
          : "";
    if (versionId) ref.versionId = versionId;
    const source =
      typeof obj.source_url === "string" && obj.source_url.trim()
        ? obj.source_url.trim()
        : typeof obj.sourceUrl === "string" && obj.sourceUrl.trim()
          ? obj.sourceUrl.trim()
          : "";
    if (source) ref.sourceUrl = source;
    out.push(ref);
  }
  return out;
}

export function modRefsToApi(refs: GuildBuildModRef[] | undefined): unknown[] | undefined {
  if (refs === undefined) return undefined;
  return refs.map((m) => ({
    name: m.name,
    ...(m.slug ? { slug: m.slug } : {}),
    ...(m.versionId
      ? { version_id: m.versionId }
      : m.version
        ? { version: m.version }
        : { version: "latest" }),
    ...(m.version && m.versionId ? { version: m.version } : {}),
    ...(m.sourceUrl ? { source_url: m.sourceUrl } : {}),
  }));
}

export type InstallManifestUnresolved = {
  slug?: string;
  name?: string;
  version?: string;
  versionId?: string;
  reason?: string;
};

/** Parse install_manifest.unresolved after save/refresh (bad pins, no silent latest). */
export function parseUnresolvedPins(raw: unknown): InstallManifestUnresolved[] {
  const root = asRecord(raw) ?? {};
  const nested =
    asRecord(root.data) ??
    asRecord(root.manifest) ??
    asRecord(root.install_manifest) ??
    root;
  const list = nested.unresolved ?? root.unresolved;
  if (!Array.isArray(list)) return [];
  const out: InstallManifestUnresolved[] = [];
  for (const row of list) {
    const obj = asRecord(row);
    if (!obj) continue;
    out.push({
      slug:
        typeof obj.slug === "string"
          ? obj.slug
          : typeof obj.name === "string"
            ? obj.name
            : undefined,
      name: typeof obj.name === "string" ? obj.name : undefined,
      version: typeof obj.version === "string" ? obj.version : undefined,
      versionId:
        typeof obj.version_id === "string"
          ? obj.version_id
          : typeof obj.versionId === "string"
            ? obj.versionId
            : undefined,
      reason:
        typeof obj.reason === "string"
          ? obj.reason
          : typeof obj.error === "string"
            ? obj.error
            : typeof obj.message === "string"
              ? obj.message
              : undefined,
    });
  }
  return out;
}

function normalizeLoader(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (v.startsWith("neo")) return "neoforge";
  if (v.startsWith("forge")) return "forge";
  if (v.startsWith("quilt")) return "quilt";
  if (v.startsWith("vanilla") || v === "none") return "vanilla";
  if (v.startsWith("fabric")) return "fabric";
  return v || "fabric";
}

/** Map guilds.cultforge.com GuildBuildRecord → launcher GuildBuildRelease view. */
export function releaseFromGuildBuildRecord(
  row: unknown,
  fallbackGuildId = "",
): GuildBuildRelease | null {
  const obj = asRecord(row);
  if (!obj) return null;
  const id = String(obj.id ?? obj.build_id ?? obj.buildId ?? "").trim();
  const guildId = String(
    obj.guild_id ?? obj.guildId ?? fallbackGuildId ?? "",
  ).trim();
  const name = String(obj.name ?? obj.title ?? obj.display_name ?? "").trim();
  if (!id || !guildId || !name) return null;
  const required = parseModRefs(obj.required_mods ?? obj.requiredMods);
  const optional = parseModRefs(obj.optional_mods ?? obj.optionalMods);
  const shaders = parseModRefs(obj.shaders);
  const packs = parseModRefs(obj.resource_packs ?? obj.resourcePacks);
  const created =
    typeof obj.created_at === "string"
      ? obj.created_at
      : typeof obj.updated_at === "string"
        ? obj.updated_at
        : new Date().toISOString();
  const cover =
    typeof obj.cover_url === "string" && obj.cover_url
      ? obj.cover_url
      : typeof obj.coverUrl === "string" && obj.coverUrl
        ? obj.coverUrl
        : "linear-gradient(135deg,#10182b,#29225a 48%,#0a0d16)";
  const iconRaw =
    typeof obj.icon_url === "string" && obj.icon_url
      ? obj.icon_url
      : typeof obj.iconUrl === "string" && obj.iconUrl
        ? obj.iconUrl
        : null;
  const iconUrl =
    typeof iconRaw === "string" && iconRaw.startsWith("http") ? iconRaw : null;
  const tagline =
    typeof obj.tagline === "string" ? obj.tagline : null;
  const description =
    typeof obj.description === "string" ? obj.description : null;
  const downloadUrl =
    typeof obj.download_url === "string"
      ? obj.download_url
      : typeof obj.downloadUrl === "string"
        ? obj.downloadUrl
        : null;
  const sourceUrl =
    typeof obj.source_url === "string"
      ? obj.source_url
      : typeof obj.sourceUrl === "string"
        ? obj.sourceUrl
        : null;
  return {
    id,
    buildId: id,
    guildId,
    serverId: String(obj.server_id ?? obj.serverId ?? ""),
    name,
    summary: tagline || description || "",
    version: String(obj.version ?? "1.0.0"),
    publishedAt: created,
    publishedAtIso: created,
    image: iconUrl || cover,
    iconUrl,
    dependencies: {
      minecraft: String(obj.minecraft_version ?? obj.minecraftVersion ?? "1.20.1"),
      loader: normalizeLoader(String(obj.loader ?? "fabric")),
      java: "17+",
    },
    sizes: {
      downloadBytes:
        Number(
          obj.download_bytes ??
            obj.downloadBytes ??
            obj.total_download_bytes ??
            obj.totalDownloadBytes ??
            obj.size_bytes ??
            obj.sizeBytes ??
            0,
        ) || 0,
      installedBytes:
        Number(
          obj.installed_bytes ??
            obj.installedBytes ??
            obj.total_installed_bytes ??
            obj.totalInstalledBytes ??
            0,
        ) || 0,
      estimated: false,
    },
    content: {
      mods: required.length + optional.length,
      resourcePacks: packs.length,
      shaders: shaders.length,
      configs: 0,
    },
    changelog: [],
    excludes: ["saves/**"],
    downloadUrl,
    sourceUrl,
    coverUrl: typeof cover === "string" && cover.startsWith("http") ? cover : null,
    tagline,
    description,
    isPublished: obj.is_published !== false && obj.isPublished !== false,
    isFeatured: Boolean(obj.is_featured ?? obj.isFeatured),
    isPublicCatalog: Boolean(obj.is_public_catalog ?? obj.isPublicCatalog),
    keywords: Array.isArray(obj.keywords) ? (obj.keywords as string[]).filter((k) => typeof k === "string") : [],
    hasInstallManifest: Boolean(obj.has_install_manifest ?? obj.hasInstallManifest),
    isInstallable: Boolean(obj.is_installable ?? obj.isInstallable),
    installMode: typeof obj.install_mode === "string" ? obj.install_mode : undefined,
    deepLink: typeof obj.deep_link === "string" ? obj.deep_link : undefined,
    requiredMods: required,
    optionalMods: optional,
    shaders,
    resourcePacks: packs,
  };
}

/**
 * List published guild builds via live guilds module
 * (`GET /v1/guilds/{guild_id}/builds` → list_guild_builds).
 */
export async function fetchGuildBuildReleases(
  guildId: string,
): Promise<GuildBuildRelease[]> {
  try {
    const { data } = await cachedRead({
      key: CacheKeys.guildBuilds(guildId),
      fetcher: async () => {
        const raw = await send<unknown>("guilds", "list_guild_builds", {
          guild_id: guildId,
        });
        const rows = unwrapList(raw);
        const mapped = rows
          .map((row) => releaseFromGuildBuildRecord(row, guildId))
          .filter((x): x is GuildBuildRelease => Boolean(x));
        // Prefer published; if the API omits the flag, keep the row.
        return mapped.filter((r) => r.isPublished !== false);
      },
    });
    return data;
  } catch (err) {
    throw wrapError("Could not list guild builds", err);
  }
}

/** Fetch one guild build by id. */
export async function fetchGuildBuildRelease(
  guildId: string,
  buildId: string,
): Promise<GuildBuildRelease> {
  try {
    const data = await send<unknown>("guilds", "get_guild_build", {
      guild_id: guildId,
      build_id: buildId,
    });
    const row =
      releaseFromGuildBuildRecord(unwrapOne(data), guildId) ??
      releaseFromGuildBuildRecord(data, guildId);
    if (!row) {
      throw new GuildBuildApiError("Malformed guild build response", 502);
    }
    return row;
  } catch (err) {
    throw wrapError("Could not fetch guild build", err);
  }
}

function imageUploadBody(
  upload: GuildBuildImageUpload,
): Record<string, string> {
  const b64 = (upload.image_base64 || "").trim();
  const url = (upload.image_url || "").trim();
  if (b64 && url) {
    throw new GuildBuildApiError(
      "Send either image_base64 or image_url, not both",
      400,
    );
  }
  if (b64) {
    const body: Record<string, string> = { image_base64: b64 };
    if (upload.content_type) body.content_type = upload.content_type;
    return body;
  }
  if (url) {
    return { image_url: url };
  }
  throw new GuildBuildApiError("image_base64 or image_url is required", 400);
}

/** Shared JSON body builder for guild / build media POSTs. */
export function guildMediaUploadBody(
  upload: GuildBuildImageUpload,
): Record<string, string> {
  return imageUploadBody(upload);
}

async function applyBuildImageUploads(
  guildId: string,
  buildId: string,
  payload: Partial<GuildBuildWritePayload>,
): Promise<void> {
  if (payload.iconUpload) {
    await uploadGuildBuildIcon(guildId, buildId, payload.iconUpload);
  }
  if (payload.coverUpload) {
    await uploadGuildBuildCover(guildId, buildId, payload.coverUpload);
  }
}

/** POST /v1/guilds/{guild_id}/builds/{build_id}/icon */
export async function uploadGuildBuildIcon(
  guildId: string,
  buildId: string,
  upload: GuildBuildImageUpload,
): Promise<void> {
  try {
    await sendMutate(
      "guilds",
      "upload_or_set_build_icon",
      {
        guild_id: guildId,
        build_id: buildId,
        ...imageUploadBody(upload),
      },
      "POST",
    );
  } catch (err) {
    throw wrapError("Could not upload build icon", err);
  }
}

/** POST /v1/guilds/{guild_id}/builds/{build_id}/cover */
export async function uploadGuildBuildCover(
  guildId: string,
  buildId: string,
  upload: GuildBuildImageUpload,
): Promise<void> {
  try {
    await sendMutate(
      "guilds",
      "upload_or_set_build_cover_image",
      {
        guild_id: guildId,
        build_id: buildId,
        ...imageUploadBody(upload),
      },
      "POST",
    );
  } catch (err) {
    throw wrapError("Could not upload build cover", err);
  }
}

/** POST /v1/guilds/{guild_id}/builds */
export async function createGuildBuild(
  guildId: string,
  payload: GuildBuildWritePayload,
): Promise<GuildBuildRelease> {
  try {
    // Create is JSON-only: icon_url / cover_url links — never raw bytes here.
    const data = await sendMutate(
      "guilds",
      "create_guild_build",
      {
        guild_id: guildId,
        name: payload.name,
        version: payload.version ?? "1.0.0",
        minecraft_version: payload.minecraftVersion ?? "1.20.1",
        loader: normalizeLoader(payload.loader ?? "fabric"),
        tagline: payload.tagline ?? null,
        description: payload.description ?? null,
        download_url: payload.downloadUrl ?? null,
        source_url: payload.sourceUrl ?? null,
        cover_url: payload.coverUpload ? null : (payload.coverUrl ?? null),
        icon_url: payload.iconUpload ? null : (payload.iconUrl ?? null),
        is_published: payload.isPublished ?? true,
        is_featured: payload.isFeatured ?? false,
        required_mods: modRefsToApi(payload.requiredMods) ?? [],
        optional_mods: modRefsToApi(payload.optionalMods) ?? [],
        shaders: modRefsToApi(payload.shaders) ?? [],
        resource_packs: modRefsToApi(payload.resourcePacks) ?? [],
      },
      "POST",
    );
    let row = releaseFromGuildBuildRecord(unwrapOne(data), guildId);
    if (!row) {
      throw new GuildBuildApiError("Malformed create build response", 502);
    }
    if (payload.iconUpload || payload.coverUpload) {
      await applyBuildImageUploads(guildId, row.id, payload);
      row = await fetchGuildBuildRelease(guildId, row.id);
    }
    await invalidateGuildCaches(guildId);
    return row;
  } catch (err) {
    throw wrapError("Could not create guild build", err);
  }
}

/** PATCH /v1/guilds/{guild_id}/builds/{build_id} */
export async function updateGuildBuild(
  guildId: string,
  buildId: string,
  payload: Partial<GuildBuildWritePayload>,
): Promise<GuildBuildRelease> {
  try {
    const body: Record<string, unknown> = {
      guild_id: guildId,
      build_id: buildId,
    };
    if (payload.name !== undefined) body.name = payload.name;
    if (payload.version !== undefined) body.version = payload.version;
    if (payload.minecraftVersion !== undefined) {
      body.minecraft_version = payload.minecraftVersion;
    }
    if (payload.loader !== undefined) {
      body.loader = normalizeLoader(payload.loader);
    }
    if (payload.tagline !== undefined) body.tagline = payload.tagline;
    if (payload.description !== undefined) body.description = payload.description;
    if (payload.downloadUrl !== undefined) body.download_url = payload.downloadUrl;
    if (payload.sourceUrl !== undefined) body.source_url = payload.sourceUrl;
    // Prefer dedicated upload endpoints over link fields when bytes are present.
    if (payload.coverUpload) {
      // leave cover_url alone on PATCH — upload endpoint owns the bytes
    } else if (payload.coverUrl !== undefined) {
      body.cover_url = payload.coverUrl;
    }
    if (payload.iconUpload) {
      // leave icon_url alone
    } else if (payload.iconUrl !== undefined) {
      body.icon_url = payload.iconUrl;
    }
    if (payload.isPublished !== undefined) body.is_published = payload.isPublished;
    if (payload.isFeatured !== undefined) body.is_featured = payload.isFeatured;
    if (payload.isPublicCatalog !== undefined) body.is_public_catalog = payload.isPublicCatalog;
    if (payload.keywords !== undefined) body.keywords = payload.keywords;
    if (payload.requiredMods !== undefined) {
      body.required_mods = modRefsToApi(payload.requiredMods);
    }
    if (payload.optionalMods !== undefined) {
      body.optional_mods = modRefsToApi(payload.optionalMods);
    }
    if (payload.shaders !== undefined) {
      body.shaders = modRefsToApi(payload.shaders);
    }
    if (payload.resourcePacks !== undefined) {
      body.resource_packs = modRefsToApi(payload.resourcePacks);
    }
    const data = await sendMutate(
      "guilds",
      "update_guild_build",
      body,
      "PATCH",
    );
    let row = releaseFromGuildBuildRecord(unwrapOne(data), guildId);
    if (!row) {
      throw new GuildBuildApiError("Malformed update build response", 502);
    }
    if (payload.iconUpload || payload.coverUpload) {
      await applyBuildImageUploads(guildId, buildId, payload);
      row = await fetchGuildBuildRelease(guildId, buildId);
    }
    await invalidateGuildCaches(guildId);
    return row;
  } catch (err) {
    throw wrapError("Could not update guild build", err);
  }
}

/** DELETE /v1/guilds/{guild_id}/builds/{build_id} */
export async function deleteGuildBuild(
  guildId: string,
  buildId: string,
): Promise<void> {
  try {
    await sendMutate(
      "guilds",
      "delete_guild_build",
      { guild_id: guildId, build_id: buildId },
      "DELETE",
    );
    await invalidateGuildCaches(guildId);
  } catch (err) {
    throw wrapError("Could not delete guild build", err);
  }
}

/**
 * Legacy provisional api-host file-manifest (may not exist).
 * Prefer {@link fetchGuildBuildInstallManifest} from the guilds host.
 */
export async function fetchBuildManifest(
  releaseId: string,
): Promise<BuildManifest> {
  try {
    return await send<BuildManifest>("api", "get_build_manifest", {
      release_id: releaseId,
    });
  } catch (err) {
    const status =
      err instanceof ClientHttpError
        ? err.status
        : err instanceof GuildBuildApiError
          ? err.status
          : 0;
    if (status === 404 || status === 501 || status === 502) {
      throw new GuildBuildApiError(
        "Remote file-manifest API is not available for this release.",
        status || 404,
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (/404|not found|manifest|Command .* not found/i.test(msg)) {
      throw new GuildBuildApiError(
        "Remote file-manifest API is not available for this release.",
        404,
      );
    }
    throw wrapError("Could not fetch build manifest", err);
  }
}

function parseInstallManifestFile(row: unknown): BuildManifestFile | null {
  const obj = asRecord(row);
  if (!obj) return null;
  const path = String(obj.path ?? obj.rel_path ?? obj.relative_path ?? "").trim();
  if (!path) return null;
  const downloadsRaw = obj.downloads ?? obj.urls ?? obj.download_urls;
  const downloads: string[] = [];
  if (Array.isArray(downloadsRaw)) {
    for (const u of downloadsRaw) {
      if (typeof u === "string" && /^https?:\/\//i.test(u.trim())) {
        downloads.push(u.trim());
      } else {
        const rec = asRecord(u);
        const url = typeof rec?.url === "string" ? rec.url.trim() : "";
        if (/^https?:\/\//i.test(url)) downloads.push(url);
      }
    }
  }
  const single =
    typeof obj.url === "string"
      ? obj.url.trim()
      : typeof obj.download_url === "string"
        ? obj.download_url.trim()
        : "";
  if (single && /^https?:\/\//i.test(single) && !downloads.includes(single)) {
    downloads.unshift(single);
  }
  if (!downloads.length) return null;

  const hashesObj = asRecord(obj.hashes) ?? {};
  const sha512 = String(
    hashesObj.sha512 ?? obj.sha512 ?? obj.sha_512 ?? "",
  ).trim();
  const sha256 = String(
    hashesObj.sha256 ?? obj.sha256 ?? obj.sha_256 ?? "",
  ).trim();
  if (!sha512) return null;

  const kindRaw = String(obj.kind ?? obj.content_kind ?? "mod").toLowerCase();
  let kind: BuildContentKind = "mod";
  if (kindRaw.includes("resource")) kind = "resource-pack";
  else if (kindRaw.includes("shader")) kind = "shader";
  else if (kindRaw.includes("config") || kindRaw.includes("data")) kind = "config";
  else if (kindRaw.includes("server")) kind = "server-metadata";

  const envRaw = String(obj.environment ?? obj.env ?? "both").toLowerCase();
  const environment =
    envRaw === "client" || envRaw === "server" || envRaw === "both"
      ? envRaw
      : "both";

  return {
    path: path.replace(/^\/+/, ""),
    kind,
    environment,
    downloads,
    sizeBytes: Number(obj.size_bytes ?? obj.sizeBytes ?? obj.size ?? 0) || 0,
    hashes: {
      sha256: sha256 || "0".repeat(64),
      sha512,
    },
  };
}

export function parseGuildInstallManifest(
  raw: unknown,
  releaseId: string,
): BuildManifest {
  const root = asRecord(raw) ?? {};
  const nested =
    asRecord(root.data) ??
    asRecord(root.manifest) ??
    asRecord(root.install_manifest) ??
    root;
  const filesRaw =
    nested.files ?? root.files ?? nested.items ?? nested.entries ?? [];
  const list = Array.isArray(filesRaw) ? filesRaw : [];
  const files = list
    .map(parseInstallManifestFile)
    .filter((x): x is BuildManifestFile => Boolean(x));
  if (!files.length) {
    throw new GuildBuildApiError(
      "Install manifest response had no usable files.",
      502,
    );
  }
  const generatedAt = String(
    nested.generated_at ??
      nested.generatedAt ??
      root.generated_at ??
      new Date().toISOString(),
  );
  const excludesRaw = nested.excludes ?? root.excludes ?? ["saves/**"];
  const excludes = Array.isArray(excludesRaw)
    ? excludesRaw.map((x) => String(x)).filter(Boolean)
    : ["saves/**"];
  return {
    schemaVersion: 1,
    releaseId: String(nested.release_id ?? nested.releaseId ?? releaseId),
    generatedAt,
    excludes: [...new Set([...excludes, "saves/**"])],
    files,
  };
}

/** GET /v1/guilds/{guild_id}/builds/{build_id}/manifest */
export async function fetchGuildBuildInstallManifest(
  guildId: string,
  buildId: string,
): Promise<BuildManifest> {
  try {
    const raw = await send<unknown>("guilds", "get_guild_build_install_manifest", {
      guild_id: guildId,
      build_id: buildId,
    });
    return parseGuildInstallManifest(raw, buildId);
  } catch (err) {
    throw wrapError("Could not fetch guild build install manifest", err);
  }
}

export type RefreshInstallManifestResult = {
  manifest: BuildManifest;
  unresolved: InstallManifestUnresolved[];
};

/** POST /v1/guilds/{guild_id}/builds/{build_id}/manifest/refresh */
export async function refreshGuildBuildInstallManifest(
  guildId: string,
  buildId: string,
): Promise<RefreshInstallManifestResult> {
  try {
    const raw = await sendMutate(
      "guilds",
      "refresh_guild_build_install_manifest",
      { guild_id: guildId, build_id: buildId },
      "POST",
    );
    const unresolved = parseUnresolvedPins(raw);
    let manifest: BuildManifest;
    try {
      manifest = parseGuildInstallManifest(raw, buildId);
    } catch (parseErr) {
      if (unresolved.length) {
        manifest = {
          schemaVersion: 1,
          releaseId: buildId,
          generatedAt: new Date().toISOString(),
          excludes: ["saves/**"],
          files: [],
        };
      } else {
        throw parseErr;
      }
    }
    return { manifest, unresolved };
  } catch (err) {
    throw wrapError("Could not refresh guild build install manifest", err);
  }
}

/** POST /v1/guilds/{guild_id}/builds/manifest/backfill */
export async function backfillGuildBuildInstallManifests(
  guildId: string,
  opts?: { force?: boolean; limit?: number },
): Promise<unknown> {
  try {
    return await sendMutate(
      "guilds",
      "backfill_install_manifests_for_existing_published_builds",
      {
        guild_id: guildId,
        force: opts?.force ?? false,
        limit: opts?.limit ?? 200,
      },
      "POST",
    );
  } catch (err) {
    throw wrapError("Could not backfill guild build install manifests", err);
  }
}

function projectKeyFromRef(ref: GuildBuildModRef): string | null {
  const raw = (ref.slug || "").trim() || (ref.name || "").trim();
  if (!raw) return null;
  if (/^cf-datapack:/i.test(raw)) {
    const stripped = raw.replace(/^cf-datapack:/i, "").trim();
    return stripped || null;
  }
  return raw;
}

function isDatapackRef(ref: GuildBuildModRef): boolean {
  const raw = (ref.slug || ref.name || "").trim();
  return /^cf-datapack:/i.test(raw);
}

function destForRef(
  ref: GuildBuildModRef,
  hint: string | undefined,
  projectType: string,
): ReturnType<typeof destKindForProjectType> {
  if (isDatapackRef(ref)) return "datapacks";
  if (hint === "shader") return "shaderpacks";
  if (hint === "resourcepack") return "resourcepacks";
  if (hint === "datapack") return "datapacks";
  return destKindForProjectType(projectType);
}

function kindForDest(
  dest: ReturnType<typeof destKindForProjectType>,
): BuildContentKind {
  switch (dest) {
    case "resourcepacks":
      return "resource-pack";
    case "shaderpacks":
      return "shader";
    case "datapacks":
      return "config";
    default:
      return "mod";
  }
}

function primaryModrinthFile(version: ModrinthVersion) {
  return version.files.find((f) => f.primary) ?? version.files[0] ?? null;
}

async function resolveVersionForRef(
  projectId: string,
  ref: GuildBuildModRef,
  gameVersion?: string,
  loader?: string,
): Promise<ModrinthVersion> {
  const pinned = (ref.version || "").trim();
  if (pinned) {
    // Prefer exact Modrinth version id when it looks like one.
    if (/^[A-Za-z0-9]{6,}$/.test(pinned) && !pinned.includes(".")) {
      try {
        const byId = await getModrinthVersion(pinned);
        if (byId.project_id === projectId || !byId.project_id) return byId;
      } catch {
        /* fall through to version_number match */
      }
    }
  }

  const filtered = await getModrinthVersions(projectId, {
    gameVersions: gameVersion ? [gameVersion] : undefined,
    loaders: loader ? [loader] : undefined,
  });
  if (pinned) {
    const byNumber = filtered.find(
      (v) => v.version_number === pinned || v.name === pinned || v.id === pinned,
    );
    if (byNumber) return byNumber;
  }
  const compatible =
    filtered.find((v) => versionMatchesFilters(v, gameVersion, loader)) ??
    filtered[0];
  if (compatible) return compatible;

  const all = await getModrinthVersions(projectId);
  if (pinned) {
    const byNumber = all.find(
      (v) => v.version_number === pinned || v.name === pinned || v.id === pinned,
    );
    if (byNumber) return byNumber;
  }
  const fallback = all.find((v) =>
    versionMatchesFilters(v, gameVersion, loader),
  );
  if (!fallback) {
    throw new Error(`No compatible Modrinth version for ${projectId}`);
  }
  return fallback;
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

/**
 * Build an install file plan from the live GuildBuild catalog row
 * (required_mods / optional_mods / shaders / resource_packs → Modrinth files).
 */
export async function resolveCatalogInstallManifest(
  release: GuildBuildRelease,
): Promise<BuildManifest> {
  const gameVersion = release.dependencies.minecraft;
  const loader = release.dependencies.loader;
  const buckets: Array<{
    refs: GuildBuildModRef[];
    hint?: string;
  }> = [
    { refs: release.requiredMods ?? [], hint: "mod" },
    { refs: release.optionalMods ?? [], hint: "mod" },
    { refs: release.shaders ?? [], hint: "shader" },
    { refs: release.resourcePacks ?? [], hint: "resourcepack" },
  ];

  type Work = { ref: GuildBuildModRef; hint?: string };
  const work: Work[] = [];
  for (const bucket of buckets) {
    for (const ref of bucket.refs) {
      if (projectKeyFromRef(ref)) work.push({ ref, hint: bucket.hint });
    }
  }

  if (work.length === 0) {
    if (release.downloadUrl?.trim()) {
      throw new GuildBuildApiError(
        "This build only has download_url (pack zip). Catalog mod lists are empty, so the launcher cannot resolve individual files yet.",
        422,
      );
    }
    throw new GuildBuildApiError(
      "This build has no Modrinth content refs and no download_url to install.",
      422,
    );
  }

  const seenProjects = new Set<string>();
  const files: BuildManifestFile[] = [];
  const errors: string[] = [];

  const resolved = await mapPool(work, 6, async ({ ref, hint }) => {
    const key = projectKeyFromRef(ref)!;
    try {
      const project = await getModrinthProject(key);
      if (seenProjects.has(project.id)) return null;
      seenProjects.add(project.id);
      const version = await resolveVersionForRef(
        project.id,
        ref,
        gameVersion,
        hint === "mod" ? loader : undefined,
      );
      const file = primaryModrinthFile(version);
      if (!file?.url || !file.hashes.sha512) {
        throw new Error(`Missing download/hash for ${project.title}`);
      }
      // Pull required deps once.
      const depProjects: string[] = [];
      for (const dep of version.dependencies ?? []) {
        if (dep.dependency_type !== "required" || !dep.project_id) continue;
        if (seenProjects.has(dep.project_id)) continue;
        depProjects.push(dep.project_id);
      }
      const dest = destForRef(ref, hint, project.project_type);
      const entry: BuildManifestFile = {
        path: `${dest}/${file.filename}`,
        kind: kindForDest(dest),
        environment: "both",
        downloads: [file.url],
        sizeBytes: file.size,
        hashes: {
          sha256: file.hashes.sha1 || "0".repeat(64),
          sha512: file.hashes.sha512,
        },
      };
      return { entry, depProjects, projectType: project.project_type };
    } catch (err) {
      errors.push(
        `${ref.name || key}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  });

  for (const row of resolved) {
    if (!row) continue;
    files.push(row.entry);
  }

  // Resolve required deps discovered above (second pass, still pooled).
  const depIds = [
    ...new Set(
      resolved.flatMap((row) => (row ? row.depProjects : [])).filter(Boolean),
    ),
  ].filter((id) => !seenProjects.has(id));

  if (depIds.length) {
    const depFiles = await mapPool(depIds, 6, async (projectId) => {
      if (seenProjects.has(projectId)) return null;
      seenProjects.add(projectId);
      try {
        const project = await getModrinthProject(projectId);
        const version = await resolveVersionForRef(
          project.id,
          { name: project.title },
          gameVersion,
          loader,
        );
        const file = primaryModrinthFile(version);
        if (!file?.url || !file.hashes.sha512) return null;
        const dest = destKindForProjectType(project.project_type);
        return {
          path: `${dest}/${file.filename}`,
          kind: kindForDest(dest),
          environment: "both" as const,
          downloads: [file.url],
          sizeBytes: file.size,
          hashes: {
            sha256: file.hashes.sha1 || "0".repeat(64),
            sha512: file.hashes.sha512,
          },
        } satisfies BuildManifestFile;
      } catch (err) {
        errors.push(
          `dep ${projectId}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      }
    });
    for (const f of depFiles) {
      if (f) files.push(f);
    }
  }

  if (files.length === 0) {
    throw new GuildBuildApiError(
      `Could not resolve catalog content from Modrinth (${errors.slice(0, 3).join("; ") || "no files"}).`,
      502,
    );
  }

  const deduped = new Map<string, BuildManifestFile>();
  for (const file of files) {
    deduped.set(file.path.toLowerCase(), file);
  }

  return {
    schemaVersion: 1,
    releaseId: release.id,
    // Stable across resolves so we do not treat every catalog rebuild as a new install.
    generatedAt:
      release.publishedAtIso ||
      release.publishedAt ||
      `${release.id}:${release.version || "0"}`,
    excludes: [...new Set([...(release.excludes ?? []), "saves/**"])],
    files: [...deduped.values()],
  };
}

/**
 * Prefer guilds install-manifest API, then legacy api host, then Modrinth
 * resolve from the GuildBuild catalog row.
 */
export async function resolveGuildInstallManifest(
  release: GuildBuildRelease,
): Promise<BuildManifest> {
  if (release.guildId && release.id) {
    try {
      return await fetchGuildBuildInstallManifest(release.guildId, release.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("get_guild_build_install_manifest failed:", msg);
    }
  }

  try {
    return await fetchBuildManifest(release.id);
  } catch (err) {
    const soft =
      err instanceof GuildBuildApiError &&
      (err.status === 404 || err.status === 501 || err.status === 502);
    const msg = err instanceof Error ? err.message : String(err);
    if (!soft && !/not available|not found|Command .* not found/i.test(msg)) {
      console.warn("get_build_manifest failed; using catalog resolve", msg);
    }
  }
  return resolveCatalogInstallManifest(release);
}

export async function refreshGuildBuildsCache(
  guildId: string,
  releases: GuildBuildRelease[],
): Promise<void> {
  await writeApiCache(CacheKeys.guildBuilds(guildId), releases);
}

export { invalidateGuildCaches };

/** Parse Manage form lines: name|slug|version|source_url */
export function parseModRefsDraft(draft: string): GuildBuildModRef[] {
  const out: GuildBuildModRef[] = [];
  for (const line of draft.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [name, slug, version, sourceUrl] = trimmed
      .split("|")
      .map((p) => p.trim());
    if (!name) continue;
    const ref: GuildBuildModRef = { name };
    if (slug) ref.slug = slug;
    if (version) ref.version = version;
    if (sourceUrl) ref.sourceUrl = sourceUrl;
    out.push(ref);
  }
  return out;
}

export function formatModRefsDraft(refs: GuildBuildModRef[] | undefined): string {
  if (!refs?.length) return "";
  return refs
    .map((m) =>
      [m.name, m.slug ?? "", m.version ?? "", m.sourceUrl ?? ""].join("|"),
    )
    .join("\n");
}
