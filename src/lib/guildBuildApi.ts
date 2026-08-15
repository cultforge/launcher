import { ClientHttpError, send, sendMutate } from "./client";
import {
  CacheKeys,
  cachedRead,
  invalidateGuildCaches,
  writeApiCache,
} from "./apiCache";
import type {
  BuildManifest,
  GuildBuildModRef,
  GuildBuildRelease,
} from "../types/buildManifest";

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
  for (const key of ["data", "items", "builds", "releases"]) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
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

function parseModRefs(raw: unknown): GuildBuildModRef[] {
  if (!Array.isArray(raw)) return [];
  const out: GuildBuildModRef[] = [];
  for (const row of raw) {
    const obj = asRecord(row);
    if (!obj) continue;
    const name = String(obj.name ?? "").trim();
    if (!name) continue;
    const ref: GuildBuildModRef = { name };
    if (typeof obj.slug === "string" && obj.slug.trim()) {
      ref.slug = obj.slug.trim();
    }
    if (typeof obj.version === "string" && obj.version.trim()) {
      ref.version = obj.version.trim();
    }
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

function modRefsToApi(refs: GuildBuildModRef[] | undefined): unknown[] | undefined {
  if (refs === undefined) return undefined;
  return refs.map((m) => ({
    name: m.name,
    ...(m.slug ? { slug: m.slug } : {}),
    ...(m.version ? { version: m.version } : {}),
    ...(m.sourceUrl ? { source_url: m.sourceUrl } : {}),
  }));
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
): GuildBuildRelease | null {
  const obj = asRecord(row);
  if (!obj) return null;
  const id = String(obj.id ?? "").trim();
  const guildId = String(obj.guild_id ?? obj.guildId ?? "").trim();
  const name = String(obj.name ?? "").trim();
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
      downloadBytes: Number(obj.download_bytes ?? obj.downloadBytes ?? 0) || 0,
      installedBytes: Number(obj.installed_bytes ?? obj.installedBytes ?? 0) || 0,
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
        return unwrapList(raw)
          .map(releaseFromGuildBuildRecord)
          .filter((x): x is GuildBuildRelease => Boolean(x));
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
      releaseFromGuildBuildRecord(unwrapOne(data)) ??
      releaseFromGuildBuildRecord(data);
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
      "upload_guild_build_icon",
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
      "upload_guild_build_cover",
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
    let row = releaseFromGuildBuildRecord(unwrapOne(data));
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
    let row = releaseFromGuildBuildRecord(unwrapOne(data));
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
 * File install manifest — still provisional on some hosts.
 * Kept as soft dependency for reconcile; may 404 until api ships it.
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
        "Guild install needs the remote build manifest API (not available yet). Catalog save still works.",
        status || 404,
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (/404|not found|manifest/i.test(msg)) {
      throw new GuildBuildApiError(
        "Guild install needs the remote build manifest API (not available yet). Catalog save still works.",
        404,
      );
    }
    throw wrapError("Could not fetch build manifest", err);
  }
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
