import { ClientHttpError, send, sendMutate } from "./client";
import {
  CacheKeys,
  cachedRead,
  invalidateApiCache,
  invalidateGuildCaches,
} from "./apiCache";
import type { GuildServer } from "../data/guilds";

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
  const address = String(obj.server_address ?? obj.address ?? "");
  const port = typeof obj.port === "number" ? obj.port : 25565;
  const extras = parseServerExtras(String(obj.description ?? ""));
  const active = obj.is_active !== false;
  return {
    id: obj.id,
    guildId,
    name,
    address: port && address && !address.includes(":")
      ? `${address}:${port}`
      : address,
    playersOnline: 0,
    playersMax: 0,
    pingMs: 0,
    version: String(obj.required_build ?? obj.game ?? ""),
    region: extras.region,
    description: extras.description,
    thumbnail: "",
    tags: extras.tags,
    loader: "",
    status: active
      ? "online"
      : extras.status === "maintenance"
        ? "maintenance"
        : "offline",
    requiredBuildId: String(obj.build_id ?? ""),
    requiredBuildVersion: String(obj.required_build ?? ""),
  };
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
  input: {
    name: string;
    description?: string;
    serverAddress: string;
    port?: number;
    requiredBuild?: string;
    buildId?: string;
    isActive?: boolean;
  },
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
      },
      "POST",
    );
    await invalidateApiCache(CacheKeys.guildServers(guildId));
    const server = serverFromApiRecord(unwrapOne(data, ["data", "server"]));
    if (!server) throw new GuildServersError("Create server response malformed", 502);
    return server;
  } catch (err) {
    throw wrap("Could not create server", err);
  }
}

export async function updateGuildServer(
  guildId: string,
  serverId: string,
  patch: Record<string, unknown>,
): Promise<GuildServer> {
  try {
    const data = await sendMutate(
      "guilds",
      "update_guild_server",
      { guild_id: guildId, server_id: serverId, ...patch },
      "PATCH",
    );
    await invalidateApiCache(CacheKeys.guildServers(guildId));
    const server = serverFromApiRecord(unwrapOne(data, ["data", "server"]));
    if (!server) throw new GuildServersError("Update server response malformed", 502);
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
    return {
      serverId: String(payload.server_id ?? serverId),
      guildId: String(payload.guild_id ?? guildId),
      canJoin: Boolean(payload.can_join),
      requiredBuild: String(payload.required_build ?? ""),
      message: String(payload.message ?? ""),
      connect: asRecord(payload.connect),
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
