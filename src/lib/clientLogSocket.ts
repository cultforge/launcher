import { getClientOrigin } from "./client";
import { handleOAuthWsMessage } from "./authEvents";
import { handlePresenceWsMessage } from "./presenceEvents";
import { handleRealtimeWsMessage } from "./realtimeEvents";
import { logger } from "./logger";
import { useLauncherLogsStore, type LogLevel } from "../stores/launcherLogs";

const LEVELS: ReadonlySet<string> = new Set([
  "DEBUG",
  "INFO",
  "SUCCESS",
  "WARNING",
  "ERROR",
  "CRITICAL",
  "EXCEPTION",
]);

function normalizeLevel(value: unknown): LogLevel {
  const level = String(value ?? "").toUpperCase();
  return (LEVELS.has(level) ? level : "INFO") as LogLevel;
}

let started = false;
let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let backoffMs = 1000;

const MAX_BACKOFF_MS = 15000;

function scheduleReconnect() {
  if (reconnectTimer !== null) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    void connect();
  }, backoffMs);
  backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
}

async function connect() {
  const origin = await getClientOrigin();
  const secretQuery = await import("./client").then((m) =>
    m.getLoopbackSecret().then((s) => (s ? `?${m.LOOPBACK_QUERY}=${encodeURIComponent(s)}` : "")),
  );
  const wsUrl = origin.replace(/^http/, "ws") + `/ws${secretQuery}`;

  try {
    socket = new WebSocket(wsUrl);
  } catch {
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    backoffMs = 1000;
    logger.debug("Client log stream connected");
  };

  socket.onmessage = (event) => {
    let payload: unknown;
    try {
      payload = JSON.parse(event.data as string);
    } catch {
      return;
    }
    if (!payload || typeof payload !== "object") {
      return;
    }
    if (handleOAuthWsMessage(payload)) {
      return;
    }
    if (handlePresenceWsMessage(payload)) {
      return;
    }
    if (handleRealtimeWsMessage(payload)) {
      return;
    }
    if ((payload as { type?: unknown }).type !== "log") {
      return;
    }
    const data = payload as {
      level?: unknown;
      message?: unknown;
      ts?: unknown;
      stack?: unknown;
    };
    const parsedTs = typeof data.ts === "string" ? Date.parse(data.ts) : NaN;
    useLauncherLogsStore.getState().push({
      level: normalizeLevel(data.level),
      message: String(data.message ?? ""),
      source: "client",
      ts: Number.isFinite(parsedTs) ? parsedTs : Date.now(),
      stack: typeof data.stack === "string" ? data.stack : undefined,
    });
  };

  socket.onclose = () => {
    socket = null;
    scheduleReconnect();
  };

  socket.onerror = () => {
    socket?.close();
  };
}

export function isClientWsOpen(): boolean {
  return socket?.readyState === WebSocket.OPEN;
}

/** Send a JSON frame uplink through the sidecar (guild channel join, etc.). */
export function sendClientWsFrame(frame: Record<string, unknown>): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  try {
    socket.send(JSON.stringify(frame));
    return true;
  } catch {
    return false;
  }
}

/** Start ingesting client.py log events over WebSocket (idempotent). */
export function startClientLogStream() {
  if (started) return;
  started = true;
  void connect();
}
