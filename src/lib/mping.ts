import { invoke } from "@tauri-apps/api/core";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export type MpingStatus = {
  online: boolean | null;
  players?: number | string[];
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
  return invoke<string>("ensure_mping_broker");
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
    if (!res.ok) return { online: false, error: `HTTP ${res.status}` };
    return (await res.json()) as MpingStatus;
  } catch (err) {
    return {
      online: false,
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
  if (status.online === true) {
    const n =
      typeof status.players === "number"
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
  return "Unknown";
}
