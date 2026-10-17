/**
 * Party lobby REST (LOBBY.md). JWT only — create / invite / ready / start.
 */
import { ClientHttpError, send, sendMutate } from "./client";

export type LobbyScope = "personal" | "guild";
export type LobbyStatus =
  | "forming"
  | "ready"
  | "starting"
  | "in_game"
  | "cancelled"
  | string;

export type LobbyMember = {
  userId: string;
  username?: string | null;
  ready: boolean;
  isHost: boolean;
};

export type LobbyTarget = {
  kind?: string | null;
  serverId?: string | null;
  address?: string | null;
  port?: number | null;
  buildId?: string | null;
  buildName?: string | null;
};

export type PartyLobby = {
  id: string;
  scope: LobbyScope;
  guildId?: string | null;
  capacity: number;
  status: LobbyStatus;
  inviteCode?: string | null;
  hostUserId?: string | null;
  members: LobbyMember[];
  target?: LobbyTarget | null;
  targetServerKind?: string | null;
  targetServerId?: string | null;
};

export class PartyLobbyApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "PartyLobbyApiError";
    this.status = status;
  }
}

function wrap(prefix: string, err: unknown): PartyLobbyApiError {
  if (err instanceof ClientHttpError) {
    return new PartyLobbyApiError(`${prefix}: ${err.message}`, err.status);
  }
  if (err instanceof PartyLobbyApiError) return err;
  return new PartyLobbyApiError(
    `${prefix}: ${err instanceof Error ? err.message : String(err)}`,
  );
}

function asRecord(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : null;
}

function unwrapOne(data: unknown): Record<string, unknown> {
  const obj = asRecord(data);
  if (!obj) return {};
  const inner = asRecord(obj.data) ?? asRecord(obj.lobby);
  return inner ?? obj;
}

function unwrapList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const obj = asRecord(data);
  if (!obj) return [];
  for (const key of ["data", "items", "lobbies", "results"]) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  return [];
}

function memberFromRaw(row: unknown): LobbyMember | null {
  const obj = asRecord(row);
  if (!obj) return null;
  const userId = String(obj.user_id ?? obj.userId ?? "").trim();
  if (!userId) return null;
  return {
    userId,
    username:
      typeof obj.username === "string"
        ? obj.username
        : typeof obj.name === "string"
          ? obj.name
          : null,
    ready: Boolean(obj.ready ?? obj.is_ready ?? obj.isReady),
    isHost: Boolean(obj.is_host ?? obj.isHost ?? obj.host),
  };
}

function targetFromRaw(raw: unknown): LobbyTarget | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const portRaw = obj.port;
  return {
    kind: typeof obj.kind === "string" ? obj.kind : null,
    serverId:
      typeof obj.server_id === "string"
        ? obj.server_id
        : typeof obj.serverId === "string"
          ? obj.serverId
          : null,
    address:
      typeof obj.address === "string"
        ? obj.address
        : typeof obj.host === "string"
          ? obj.host
          : null,
    port:
      typeof portRaw === "number"
        ? portRaw
        : typeof portRaw === "string"
          ? Number(portRaw) || null
          : null,
    buildId:
      typeof obj.build_id === "string"
        ? obj.build_id
        : typeof obj.buildId === "string"
          ? obj.buildId
          : null,
    buildName:
      typeof obj.build_name === "string"
        ? obj.build_name
        : typeof obj.buildName === "string"
          ? obj.buildName
          : null,
  };
}

export function lobbyFromApi(raw: unknown): PartyLobby | null {
  const obj = unwrapOne(raw);
  const id = String(obj.id ?? obj.lobby_id ?? obj.lobbyId ?? "").trim();
  if (!id) return null;
  const membersRaw = obj.members ?? obj.players ?? [];
  const members = Array.isArray(membersRaw)
    ? membersRaw
        .map(memberFromRaw)
        .filter((m): m is LobbyMember => Boolean(m))
    : [];
  const scopeRaw = String(obj.scope ?? "personal").toLowerCase();
  return {
    id,
    scope: scopeRaw === "guild" ? "guild" : "personal",
    guildId:
      typeof obj.guild_id === "string"
        ? obj.guild_id
        : typeof obj.guildId === "string"
          ? obj.guildId
          : null,
    capacity: Number(obj.capacity ?? members.length ?? 4) || 4,
    status: String(obj.status ?? "forming"),
    inviteCode:
      typeof obj.invite_code === "string"
        ? obj.invite_code
        : typeof obj.inviteCode === "string"
          ? obj.inviteCode
          : null,
    hostUserId:
      typeof obj.host_user_id === "string"
        ? obj.host_user_id
        : typeof obj.hostUserId === "string"
          ? obj.hostUserId
          : null,
    members,
    target: targetFromRaw(obj.target ?? obj.data),
    targetServerKind:
      typeof obj.target_server_kind === "string"
        ? obj.target_server_kind
        : typeof obj.targetServerKind === "string"
          ? obj.targetServerKind
          : null,
    targetServerId:
      typeof obj.target_server_id === "string"
        ? obj.target_server_id
        : typeof obj.targetServerId === "string"
          ? obj.targetServerId
          : null,
  };
}

export async function createPartyLobby(input: {
  scope: LobbyScope;
  guildId?: string;
  capacity?: number;
  targetServerKind?: string;
  targetServerId?: string;
}): Promise<PartyLobby> {
  try {
    const body: Record<string, unknown> = {
      scope: input.scope,
      capacity: input.capacity ?? 4,
    };
    if (input.guildId) body.guild_id = input.guildId;
    if (input.targetServerKind) body.target_server_kind = input.targetServerKind;
    if (input.targetServerId) body.target_server_id = input.targetServerId;
    const raw = await sendMutate("api", "create_party_lobby", body, "POST");
    const lobby = lobbyFromApi(raw);
    if (!lobby) throw new PartyLobbyApiError("Create lobby malformed", 502);
    return lobby;
  } catch (err) {
    throw wrap("Could not create lobby", err);
  }
}

export async function fetchMyPartyLobby(): Promise<PartyLobby | null> {
  try {
    const raw = await send<unknown>("api", "get_my_party_lobby", {});
    return lobbyFromApi(raw);
  } catch (err) {
    if (err instanceof ClientHttpError && (err.status === 404 || err.status === 204)) {
      return null;
    }
    throw wrap("Could not load my lobby", err);
  }
}

export async function fetchPartyLobby(lobbyId: string): Promise<PartyLobby> {
  try {
    const raw = await send<unknown>("api", "get_party_lobby", {
      lobby_id: lobbyId,
    });
    const lobby = lobbyFromApi(raw);
    if (!lobby) throw new PartyLobbyApiError("Lobby not found", 404);
    return lobby;
  } catch (err) {
    throw wrap("Could not load lobby", err);
  }
}

export async function updatePartyLobby(
  lobbyId: string,
  patch: {
    capacity?: number;
    targetServerKind?: string;
    targetServerId?: string;
  },
): Promise<PartyLobby> {
  try {
    const body: Record<string, unknown> = { lobby_id: lobbyId };
    if (patch.capacity !== undefined) body.capacity = patch.capacity;
    if (patch.targetServerKind !== undefined)
      body.target_server_kind = patch.targetServerKind;
    if (patch.targetServerId !== undefined)
      body.target_server_id = patch.targetServerId;
    const raw = await sendMutate("api", "update_party_lobby", body, "PATCH");
    const lobby = lobbyFromApi(raw);
    if (!lobby) throw new PartyLobbyApiError("Update lobby malformed", 502);
    return lobby;
  } catch (err) {
    throw wrap("Could not update lobby", err);
  }
}

export async function inviteToPartyLobby(
  lobbyId: string,
  userIds: string[],
): Promise<PartyLobby> {
  try {
    const raw = await sendMutate(
      "api",
      "invite_to_party_lobby",
      { lobby_id: lobbyId, user_ids: userIds },
      "POST",
    );
    return lobbyFromApi(raw) ?? (await fetchPartyLobby(lobbyId));
  } catch (err) {
    throw wrap("Could not invite", err);
  }
}

export async function joinPartyLobby(input: {
  lobbyId?: string;
  inviteCode?: string;
}): Promise<PartyLobby> {
  try {
    const body: Record<string, unknown> = {};
    if (input.lobbyId) body.lobby_id = input.lobbyId;
    if (input.inviteCode) body.invite_code = input.inviteCode;
    const raw = await sendMutate("api", "join_party_lobby", body, "POST");
    const lobby = lobbyFromApi(raw);
    if (!lobby) throw new PartyLobbyApiError("Join lobby malformed", 502);
    return lobby;
  } catch (err) {
    throw wrap("Could not join lobby", err);
  }
}

export async function setPartyLobbyReady(
  lobbyId: string,
  ready: boolean,
): Promise<PartyLobby> {
  try {
    const raw = await sendMutate(
      "api",
      "set_party_lobby_ready",
      { lobby_id: lobbyId, ready },
      "POST",
    );
    return lobbyFromApi(raw) ?? (await fetchPartyLobby(lobbyId));
  } catch (err) {
    throw wrap("Could not set ready", err);
  }
}

export async function startPartyLobby(lobbyId: string): Promise<PartyLobby> {
  try {
    const raw = await sendMutate(
      "api",
      "start_party_lobby",
      { lobby_id: lobbyId },
      "POST",
    );
    return lobbyFromApi(raw) ?? (await fetchPartyLobby(lobbyId));
  } catch (err) {
    throw wrap("Could not start lobby", err);
  }
}

export async function leavePartyLobby(lobbyId: string): Promise<void> {
  try {
    await sendMutate(
      "api",
      "leave_party_lobby",
      { lobby_id: lobbyId },
      "POST",
    );
  } catch (err) {
    throw wrap("Could not leave lobby", err);
  }
}

export async function kickFromPartyLobby(
  lobbyId: string,
  userId: string,
): Promise<PartyLobby> {
  try {
    const raw = await sendMutate(
      "api",
      "kick_from_party_lobby",
      { lobby_id: lobbyId, user_id: userId },
      "POST",
    );
    return lobbyFromApi(raw) ?? (await fetchPartyLobby(lobbyId));
  } catch (err) {
    throw wrap("Could not kick member", err);
  }
}

export async function cancelPartyLobby(lobbyId: string): Promise<void> {
  try {
    await sendMutate(
      "api",
      "cancel_party_lobby",
      { lobby_id: lobbyId },
      "POST",
    );
  } catch (err) {
    throw wrap("Could not cancel lobby", err);
  }
}

export async function listGuildLobbies(guildId: string): Promise<PartyLobby[]> {
  try {
    const raw = await send<unknown>("guilds", "list_guild_lobbies", {
      guild_id: guildId,
    });
    return unwrapList(raw)
      .map(lobbyFromApi)
      .filter((x): x is PartyLobby => Boolean(x));
  } catch (err) {
    throw wrap("Could not list guild lobbies", err);
  }
}
