/**
 * Live guild agent presence — players + gameplay events from
 * GET /v1/guilds/{gld}/agents/players|events (+ runtime for id mapping).
 */
import { create } from "zustand";
import {
  listGuildAgentEvents,
  listGuildAgentPlayers,
  listGuildAgentRuntime,
  type CultAgentGameEvent,
  type CultAgentPlayerPresence,
  type CultAgentRuntimeSnapshot,
} from "../lib/cultAgentApi";

const POLL_MS = 10_000;

export type GuildServerPresence = {
  names: string[];
  count: number;
  events: CultAgentGameEvent[];
};

type GuildAgentPresenceState = {
  guildId: string | null;
  players: CultAgentPlayerPresence[];
  events: CultAgentGameEvent[];
  runtime: CultAgentRuntimeSnapshot[];
  /** serverId → roster */
  byServerId: Record<string, GuildServerPresence>;
  loading: boolean;
  lastFetchedAt: number | null;
  error: string | null;
  ensurePolling: (guildId: string | null) => void;
  refresh: (guildId?: string | null) => Promise<void>;
  playersOnServer: (serverId: string) => string[];
  presenceForServer: (serverId: string) => GuildServerPresence | null;
};

let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollGuildId: string | null = null;
let inFlight = false;

function workloadToServerId(
  workloadId: string | null | undefined,
  runtime: CultAgentRuntimeSnapshot[],
): string | null {
  if (!workloadId) return null;
  const hit = runtime.find((r) => r.workloadId === workloadId);
  return hit?.guildServerId?.trim() || null;
}

function resolveServerId(
  row: { guildServerId?: string | null; workloadId?: string | null; raw: Record<string, unknown> },
  runtime: CultAgentRuntimeSnapshot[],
): string | null {
  const direct =
    row.guildServerId?.trim() ||
    (typeof row.raw.guild_server_id === "string"
      ? row.raw.guild_server_id.trim()
      : "") ||
    (typeof row.raw.server_id === "string" ? row.raw.server_id.trim() : "");
  if (direct) return direct;
  return workloadToServerId(row.workloadId, runtime);
}

function buildByServer(
  players: CultAgentPlayerPresence[],
  events: CultAgentGameEvent[],
  runtime: CultAgentRuntimeSnapshot[],
): Record<string, GuildServerPresence> {
  const map: Record<string, GuildServerPresence> = {};

  const ensure = (sid: string): GuildServerPresence => {
    if (!map[sid]) map[sid] = { names: [], count: 0, events: [] };
    return map[sid]!;
  };

  for (const p of players) {
    const sid = resolveServerId(p, runtime);
    if (!sid) continue;
    const bucket = ensure(sid);
    if (!bucket.names.includes(p.name)) bucket.names.push(p.name);
    bucket.count = bucket.names.length;
  }

  // If players lack server ids but exactly one runtime is online, attribute there.
  const unscoped = players.filter((p) => !resolveServerId(p, runtime));
  const onlineRuntimes = runtime.filter((r) => {
    const s = (r.state ?? "").toLowerCase();
    return (
      (s.includes("run") || s.includes("online") || s === "started") &&
      r.guildServerId
    );
  });
  if (unscoped.length && onlineRuntimes.length === 1) {
    const sid = onlineRuntimes[0]!.guildServerId!.trim();
    const bucket = ensure(sid);
    for (const p of unscoped) {
      if (!bucket.names.includes(p.name)) bucket.names.push(p.name);
    }
    bucket.count = Math.max(bucket.names.length, onlineRuntimes[0]!.playerCount);
  }

  // Runtime player_count fills gaps when roster empty
  for (const r of runtime) {
    const sid = r.guildServerId?.trim();
    if (!sid) continue;
    const bucket = ensure(sid);
    if (bucket.names.length === 0 && r.playerCount > 0) {
      bucket.count = r.playerCount;
    } else {
      bucket.count = Math.max(bucket.count, bucket.names.length);
    }
  }

  for (const ev of events) {
    const sid = resolveServerId(ev, runtime);
    if (!sid) continue;
    ensure(sid).events.push(ev);
  }

  for (const bucket of Object.values(map)) {
    bucket.events = bucket.events.slice(0, 12);
  }

  return map;
}

export const useGuildAgentPresenceStore = create<GuildAgentPresenceState>(
  (set, get) => ({
    guildId: null,
    players: [],
    events: [],
    runtime: [],
    byServerId: {},
    loading: false,
    lastFetchedAt: null,
    error: null,

    playersOnServer: (serverId) =>
      get().byServerId[serverId]?.names ?? [],

    presenceForServer: (serverId) => get().byServerId[serverId] ?? null,

    refresh: async (guildIdArg) => {
      const guildId = guildIdArg ?? get().guildId;
      if (!guildId) {
        set({
          guildId: null,
          players: [],
          events: [],
          runtime: [],
          byServerId: {},
          error: null,
        });
        return;
      }
      if (inFlight) return;
      inFlight = true;
      set({ loading: true, error: null, guildId });
      try {
        const [players, events, runtime] = await Promise.all([
          listGuildAgentPlayers(guildId).catch(() => []),
          listGuildAgentEvents(guildId, 40).catch(() => []),
          listGuildAgentRuntime(guildId).catch(() => []),
        ]);
        set({
          players,
          events,
          runtime,
          byServerId: buildByServer(players, events, runtime),
          lastFetchedAt: Date.now(),
          loading: false,
          error: null,
        });
      } catch (err) {
        set({
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        inFlight = false;
      }
    },

    ensurePolling: (guildId) => {
      if (!guildId) {
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
        pollGuildId = null;
        set({
          guildId: null,
          players: [],
          events: [],
          runtime: [],
          byServerId: {},
        });
        return;
      }
      if (pollGuildId === guildId && pollTimer) {
        void get().refresh(guildId);
        return;
      }
      if (pollTimer) clearInterval(pollTimer);
      pollGuildId = guildId;
      void get().refresh(guildId);
      pollTimer = setInterval(() => {
        void get().refresh(guildId);
      }, POLL_MS);
    },
  }),
);

/** Names currently online on a guild server (agent presence). */
export function playersOnServer(serverId: string): string[] {
  return useGuildAgentPresenceStore.getState().playersOnServer(serverId);
}
