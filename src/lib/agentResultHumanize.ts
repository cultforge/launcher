/** Turn agent command / API blobs into plain-language labels for the UI. */

import type { TelemetryTransportMode } from "./cultAgentTelemetry";
import { inferTelemetryTransport, parseTelemetryHud } from "./cultAgentTelemetry";

export type PcConnectionView = {
  pcReachable: boolean;
  /** realtime | standard | offline — for Starting… copy */
  mode: "realtime" | "standard" | "offline";
  linkLabel: string;
  linkDetail: string;
  apiBase: string | null;
};

export type ServerStatusView = {
  label: string;
  detail: string;
  players: string | null;
  maxPlayers: number | null;
};

function asRecord(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : null;
}

function unwrapAgentData(result: unknown): Record<string, unknown> {
  const root = asRecord(result);
  if (!root) return {};
  const data = asRecord(root.data) ?? root;
  return data;
}

function transportFromResult(result?: unknown): TelemetryTransportMode {
  if (!result) return "unknown";
  if (asRecord(result)) {
    const hud = parseTelemetryHud(asRecord(result));
    if (hud.transport !== "unknown") return hud.transport;
  }
  const data = unwrapAgentData(result);
  const cloud = asRecord(data.cloud) ?? asRecord(data.agent) ?? data;
  const transport =
    asRecord(cloud.transport) ??
    asRecord(data.transport) ??
    asRecord(data.realtime);

  if (transport) {
    const mode = String(transport.mode ?? transport.kind ?? "").toLowerCase();
    if (
      transport.connected === true ||
      mode === "websocket" ||
      mode === "ws" ||
      mode === "realtime" ||
      transport.prefer_realtime === true ||
      transport.preferRealtime === true ||
      data.connected === true
    ) {
      return "realtime";
    }
    if (mode === "poll" || mode === "polling" || mode === "http") {
      return "standard";
    }
  }
  return inferTelemetryTransport(data);
}

/**
 * PC connection strip labels (LAUNCHER_UI_CONTEXT):
 * Connected (realtime) | Connected (standard) | PC offline
 */
export function humanizePcConnection(
  nodeOnline: boolean,
  result?: unknown,
  transportHint?: TelemetryTransportMode | null,
): PcConnectionView {
  const data = unwrapAgentData(result);
  const cloud = asRecord(data.cloud) ?? asRecord(data.agent) ?? data;
  const apiBase =
    typeof cloud.api_base === "string"
      ? cloud.api_base
      : typeof cloud.apiBase === "string"
        ? cloud.apiBase
        : null;

  if (!nodeOnline) {
    return {
      pcReachable: false,
      mode: "offline",
      linkLabel: "PC offline",
      linkDetail:
        "CultAgent is not running on this computer, or it cannot reach CultForge.",
      apiBase,
    };
  }

  const fromResult = transportFromResult(result);
  const mode: TelemetryTransportMode =
    transportHint && transportHint !== "unknown"
      ? transportHint
      : fromResult !== "unknown"
        ? fromResult
        : "unknown";

  if (mode === "realtime") {
    return {
      pcReachable: true,
      mode: "realtime",
      linkLabel: "Connected (realtime)",
      linkDetail: "Live link — start and stop should respond in a few seconds.",
      apiBase,
    };
  }

  // Online agent with unknown or poll transport → standard (honest 15s fallback).
  return {
    pcReachable: true,
    mode: "standard",
    linkLabel: "Connected (standard)",
    linkDetail: "Standard link — commands may take up to 15 seconds.",
    apiBase,
  };
}

/** Button / phase copy while Start is pending. */
export function startingPhaseLabel(
  connectionMode: PcConnectionView["mode"] | TelemetryTransportMode | null | undefined,
): string {
  if (connectionMode === "realtime") return "Starting…";
  if (connectionMode === "standard") {
    return "Starting… may take up to 15 seconds";
  }
  // Unknown: prefer short copy (WS is production default per manifest).
  return "Starting…";
}

export function humanizeServerStatus(result: unknown): ServerStatusView {
  const data = unwrapAgentData(result);
  const state = String(
    data.state ?? data.status ?? data.local_state ?? data.server_state ?? "",
  ).toLowerCase();

  let label = "Unknown";
  let detail = "Could not read server status.";

  if (state.includes("run") || state.includes("online")) {
    label = "Online";
    detail = "The Minecraft server is running.";
  } else if (state.includes("start")) {
    label = "Starting…";
    detail = "The server is booting up.";
  } else if (state.includes("stop") && !state.includes("stopped")) {
    label = "Stopping…";
    detail = "The server is shutting down.";
  } else if (state.includes("crash")) {
    label = "Crashed";
    detail = "The server stopped unexpectedly. Check the console below.";
  } else if (state.includes("stopped") || state === "offline" || !state) {
    label = "Offline";
    detail = "The server is stopped. Press Start when you are ready to play.";
  }

  const online = Number(data.players_online ?? data.playersOnline ?? data.players);
  const max = Number(data.players_max ?? data.playersMax ?? data.max_players);
  const players =
    Number.isFinite(online) && Number.isFinite(max) && max > 0
      ? `${online} / ${max} players`
      : Number.isFinite(online) && online >= 0
        ? `${online} playing now`
        : null;

  return {
    label,
    detail,
    players,
    maxPlayers: Number.isFinite(max) ? max : null,
  };
}

export function humanizeMetrics(result: unknown): {
  cpu: number | null;
  ram: number | null;
  disk: number | null;
} {
  const data = unwrapAgentData(result);
  const system = asRecord(data.system) ?? data;
  const cpu = Number(system.cpu_percent ?? system.cpuPercent ?? data.cpu_percent);
  const ram = Number(
    system.ram_percent ?? system.ramPercent ?? data.ram_percent ?? data.memory_percent,
  );
  const disk = Number(system.disk_percent ?? system.diskPercent ?? data.disk_percent);
  return {
    cpu: Number.isFinite(cpu) ? Math.round(cpu) : null,
    ram: Number.isFinite(ram) ? Math.round(ram) : null,
    disk: Number.isFinite(disk) ? Math.round(disk) : null,
  };
}

export function humanizeServerList(result: unknown): string[] {
  const data = unwrapAgentData(result);
  const list = data.servers ?? data.items ?? data.instances;
  if (!Array.isArray(list)) return [];
  return list
    .map((row) => {
      if (typeof row === "string") return row;
      const rec = asRecord(row);
      if (!rec) return null;
      return String(
        rec.name ?? rec.display_name ?? rec.displayName ?? rec.server_id ?? rec.id ?? "",
      ).trim();
    })
    .filter((x): x is string => Boolean(x));
}
