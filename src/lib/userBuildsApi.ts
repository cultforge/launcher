import { ClientHttpError, send, sendMutate } from "./client";
import type { UserBuildRecord } from "../types/catalog";
import type { GuildBuildModRef } from "../types/buildManifest";
import { modRefsToApi, parseModRefs } from "./guildBuildApi";

export class UserBuildApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "UserBuildApiError";
    this.status = status;
  }
}

function wrap(prefix: string, err: unknown): UserBuildApiError {
  if (err instanceof ClientHttpError)
    return new UserBuildApiError(`${prefix}: ${err.message}`, err.status);
  if (err instanceof UserBuildApiError) return err;
  return new UserBuildApiError(
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

function unwrapOne(data: unknown): unknown {
  const obj = asRecord(data);
  if (!obj) return data;
  for (const key of ["data", "build", "item"]) {
    if (obj[key] !== undefined) return obj[key];
  }
  return data;
}

function recordFromApi(raw: unknown): UserBuildRecord | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const id = String(obj.id ?? "").trim();
  const name = String(obj.name ?? "").trim();
  if (!id || !name) return null;
  return {
    id,
    ownerId: String(obj.owner_id ?? ""),
    name,
    minecraftVersion: String(obj.minecraft_version ?? ""),
    loader: String(obj.loader ?? "fabric"),
    tagline: typeof obj.tagline === "string" ? obj.tagline : undefined,
    description: typeof obj.description === "string" ? obj.description : undefined,
    downloadUrl: typeof obj.download_url === "string" ? obj.download_url : undefined,
    sourceUrl: typeof obj.source_url === "string" ? obj.source_url : undefined,
    iconUrl: typeof obj.icon_url === "string" ? obj.icon_url : undefined,
    coverUrl: typeof obj.cover_url === "string" ? obj.cover_url : undefined,
    isPublished: obj.is_published !== false,
    isPublicCatalog: Boolean(obj.is_public_catalog),
    keywords: Array.isArray(obj.keywords)
      ? (obj.keywords as string[]).filter((k) => typeof k === "string")
      : [],
    hasInstallManifest: Boolean(obj.has_install_manifest),
    isInstallable: Boolean(obj.is_installable),
    installMode: typeof obj.install_mode === "string" ? obj.install_mode : undefined,
    requiredMods: parseModRefs(obj.required_mods ?? obj.requiredMods),
    optionalMods: parseModRefs(obj.optional_mods ?? obj.optionalMods),
    shaders: parseModRefs(obj.shaders),
    resourcePacks: parseModRefs(obj.resource_packs ?? obj.resourcePacks),
    createdAt:
      typeof obj.created_at === "string"
        ? obj.created_at
        : new Date().toISOString(),
    updatedAt:
      typeof obj.updated_at === "string" ? obj.updated_at : undefined,
  };
}

export async function listMyBuilds(): Promise<UserBuildRecord[]> {
  try {
    const raw = await send<unknown>("api", "list_my_builds");
    return unwrapList(raw)
      .map(recordFromApi)
      .filter((x): x is UserBuildRecord => Boolean(x));
  } catch (err) {
    throw wrap("Could not list your builds", err);
  }
}

export async function fetchMyBuild(buildId: string): Promise<UserBuildRecord> {
  try {
    const raw = await send<unknown>("api", "get_my_build", {
      build_id: buildId,
    });
    const record = recordFromApi(unwrapOne(raw));
    if (!record) throw new UserBuildApiError("Build not found", 404);
    return record;
  } catch (err) {
    throw wrap("Could not fetch build", err);
  }
}

export type UserBuildWritePayload = {
  name: string;
  minecraftVersion?: string;
  loader?: string;
  tagline?: string;
  description?: string;
  downloadUrl?: string;
  sourceUrl?: string;
  isPublished?: boolean;
  isPublicCatalog?: boolean;
  keywords?: string[];
  requiredMods?: GuildBuildModRef[];
  optionalMods?: GuildBuildModRef[];
  shaders?: GuildBuildModRef[];
  resourcePacks?: GuildBuildModRef[];
};

export async function createUserBuild(
  payload: UserBuildWritePayload,
): Promise<UserBuildRecord> {
  try {
    const body: Record<string, unknown> = { name: payload.name };
    if (payload.minecraftVersion) body.minecraft_version = payload.minecraftVersion;
    if (payload.loader) body.loader = payload.loader;
    if (payload.tagline !== undefined) body.tagline = payload.tagline;
    if (payload.description !== undefined) body.description = payload.description;
    if (payload.downloadUrl !== undefined) body.download_url = payload.downloadUrl;
    if (payload.sourceUrl !== undefined) body.source_url = payload.sourceUrl;
    if (payload.isPublished !== undefined) body.is_published = payload.isPublished;
    if (payload.isPublicCatalog !== undefined) body.is_public_catalog = payload.isPublicCatalog;
    if (payload.keywords !== undefined) body.keywords = payload.keywords;
    if (payload.requiredMods !== undefined) {
      body.required_mods = modRefsToApi(payload.requiredMods) ?? [];
    }
    if (payload.optionalMods !== undefined) {
      body.optional_mods = modRefsToApi(payload.optionalMods) ?? [];
    }
    if (payload.shaders !== undefined) {
      body.shaders = modRefsToApi(payload.shaders) ?? [];
    }
    if (payload.resourcePacks !== undefined) {
      body.resource_packs = modRefsToApi(payload.resourcePacks) ?? [];
    }
    const raw = await sendMutate("api", "create_user_build", body, "POST");
    const record = recordFromApi(unwrapOne(raw));
    if (!record) throw new UserBuildApiError("Create build response malformed", 502);
    return record;
  } catch (err) {
    throw wrap("Could not create build", err);
  }
}

export async function updateUserBuild(
  buildId: string,
  payload: Partial<UserBuildWritePayload>,
): Promise<UserBuildRecord> {
  try {
    const body: Record<string, unknown> = { build_id: buildId };
    if (payload.name !== undefined) body.name = payload.name;
    if (payload.minecraftVersion !== undefined) body.minecraft_version = payload.minecraftVersion;
    if (payload.loader !== undefined) body.loader = payload.loader;
    if (payload.tagline !== undefined) body.tagline = payload.tagline;
    if (payload.description !== undefined) body.description = payload.description;
    if (payload.downloadUrl !== undefined) body.download_url = payload.downloadUrl;
    if (payload.sourceUrl !== undefined) body.source_url = payload.sourceUrl;
    if (payload.isPublished !== undefined) body.is_published = payload.isPublished;
    if (payload.isPublicCatalog !== undefined) body.is_public_catalog = payload.isPublicCatalog;
    if (payload.keywords !== undefined) body.keywords = payload.keywords;
    if (payload.requiredMods !== undefined) {
      body.required_mods = modRefsToApi(payload.requiredMods) ?? [];
    }
    if (payload.optionalMods !== undefined) {
      body.optional_mods = modRefsToApi(payload.optionalMods) ?? [];
    }
    if (payload.shaders !== undefined) {
      body.shaders = modRefsToApi(payload.shaders) ?? [];
    }
    if (payload.resourcePacks !== undefined) {
      body.resource_packs = modRefsToApi(payload.resourcePacks) ?? [];
    }
    const raw = await sendMutate("api", "update_my_build", body, "PATCH");
    const record = recordFromApi(unwrapOne(raw));
    if (!record) throw new UserBuildApiError("Update build response malformed", 502);
    return record;
  } catch (err) {
    throw wrap("Could not update build", err);
  }
}

export async function deleteUserBuild(buildId: string): Promise<void> {
  try {
    await sendMutate("api", "delete_my_build", { build_id: buildId }, "DELETE");
  } catch (err) {
    throw wrap("Could not delete build", err);
  }
}
