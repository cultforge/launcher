import { ClientHttpError, send, sendMutate } from "./client";
import type {
  PersonalServerJoinPolicy,
  PersonalServerVisibility,
  UserPersonalServerRecord,
} from "../types/catalog";

export class PersonalServerApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "PersonalServerApiError";
    this.status = status;
  }
}

function wrap(prefix: string, err: unknown): PersonalServerApiError {
  if (err instanceof ClientHttpError)
    return new PersonalServerApiError(`${prefix}: ${err.message}`, err.status);
  if (err instanceof PersonalServerApiError) return err;
  return new PersonalServerApiError(
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
  for (const key of ["data", "items", "servers", "results"]) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  return [];
}

function unwrapOne(data: unknown): unknown {
  const obj = asRecord(data);
  if (!obj) return data;
  for (const key of ["data", "server", "item"]) {
    if (obj[key] !== undefined) return obj[key];
  }
  return data;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((x) => String(x).trim()).filter(Boolean);
}

function parseVisibility(raw: unknown): PersonalServerVisibility {
  const v = String(raw ?? "private").toLowerCase();
  if (v === "public" || v === "unlisted" || v === "private") return v;
  return "private";
}

function parseJoinPolicy(raw: unknown): PersonalServerJoinPolicy {
  const v = String(raw ?? "allowlist").toLowerCase();
  if (
    v === "open" ||
    v === "allowlist" ||
    v === "guild_members" ||
    v === "friends"
  ) {
    return v;
  }
  return "allowlist";
}

function recordFromApi(raw: unknown): UserPersonalServerRecord | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const id = String(obj.id ?? "").trim();
  const name = String(obj.name ?? "").trim();
  if (!id || !name) return null;
  const addr = String(obj.server_address ?? obj.configured_address ?? "");
  const port = Number(obj.port ?? obj.configured_port ?? 25565) || 25565;
  return {
    id,
    ownerId: String(obj.owner_id ?? ""),
    name,
    serverAddress: addr,
    port,
    configuredAddress: String(obj.configured_address ?? addr),
    configuredPort: Number(obj.configured_port ?? port) || port,
    effectiveAddress: String(obj.effective_address ?? obj.configured_address ?? addr),
    effectivePort: Number(obj.effective_port ?? obj.configured_port ?? port) || port,
    addressSource: obj.address_source === "tunnel" ? "tunnel" : "configured",
    buildId: typeof obj.build_id === "string" ? obj.build_id : undefined,
    themeColor: typeof obj.theme_color === "string" ? obj.theme_color : "#7A2CFF",
    isActive: obj.is_active !== false,
    visibility: parseVisibility(obj.visibility),
    joinPolicy: parseJoinPolicy(obj.join_policy ?? obj.joinPolicy),
    allowlistUserIds: asStringList(
      obj.allowlist_user_ids ?? obj.allowlistUserIds,
    ),
    allowlistUsernames: asStringList(
      obj.allowlist_usernames ?? obj.allowlistUsernames,
    ),
    denylistUserIds: asStringList(
      obj.denylist_user_ids ?? obj.denylistUserIds,
    ),
    preferredAgentNodeId: String(
      obj.preferred_agent_node_id ?? obj.preferredAgentNodeId ?? "",
    ).trim() || null,
  };
}

/** Address a user should connect to (respects tunnel override). */
export function personalServerJoinAddress(
  server: UserPersonalServerRecord,
): { address: string; port: number } {
  return {
    address: server.effectiveAddress,
    port: server.effectivePort,
  };
}

export async function listPersonalServers(): Promise<UserPersonalServerRecord[]> {
  try {
    const raw = await send<unknown>("api", "list_my_personal_servers");
    return unwrapList(raw)
      .map(recordFromApi)
      .filter((x): x is UserPersonalServerRecord => Boolean(x));
  } catch (err) {
    throw wrap("Could not list your servers", err);
  }
}

export async function fetchPersonalServer(
  serverId: string,
): Promise<UserPersonalServerRecord> {
  try {
    const raw = await send<unknown>("api", "get_personal_server", {
      server_id: serverId,
    });
    const record = recordFromApi(unwrapOne(raw));
    if (!record) throw new PersonalServerApiError("Server not found", 404);
    return record;
  } catch (err) {
    throw wrap("Could not fetch server", err);
  }
}

export type PersonalServerWritePayload = {
  name: string;
  serverAddress: string;
  port?: number;
  buildId?: string;
  themeColor?: string;
  visibility?: PersonalServerVisibility;
  joinPolicy?: PersonalServerJoinPolicy;
};

/** Client-side join gate before starting MC / showing connect. */
export function canJoinPersonalServer(
  server: UserPersonalServerRecord,
  viewer: { userId?: string | null; username?: string | null },
): { ok: boolean; reason?: string } {
  const me = (viewer.userId ?? "").trim();
  if (me && me === server.ownerId) return { ok: true };
  if (server.denylistUserIds.some((id) => id === me)) {
    return { ok: false, reason: "You are on this server's deny list." };
  }
  switch (server.joinPolicy) {
    case "open":
      return { ok: true };
    case "allowlist": {
      const uname = (viewer.username ?? "").trim().toLowerCase();
      const allowed =
        server.allowlistUserIds.includes(me) ||
        server.allowlistUsernames.some(
          (u) => u.toLowerCase() === uname,
        );
      return allowed
        ? { ok: true }
        : { ok: false, reason: "This server requires an allowlist invite." };
    }
    case "friends":
      return {
        ok: false,
        reason: "Friends-only join is checked on connect — request access first.",
      };
    case "guild_members":
      return {
        ok: false,
        reason: "Guild-members join is checked on connect — join the linked guild first.",
      };
    default:
      return { ok: false, reason: "Join policy blocks this connection." };
  }
}

export async function createPersonalServer(
  payload: PersonalServerWritePayload,
): Promise<UserPersonalServerRecord> {
  try {
    const body: Record<string, unknown> = {
      name: payload.name,
      server_address: payload.serverAddress,
    };
    if (payload.port) body.port = payload.port;
    if (payload.buildId) body.build_id = payload.buildId;
    if (payload.themeColor) body.theme_color = payload.themeColor;
    if (payload.visibility) body.visibility = payload.visibility;
    if (payload.joinPolicy) body.join_policy = payload.joinPolicy;
    const raw = await sendMutate("api", "create_personal_server", body, "POST");
    const record = recordFromApi(unwrapOne(raw));
    if (!record)
      throw new PersonalServerApiError("Create server response malformed", 502);
    return record;
  } catch (err) {
    throw wrap("Could not create server", err);
  }
}

export async function updatePersonalServer(
  serverId: string,
  payload: Partial<PersonalServerWritePayload>,
): Promise<UserPersonalServerRecord> {
  try {
    const body: Record<string, unknown> = { server_id: serverId };
    if (payload.name !== undefined) body.name = payload.name;
    if (payload.serverAddress !== undefined) body.server_address = payload.serverAddress;
    if (payload.port !== undefined) body.port = payload.port;
    if (payload.buildId !== undefined) body.build_id = payload.buildId;
    if (payload.themeColor !== undefined) body.theme_color = payload.themeColor;
    if (payload.visibility !== undefined) body.visibility = payload.visibility;
    if (payload.joinPolicy !== undefined) body.join_policy = payload.joinPolicy;
    const raw = await sendMutate("api", "update_personal_server", body, "PATCH");
    const record = recordFromApi(unwrapOne(raw));
    if (!record)
      throw new PersonalServerApiError("Update server response malformed", 502);
    return record;
  } catch (err) {
    throw wrap("Could not update server", err);
  }
}

export async function deletePersonalServer(serverId: string): Promise<void> {
  try {
    await sendMutate(
      "api",
      "delete_personal_server",
      { server_id: serverId },
      "DELETE",
    );
  } catch (err) {
    throw wrap("Could not delete server", err);
  }
}

export type PersonalServerAclPayload = {
  allowlistUserIds?: string[];
  allowlistUsernames?: string[];
  denylistUserIds?: string[];
  addDenyUserId?: string;
  removeDenyUserId?: string;
};

/** POST /v1/me/servers/{id}/acl */
export async function updatePersonalServerAcl(
  serverId: string,
  patch: PersonalServerAclPayload,
): Promise<UserPersonalServerRecord> {
  try {
    const body: Record<string, unknown> = { server_id: serverId };
    if (patch.allowlistUserIds)
      body.allowlist_user_ids = patch.allowlistUserIds;
    if (patch.allowlistUsernames)
      body.allowlist_usernames = patch.allowlistUsernames;
    if (patch.denylistUserIds) body.denylist_user_ids = patch.denylistUserIds;
    if (patch.addDenyUserId) body.add_deny_user_id = patch.addDenyUserId;
    if (patch.removeDenyUserId)
      body.remove_deny_user_id = patch.removeDenyUserId;
    const raw = await sendMutate(
      "api",
      "update_personal_server_acl",
      body,
      "POST",
    );
    const record = recordFromApi(unwrapOne(raw));
    if (!record) throw new PersonalServerApiError("ACL response malformed", 502);
    return record;
  } catch (err) {
    throw wrap("Could not update ACL", err);
  }
}

/** POST /v1/me/servers/{id}/players/kick */
export async function kickPersonalServerPlayer(
  serverId: string,
  opts: {
    minecraftName?: string;
    userId?: string;
    ban?: boolean;
    reason?: string;
  },
): Promise<void> {
  try {
    await sendMutate(
      "api",
      "kick_personal_server_player",
      {
        server_id: serverId,
        minecraft_name: opts.minecraftName,
        user_id: opts.userId,
        ban: Boolean(opts.ban),
        reason: opts.reason,
        confirm: opts.ban ? true : undefined,
      },
      "POST",
    );
  } catch (err) {
    throw wrap(opts.ban ? "Could not ban player" : "Could not kick player", err);
  }
}

/** GET /v1/servers/discover */
export async function discoverPublicPersonalServers(
  limit = 50,
): Promise<UserPersonalServerRecord[]> {
  try {
    const raw = await send<unknown>("api", "discover_public_servers", {
      limit: String(limit),
    });
    return unwrapList(raw)
      .map(recordFromApi)
      .filter((x): x is UserPersonalServerRecord => Boolean(x));
  } catch (err) {
    throw wrap("Could not load public servers", err);
  }
}
