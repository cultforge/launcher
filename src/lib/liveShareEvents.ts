import { sendClientWsFrame } from "./clientLogSocket";
import {
  snapshotFromApi,
  type LiveShareSnapshot,
} from "./liveShareApi";

type Listener = (snapshot: LiveShareSnapshot, frame: Record<string, unknown>) => void;

const listeners = new Set<Listener>();
let joinedRoom: string | null = null;

function asRecord(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : null;
}

export function subscribeLiveShare(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Join api /v1/ws room from GET live `data.room` (via sidecar uplink). */
export function joinLiveShareRoom(room: string | null | undefined): boolean {
  const next = (room || "").trim();
  if (!next) return false;
  if (joinedRoom && joinedRoom !== next) {
    leaveLiveShareRoom(joinedRoom);
  }
  joinedRoom = next;
  return sendClientWsFrame({
    type: "join",
    room: next,
    payload: { room: next },
  });
}

export function leaveLiveShareRoom(room?: string | null): boolean {
  const target = (room || joinedRoom || "").trim();
  if (!target) return false;
  if (joinedRoom === target) joinedRoom = null;
  return sendClientWsFrame({
    type: "leave",
    room: target,
    payload: { room: target },
  });
}

export function currentLiveShareRoom(): string | null {
  return joinedRoom;
}

/** Handle `{ type: "live_share", payload }` frames from api /v1/ws. */
export function handleLiveShareWsMessage(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const obj = payload as Record<string, unknown>;
  const type = String(obj.type ?? "").toLowerCase();
  if (type !== "live_share" && type !== "liveshare" && type !== "live.share") {
    return false;
  }
  const body = asRecord(obj.payload) ?? asRecord(obj.data) ?? obj;
  const snapshot = snapshotFromApi(body);
  for (const listener of listeners) {
    try {
      listener(snapshot, obj);
    } catch {
      /* ignore */
    }
  }
  return true;
}
