import { ClientHttpError, send, sendMutate } from "./client";
import {
  CacheKeys,
  cachedRead,
  invalidateApiCache,
  invalidateGuildCaches,
} from "./apiCache";
import type { GuildServer } from "../data/guilds";
import {
  guildMediaUploadBody,
  type GuildBuildImageUpload,
} from "./guildBuildApi";

export class GuildServersError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "GuildServersError";
    this.status = status;
  }
}

export type ServerJoinResult = {
  serverId: string;
  guildId: string;
  canJoin: boolean;
  requiredBuild: string;
  message: string;
  connect?: Record<string, unknown> | null;
  deepLink?: string;
  missingMods?: unknown[];
};

export type GuildServerWritePayload = {
  name: string;
  description?: string;
  serverAddress: string;
  port?: number;
  requiredBuild?: string;
  buildId?: string;
  isActive?: boolean;
  iconUrl?: string | null;
  coverUrl?: string | null;
  iconUpload?: GuildBuildImageUpload | null;
  coverUpload?: GuildBuildImageUpload | null;
};

function wrap(prefix: string, err: unknown): GuildServersError {
  if (err instanceof ClientHttpError) {
    return new GuildServersError(`${prefix}: ${err.message}`, err.status);
  }
  if (err instanceof GuildServersError) return err;
  return new GuildServersError(
    `${prefix}: ${err instanceof Error ? err.message : String(err)}`,
  );
}

function asRecord(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : null;
}

function unwrapList(data: unknown, keys: string[]): unknown[] {
  if (Array.isArray(data)) return data;
  const obj = asRecord(data);
  if (!obj) return [];
  for (const key of keys) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  return [];
}

function unwrapOne(data: unknown, keys: string[]): unknown {
  const obj = asRecord(data);
  if (!obj) return data;
  for (const key of keys) {
    if (obj[key] !== undefined) return obj[key];
  }
  return data;
}

function pickHttpUrl(...candidates: unknown[]): string | null {
  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
  }
  return null;
}

const CF_SERVER_META_RE = /\n?<!--cf\s+([^>]*)-->\s*$/i;

export function parseServerExtras(description: string): {
  description: string;
  region: string;
  tags: string[];
  status: GuildServer["status"] | null;
} {
  const text = String(description ?? "");
  const match = text.match(CF_SERVER_META_RE);
  if (!match) {
    return { description: text, region: "", tags: [], status: null };
  }
  const attrs = match[1] ?? "";
  const region = /(?:^|\s)region=([^\s]+)/i.exec(attrs)?.[1] ?? "";
  const tagsRaw = /(?:^|\s)tags=([^\s]+)/i.exec(attrs)?.[1] ?? "";
  const statusRaw = /(?:^|\s)status=(online|offline|maintenance)/i.exec(
    attrs,
  )?.[1];
  return {
    description: text.replace(CF_SERVER_META_RE, "").trim(),
    region: safeDecode(region),
    tags: tagsRaw
      ? tagsRaw
          .split(",")
          .map((tag) => safeDecode(tag.trim()))
          .filter(Boolean)
      : [],
    status: statusRaw
      ? (statusRaw.toLowerCase() as GuildServer["status"])
      : null,
  };
}

export function encodeServerExtras(
  description: string,
  region: string,
  tags: string[],
  status: GuildServer["status"],
): string {
  const body = String(description ?? "").replace(CF_SERVER_META_RE, "").trim();
  const parts: string[] = [];
  if (region.trim()) parts.push(`region=${encodeURIComponent(region.trim())}`);
  if (tags.length) {
    parts.push(
      `tags=${tags
        .map((tag) => encodeURIComponent(tag.trim()))
        .filter(Boolean)
        .join(",")}`,
    );
  }
  if (status && status !== "online") parts.push(`status=${status}`);
  if (!parts.length) return body;
  const meta = `<!--cf ${parts.join(" ")}-->`;
  return body ? `${body}\n${meta}` : meta;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function serverFromApiRecord(raw: unknown): GuildServer | null {
  const obj = asRecord(raw);
  if (!obj || typeof obj.id !== "string") return null;
  const guildId = String(obj.guild_id ?? "");
  const name = String(obj.name ?? "").trim();
  if (!guildId || !name) return null;

  const configuredHost = String(
    obj.configured_address ??
      obj.configuredAddress ??
      obj.server_address ??
      obj.address ??
      "",
  ).trim();
  const configuredPort =
    typeof obj.configured_port === "number"
      ? obj.configured_port
      : typeof obj.configuredPort === "number"
        ? obj.configuredPort
        : typeof obj.port === "number"
          ? obj.port
          : 25565;

  const effectiveHost = String(
    obj.effective_address ??
      obj.effectiveAddress ??
      obj.tunnel_address ??
      obj.tunnelAddress ??
      "",
  ).trim();
  const effectivePort =
    typeof obj.effective_port === "number"
      ? obj.effective_port
      : typeof obj.effectivePort === "number"
        ? obj.effectivePort
        : typeof obj.tunnel_port === "number"
          ? obj.tunnel_port
          : typeof obj.tunnelPort === "number"
            ? obj.tunnelPort
            : undefined;

  const addressSourceRaw = String(
    obj.address_source ?? obj.addressSource ?? "",
  )
    .trim()
    .toLowerCase();

  const configuredAddress =
    configuredHost && !configuredHost.includes(":")
      ? `${configuredHost}:${configuredPort}`
      : configuredHost;

  let effectiveAddress: string | undefined;
  if (effectiveHost) {
    effectiveAddress = effectiveHost.includes(":")
      ? effectiveHost
      : `${effectiveHost}:${effectivePort ?? 25565}`;
  }

  const useTunnel =
    addressSourceRaw === "tunnel" ||
    (Boolean(effectiveAddress) &&
      effectiveAddress !== configuredAddress &&
      addressSourceRaw !== "configured");

  const address =
    useTunnel && effectiveAddress
      ? effectiveAddress
      : configuredAddress || effectiveAddress || "";

  const extras = parseServerExtras(String(obj.description ?? ""));
  const active = obj.is_active !== false;
  const iconUrl = pickHttpUrl(
    obj.icon_url,
    obj.iconUrl,
    obj.icon,
    obj.thumbnail_icon,
  );
  const coverUrl = pickHttpUrl(
    obj.cover_url,
    obj.coverUrl,
    obj.cover,
    obj.thumbnail_url,
    obj.thumbnail,
    obj.image_url,
    obj.image,
  );
  const catalogStatus: GuildServer["status"] = !active
    ? "offline"
    : extras.status === "maintenance"
      ? "maintenance"
      : extras.status === "offline"
        ? "offline"
        : "online";

  const tunnelUpdatedAt =
    typeof obj.tunnel_updated_at === "string"
      ? obj.tunnel_updated_at
      : typeof obj.tunnelUpdatedAt === "string"
        ? obj.tunnelUpdatedAt
        : null;

  const preferredAgentNodeId = String(
    obj.preferred_agent_node_id ??
      obj.preferredAgentNodeId ??
      obj.primary_agent_node_id ??
      "",
  ).trim();

  return {
    id: obj.id,
    guildId,
    name,
    address,
    configuredAddress: configuredAddress || undefined,
    configuredPort,
    effectiveAddress,
    effectivePort: effectivePort ?? undefined,
    addressSource: useTunnel
      ? "tunnel"
      : addressSourceRaw || (configuredAddress ? "configured" : undefined),
    tunnelUpdatedAt,
    playersOnline: 0,
    playersMax: 0,
    pingMs: 0,
    version: String(obj.required_build ?? obj.game ?? ""),
    region: extras.region,
    description: extras.description,
    thumbnail: coverUrl || iconUrl || "",
    iconUrl,
    coverUrl,
    tags: extras.tags,
    loader: "",
    status: catalogStatus,
    requiredBuildId: String(obj.build_id ?? ""),
    requiredBuildVersion: String(obj.required_build ?? ""),
    preferredAgentNodeId: preferredAgentNodeId || null,
  };
}

/** POST /v1/guilds/{guild_id}/servers/{server_id}/icon */
export async function uploadGuildServerIcon(
  guildId: string,
  serverId: string,
  upload: GuildBuildImageUpload,
): Promise<void> {
  try {
    await sendMutate(
      "guilds",
      "upload_or_set_server_icon",
      {
        guild_id: guildId,
        server_id: serverId,
        ...guildMediaUploadBody(upload),
      },
      "POST",
    );
  } catch (err) {
    throw wrap("Could not upload server icon", err);
  }
}

/** POST /v1/guilds/{guild_id}/servers/{server_id}/cover */
export async function uploadGuildServerCover(
  guildId: string,
  serverId: string,
  upload: GuildBuildImageUpload,
): Promise<void> {
  try {
    await sendMutate(
      "guilds",
      "upload_or_set_server_cover_image",
      {
        guild_id: guildId,
        server_id: serverId,
        ...guildMediaUploadBody(upload),
      },
      "POST",
    );
  } catch (err) {
    throw wrap("Could not upload server cover", err);
  }
}

async function applyServerImageUploads(
  guildId: string,
  serverId: string,
  payload: Pick<GuildServerWritePayload, "iconUpload" | "coverUpload">,
): Promise<void> {
  if (payload.iconUpload) {
    await uploadGuildServerIcon(guildId, serverId, payload.iconUpload);
  }
  if (payload.coverUpload) {
    await uploadGuildServerCover(guildId, serverId, payload.coverUpload);
  }
}

async function refetchServer(
  guildId: string,
  serverId: string,
): Promise<GuildServer | null> {
  try {
    const raw = await send<unknown>("guilds", "get_guild_server", {
      guild_id: guildId,
      server_id: serverId,
    });
    return serverFromApiRecord(unwrapOne(raw, ["data", "server"]));
  } catch {
    return null;
  }
}

export async function fetchGuildServers(
  guildId: string,
): Promise<GuildServer[]> {
  try {
    const { data } = await cachedRead({
      key: CacheKeys.guildServers(guildId),
      fetcher: async () => {
        const raw = await send<unknown>("guilds", "list_guild_servers", {
          guild_id: guildId,
        });
        return unwrapList(raw, ["data", "servers"])
          .map(serverFromApiRecord)
          .filter((x): x is GuildServer => Boolean(x));
      },
    });
    return data;
  } catch (err) {
    throw wrap("Could not list guild servers", err);
  }
}

export async function createGuildServer(
  guildId: string,
  input: GuildServerWritePayload,
): Promise<GuildServer> {
  try {
    const data = await sendMutate(
      "guilds",
      "create_guild_server",
      {
        guild_id: guildId,
        name: input.name,
        description: input.description,
        server_address: input.serverAddress,
        port: input.port ?? 25565,
        required_build: input.requiredBuild ?? "any",
        build_id: input.buildId,
        is_active: input.isActive ?? true,
        icon_url: input.iconUpload ? null : (input.iconUrl ?? null),
        cover_url: input.coverUpload ? null : (input.coverUrl ?? null),
      },
      "POST",
    );
    let server = serverFromApiRecord(unwrapOne(data, ["data", "server"]));
    if (!server) throw new GuildServersError("Create server response malformed", 502);
    if (input.iconUpload || input.coverUpload) {
      try {
        await applyServerImageUploads(guildId, server.id, input);
        server = (await refetchServer(guildId, server.id)) ?? server;
      } catch (err) {
        // URL fields may still apply; dedicated upload routes are newer.
        if (!(err instanceof GuildServersError && err.status === 404)) {
          throw err;
        }
      }
    }
    await invalidateApiCache(CacheKeys.guildServers(guildId));
    return server;
  } catch (err) {
    throw wrap("Could not create server", err);
  }
}

export async function updateGuildServer(
  guildId: string,
  serverId: string,
  patch: Record<string, unknown> &
    Pick<
      GuildServerWritePayload,
      "iconUrl" | "coverUrl" | "iconUpload" | "coverUpload"
    >,
): Promise<GuildServer> {
  try {
    const body: Record<string, unknown> = {
      guild_id: guildId,
      server_id: serverId,
    };
    for (const [key, value] of Object.entries(patch)) {
      if (
        key === "iconUrl" ||
        key === "coverUrl" ||
        key === "iconUpload" ||
        key === "coverUpload"
      ) {
        continue;
      }
      body[key] = value;
    }
    if (patch.iconUpload) {
      // dedicated upload owns bytes
    } else if (patch.iconUrl !== undefined) {
      body.icon_url = patch.iconUrl;
    }
    if (patch.coverUpload) {
      // dedicated upload owns bytes
    } else if (patch.coverUrl !== undefined) {
      body.cover_url = patch.coverUrl;
    }
    const data = await sendMutate(
      "guilds",
      "update_guild_server",
      body,
      "PATCH",
    );
    let server = serverFromApiRecord(unwrapOne(data, ["data", "server"]));
    if (!server) throw new GuildServersError("Update server response malformed", 502);
    if (patch.iconUpload || patch.coverUpload) {
      try {
        await applyServerImageUploads(guildId, serverId, patch);
        server = (await refetchServer(guildId, serverId)) ?? server;
      } catch (err) {
        if (!(err instanceof GuildServersError && err.status === 404)) {
          throw err;
        }
      }
    }
    await invalidateApiCache(CacheKeys.guildServers(guildId));
    return server;
  } catch (err) {
    throw wrap("Could not update server", err);
  }
}

export async function deleteGuildServer(
  guildId: string,
  serverId: string,
): Promise<void> {
  try {
    await sendMutate(
      "guilds",
      "delete_guild_server",
      { guild_id: guildId, server_id: serverId },
      "DELETE",
    );
    await invalidateApiCache(CacheKeys.guildServers(guildId));
  } catch (err) {
    throw wrap("Could not delete server", err);
  }
}

export async function fetchServerRequirements(
  guildId: string,
  serverId: string,
): Promise<unknown> {
  try {
    return await send("guilds", "check_server_join_requirements", {
      guild_id: guildId,
      server_id: serverId,
    });
  } catch (err) {
    throw wrap("Could not load join requirements", err);
  }
}

export async function joinGuildServer(
  guildId: string,
  serverId: string,
  opts?: { clientBuild?: string; installedMods?: unknown[] },
): Promise<ServerJoinResult> {
  try {
    const data = await sendMutate(
      "guilds",
      "join_guild_game_server_(requirements_check_+_connect_payload)",
      {
        guild_id: guildId,
        server_id: serverId,
        client_build: opts?.clientBuild,
        installed_mods: opts?.installedMods ?? [],
      },
      "POST",
    );
    const payload = asRecord(unwrapOne(data, ["data", "result"])) ?? asRecord(data);
    if (!payload) throw new GuildServersError("Join response malformed", 502);
    const connect = asRecord(payload.connect);
    // Prefer API effective join host when present on connect payload.
    if (connect) {
      const effHost = String(
        connect.address ??
          connect.effective_address ??
          connect.effectiveAddress ??
          connect.host ??
          "",
      ).trim();
      const effPort =
        typeof connect.effective_port === "number"
          ? connect.effective_port
          : typeof connect.effectivePort === "number"
            ? connect.effectivePort
            : typeof connect.port === "number"
              ? connect.port
              : undefined;
      if (effHost) {
        connect.host = effHost.includes(":")
          ? effHost
          : `${effHost}:${effPort ?? 25565}`;
        if (effPort != null) connect.port = effPort;
      }
    }
    return {
      serverId: String(payload.server_id ?? serverId),
      guildId: String(payload.guild_id ?? guildId),
      canJoin: Boolean(payload.can_join),
      requiredBuild: String(payload.required_build ?? ""),
      message: String(payload.message ?? ""),
      connect,
      deepLink:
        typeof payload.deep_link === "string" ? payload.deep_link : undefined,
      missingMods: Array.isArray(payload.missing_mods)
        ? payload.missing_mods
        : [],
    };
  } catch (err) {
    throw wrap("Could not join server", err);
  }
}

void invalidateGuildCaches;
