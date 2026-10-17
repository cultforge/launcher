/**
 * Live share snapshots (Aternos-style roster / world).
 * GET composed snapshot; prefer WS `live_share` push on `data.room`.
 */
import { ClientHttpError, send } from "./client";

export type LiveSharePosition = {
  x: number;
  y: number;
  z: number;
  yaw?: number | null;
  pitch?: number | null;
};

export type LiveShareSessionStats = {
  blocksMined?: number | null;
  blocksPlaced?: number | null;
  distanceWalked?: number | null;
  deaths?: number | null;
  playtimeSeconds?: number | null;
  raw?: Record<string, unknown>;
};

export type LiveSharePlayer = {
  uuid: string;
  name: string;
  dimension?: string | null;
  health?: number | null;
  food?: number | null;
  gamemode?: string | null;
  ping?: number | null;
  position?: LiveSharePosition | null;
  sessionStats?: LiveShareSessionStats | null;
};

export type LiveShareRuntime = {
  state?: string | null;
  tps?: number | null;
  mspt?: number | null;
  version?: string | null;
  facet?: string | null;
  playerCount?: number | null;
};

export type LiveShareWorld = {
  name?: string | null;
  dimension?: string | null;
  weather?: string | null;
  time?: number | string | null;
  difficulty?: string | null;
};

export type LiveShareEvent = {
  id: string;
  eventType: string;
  minecraftName?: string | null;
  occurredAt?: string | null;
  summary?: string | null;
};

export type LiveShareSnapshot = {
  room?: string | null;
  runtime: LiveShareRuntime;
  world: LiveShareWorld;
  players: LiveSharePlayer[];
  events: LiveShareEvent[];
  recordedAt?: string | null;
  offline: boolean;
  raw: Record<string, unknown>;
};

export class LiveShareApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "LiveShareApiError";
    this.status = status;
  }
}

function wrap(prefix: string, err: unknown): LiveShareApiError {
  if (err instanceof ClientHttpError) {
    return new LiveShareApiError(`${prefix}: ${err.message}`, err.status);
  }
  if (err instanceof LiveShareApiError) return err;
  return new LiveShareApiError(
    `${prefix}: ${err instanceof Error ? err.message : String(err)}`,
  );
}

function asRecord(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : null;
}

function unwrapData(data: unknown): Record<string, unknown> {
  const obj = asRecord(data);
  if (!obj) return {};
  const inner = asRecord(obj.data);
  return inner ?? obj;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

function positionFrom(raw: unknown): LiveSharePosition | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const x = num(obj.x);
  const y = num(obj.y);
  const z = num(obj.z);
  if (x == null || y == null || z == null) return null;
  return {
    x,
    y,
    z,
    yaw: num(obj.yaw),
    pitch: num(obj.pitch),
  };
}

function sessionStatsFrom(raw: unknown): LiveShareSessionStats | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  return {
    blocksMined: num(obj.blocks_mined ?? obj.blocksMined),
    blocksPlaced: num(obj.blocks_placed ?? obj.blocksPlaced),
    distanceWalked: num(
      obj.distance_walked ?? obj.distanceWalked ?? obj.distance,
    ),
    deaths: num(obj.deaths),
    playtimeSeconds: num(
      obj.playtime_seconds ?? obj.playtimeSeconds ?? obj.playtime,
    ),
    raw: obj,
  };
}

function playerFrom(row: unknown): LiveSharePlayer | null {
  const obj = asRecord(row);
  if (!obj) return null;
  const uuid = String(obj.uuid ?? obj.minecraft_uuid ?? obj.id ?? "").trim();
  const name = String(
    obj.name ?? obj.minecraft_name ?? obj.player_name ?? "",
  ).trim();
  if (!uuid && !name) return null;
  return {
    uuid: uuid || name,
    name: name || uuid,
    dimension: typeof obj.dimension === "string" ? obj.dimension : null,
    health: num(obj.health ?? obj.hp),
    food: num(obj.food ?? obj.hunger),
    gamemode:
      typeof obj.gamemode === "string"
        ? obj.gamemode
        : typeof obj.game_mode === "string"
          ? obj.game_mode
          : null,
    ping: num(obj.ping),
    position: positionFrom(obj.position ?? obj.pos ?? obj.location),
    sessionStats: sessionStatsFrom(
      obj.session_stats ?? obj.sessionStats ?? obj.stats,
    ),
  };
}

function eventFrom(row: unknown, index: number): LiveShareEvent | null {
  const obj = asRecord(row);
  if (!obj) return null;
  const eventType = String(
    obj.event_type ?? obj.eventType ?? obj.type ?? obj.kind ?? "",
  ).trim();
  if (!eventType && !obj.id) return null;
  return {
    id: String(obj.id ?? `${eventType}-${index}`),
    eventType: eventType || "event",
    minecraftName:
      typeof obj.minecraft_name === "string"
        ? obj.minecraft_name
        : typeof obj.name === "string"
          ? obj.name
          : null,
    occurredAt:
      typeof obj.occurred_at === "string"
        ? obj.occurred_at
        : typeof obj.occurredAt === "string"
          ? obj.occurredAt
          : typeof obj.ts === "string"
            ? obj.ts
            : null,
    summary:
      typeof obj.summary === "string"
        ? obj.summary
        : typeof obj.message === "string"
          ? obj.message
          : null,
  };
}

export function snapshotFromApi(raw: unknown): LiveShareSnapshot {
  const data = unwrapData(raw);
  const runtimeObj = asRecord(data.runtime) ?? {};
  const worldObj = asRecord(data.world) ?? asRecord(data.world_meta) ?? {};
  const playersRaw = data.players ?? data.roster ?? [];
  const eventsRaw = data.events ?? data.recent_events ?? [];
  const players = Array.isArray(playersRaw)
    ? playersRaw.map(playerFrom).filter((p): p is LiveSharePlayer => Boolean(p))
    : [];
  const events = Array.isArray(eventsRaw)
    ? eventsRaw
        .map((row, i) => eventFrom(row, i))
        .filter((e): e is LiveShareEvent => Boolean(e))
    : [];

  return {
    room:
      typeof data.room === "string"
        ? data.room
        : typeof data.ws_room === "string"
          ? data.ws_room
          : null,
    runtime: {
      state:
        typeof runtimeObj.state === "string"
          ? runtimeObj.state
          : typeof runtimeObj.status === "string"
            ? runtimeObj.status
            : null,
      tps: num(runtimeObj.tps ?? runtimeObj.TPS),
      mspt: num(runtimeObj.mspt ?? runtimeObj.MSPT),
      version:
        typeof runtimeObj.version === "string" ? runtimeObj.version : null,
      facet: typeof runtimeObj.facet === "string" ? runtimeObj.facet : null,
      playerCount:
        num(runtimeObj.player_count ?? runtimeObj.playerCount) ??
        players.length,
    },
    world: {
      name:
        typeof worldObj.name === "string"
          ? worldObj.name
          : typeof worldObj.world_name === "string"
            ? worldObj.world_name
            : null,
      dimension:
        typeof worldObj.dimension === "string" ? worldObj.dimension : null,
      weather:
        typeof worldObj.weather === "string" ? worldObj.weather : null,
      time: (worldObj.time ?? worldObj.world_time ?? null) as
        | number
        | string
        | null,
      difficulty:
        typeof worldObj.difficulty === "string" ? worldObj.difficulty : null,
    },
    players,
    events,
    recordedAt:
      typeof data.recorded_at === "string"
        ? data.recorded_at
        : typeof data.recordedAt === "string"
          ? data.recordedAt
          : typeof data.updated_at === "string"
            ? data.updated_at
            : null,
    offline: false,
    raw: data,
  };
}

const OFFLINE: LiveShareSnapshot = {
  room: null,
  runtime: {},
  world: {},
  players: [],
  events: [],
  offline: true,
  raw: {},
};

/** GET /v1/guilds/{guild_id}/agents/live?guild_server_id= */
export async function fetchGuildLiveShare(
  guildId: string,
  guildServerId: string,
): Promise<LiveShareSnapshot> {
  try {
    const raw = await send<unknown>(
      "api",
      "get_guild_server_live_share_snapshot",
      {
        guild_id: guildId,
        guild_server_id: guildServerId,
      },
    );
    return snapshotFromApi(raw);
  } catch (err) {
    if (err instanceof ClientHttpError && (err.status === 404 || err.status === 204)) {
      return { ...OFFLINE };
    }
    throw wrap("Could not load guild live share", err);
  }
}

/** GET /v1/me/servers/{server_id}/live */
export async function fetchPersonalLiveShare(
  serverId: string,
): Promise<LiveShareSnapshot> {
  try {
    const raw = await send<unknown>("api", "get_personal_server_live_share", {
      server_id: serverId,
    });
    return snapshotFromApi(raw);
  } catch (err) {
    if (err instanceof ClientHttpError && (err.status === 404 || err.status === 204)) {
      return { ...OFFLINE };
    }
    throw wrap("Could not load personal live share", err);
  }
}
