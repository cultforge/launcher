import { invoke } from "@tauri-apps/api/core";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export type MpingStatus = {
  online: boolean | null;
  /** Player count when broker sends a number (preferred). */
  players?: number | string[];
  /** Alternate field if broker avoids duplicate `players` key. */
  players_online?: number;
  max_players?: number;
  latency?: number;
  motd?: string;
  wait?: boolean;
  "wait-time"?: string | null;
  error?: string;
};

export async function getCultforgeHome(): Promise<string> {
  if (!isTauri()) return "";
  return invoke<string>("get_cultforge_home");
}

export async function getMpingPort(): Promise<number> {
  if (!isTauri()) return 8270;
  return invoke<number>("get_mping_port");
}

export async function writeMpingServers(servers: string[]): Promise<void> {
  if (!isTauri()) return;
  await invoke("write_mping_servers", { servers });
}

export async function ensureMpingBroker(): Promise<string> {
  if (!isTauri()) return "skipped";
  try {
    return await invoke<string>("ensure_mping_broker");
  } catch {
    // Soft-optional companion — never block launcher UX.
    return "unavailable";
  }
}

/** Normalize host:port for broker watch list. */
export function normalizeServerAddress(address: string): string {
  const trimmed = address.trim();
  if (!trimmed) return "";
  if (trimmed.includes(":")) return trimmed;
  return `${trimmed}:25565`;
}

/** Push guild (and optional extra) server addresses into mping.json and ensure broker. */
export async function syncMpingWatchList(
  addresses: string[],
): Promise<void> {
  const cleaned = [
    ...new Set(
      addresses.map(normalizeServerAddress).filter(Boolean),
    ),
  ];
  await writeMpingServers(cleaned);
  try {
    await ensureMpingBroker();
  } catch {
    // Broker may be missing in web/dev without the exe.
  }
}

/** Coerce broker / JSON quirks (`"true"`, 1, `"online"`) into a tri-state. */
export function coerceMpingOnline(value: unknown): boolean | null {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (["true", "1", "online", "up", "yes"].includes(s)) return true;
    if (["false", "0", "offline", "down", "no"].includes(s)) return false;
  }
  return null;
}

function normalizeMpingPayload(raw: Record<string, unknown>): MpingStatus {
  const online = coerceMpingOnline(raw.online ?? raw.status ?? raw.reachable);
  const players = raw.players;
  const playersOnline =
    typeof raw.players_online === "number"
      ? raw.players_online
      : typeof raw.playersOnline === "number"
        ? raw.playersOnline
        : undefined;
  const maxPlayers =
    typeof raw.max_players === "number"
      ? raw.max_players
      : typeof raw.maxPlayers === "number"
        ? raw.maxPlayers
        : undefined;
  const latency =
    typeof raw.latency === "number"
      ? raw.latency
      : typeof raw.ping === "number"
        ? raw.ping
        : typeof raw.ping_ms === "number"
          ? raw.ping_ms
          : undefined;

  return {
    online,
    players: Array.isArray(players)
      ? (players as string[])
      : typeof players === "number"
        ? players
        : undefined,
    players_online: playersOnline,
    max_players: maxPlayers,
    latency,
    motd: typeof raw.motd === "string" ? raw.motd : undefined,
    wait: raw.wait === true,
    "wait-time":
      typeof raw["wait-time"] === "string" || raw["wait-time"] === null
        ? (raw["wait-time"] as string | null)
        : undefined,
    error: typeof raw.error === "string" ? raw.error : undefined,
  };
}

export async function queryMpingStatus(
  address: string,
): Promise<MpingStatus | null> {
  const server = normalizeServerAddress(address);
  if (!server) return null;
  try {
    const port = await getMpingPort();
    const url = `http://127.0.0.1:${port}/query?server=${encodeURIComponent(server)}`;
    const res = await fetch(url);
    if (res.status === 404) return null;
    // Broker/HTTP failure ≠ Minecraft offline — leave unknown so UI can use runtime.
    if (!res.ok) {
      return { online: null, error: `HTTP ${res.status}` };
    }
    const json = (await res.json()) as Record<string, unknown>;
    return normalizeMpingPayload(json);
  } catch (err) {
    return {
      online: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function formatMpingLabel(status: MpingStatus | null | undefined): string {
  if (!status) return "…";
  if (status.wait) {
    return status["wait-time"]
      ? `Waiting ${status["wait-time"]}m`
      : "Waiting";
  }
  if (status.error && status.online !== true) return "Checking…";
  if (status.online === true) {
    const n =
      typeof status.players_online === "number"
        ? status.players_online
        : typeof status.players === "number"
          ? status.players
          : Array.isArray(status.players)
            ? status.players.length
            : undefined;
    if (n != null && status.max_players != null) {
      return `Online · ${n}/${status.max_players}`;
    }
    return "Online";
  }
  if (status.online === false) return "Offline";
  return "…";
}

/** Live reachability from ctfgbroker — not guild catalog is_active. */
export function liveOnlineFromMping(
  status: MpingStatus | null | undefined,
): boolean | null {
  if (!status || status.wait) return null;
  // Transport/broker errors must not paint the world as Offline.
  if (status.error && status.online !== true) return null;
  if (status.online === true) return true;
  if (status.online === false) return false;
  return null;
}

export function applyMpingToServerStats(
  status: MpingStatus | null | undefined,
): { playersOnline: number; playersMax: number; pingMs: number } | null {
  if (!status || status.online !== true) return null;
  const playersOnline =
    typeof status.players_online === "number"
      ? status.players_online
      : typeof status.players === "number"
        ? status.players
        : Array.isArray(status.players)
          ? status.players.length
          : 0;
  const playersMax =
    typeof status.max_players === "number" ? status.max_players : 0;
  const pingMs = typeof status.latency === "number" ? status.latency : 0;
  return { playersOnline, playersMax, pingMs };
}
