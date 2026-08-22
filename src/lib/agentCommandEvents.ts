import type { CultAgentCommand } from "./cultAgentApi";
import { commandFromRecord } from "./cultAgentApi";

type Waiter = {
  resolve: (cmd: CultAgentCommand) => void;
  reject: (err: Error) => void;
  timer: number;
};

type Listener = (cmd: CultAgentCommand, frame: Record<string, unknown>) => void;

const waiters = new Map<string, Set<Waiter>>();
const listeners = new Set<Listener>();
let lastFrameAt = 0;

function asRecord(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : null;
}

function isTerminalStatus(status: string): boolean {
  const st = status.toLowerCase();
  return (
    st.includes("done") ||
    st.includes("complete") ||
    st.includes("success") ||
    st.includes("succeed") ||
    st.includes("fail") ||
    st.includes("error") ||
    st.includes("expir") ||
    st === "succeeded" ||
    st === "failed" ||
    st.includes("confirm") ||
    st.includes("await")
  );
}

function notifyWaiters(commandId: string, cmd: CultAgentCommand) {
  const set = waiters.get(commandId);
  if (!set?.size) return;
  for (const w of set) {
    window.clearTimeout(w.timer);
    w.resolve(cmd);
  }
  waiters.delete(commandId);
}

export function subscribeAgentCommandEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function lastAgentCommandFrameAt(): number {
  return lastFrameAt;
}

/** Drop in-flight WS waiters so a REST fallback can own the deadline. */
export function cancelWaitForAgentCommandEvent(commandId: string): void {
  const set = waiters.get(commandId);
  if (!set?.size) return;
  for (const w of set) {
    if (w.timer) window.clearTimeout(w.timer);
    w.reject(new Error("cancelled"));
  }
  waiters.delete(commandId);
}

/** Wait for a command completion frame pushed over the sidecar /ws bridge. */
export function waitForAgentCommandEvent(
  commandId: string,
  timeoutMs = 0,
): Promise<CultAgentCommand> {
  return new Promise((resolve, reject) => {
    const waiter: Waiter = { resolve, reject, timer: 0 };
    if (timeoutMs > 0) {
      waiter.timer = window.setTimeout(() => {
        const set = waiters.get(commandId);
        if (set) {
          set.delete(waiter);
          if (!set.size) waiters.delete(commandId);
        }
        reject(new Error("Timed out waiting for agent command event"));
      }, timeoutMs);
    }

    let set = waiters.get(commandId);
    if (!set) {
      set = new Set();
      waiters.set(commandId, set);
    }
    set.add(waiter);
  });
}

function commandFromFrame(body: Record<string, unknown>): CultAgentCommand | null {
  const cmd = commandFromRecord(body);
  if (cmd) return cmd;
  const nested = asRecord(body.command) ?? asRecord(body.data);
  return nested ? commandFromRecord(nested) : null;
}

function isAgentCommandFrame(type: string): boolean {
  const t = type.toLowerCase();
  return (
    t.includes("agent.command") ||
    t.includes("cultagent.command") ||
    t === "command" ||
    t === "command.updated" ||
    t === "command.result" ||
    t === "command.completed" ||
    t === "command.dispatched"
  );
}

/** Handle agent command realtime frames from api /v1/ws via the sidecar bridge. */
export function handleAgentCommandWsMessage(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const obj = payload as Record<string, unknown>;
  const type = String(obj.type ?? "");
  const body =
    asRecord(obj.payload) ??
    asRecord(obj.data) ??
    asRecord(obj.command) ??
    obj;

  const looksLikeCommand =
    isAgentCommandFrame(type) ||
    Boolean(
      body &&
        (body.command_id || body.action) &&
        (body.state || body.status || body.result),
    );

  if (!looksLikeCommand) return false;

  const cmd = commandFromFrame(body ?? obj);
  if (!cmd) return true;

  lastFrameAt = Date.now();
  for (const listener of listeners) {
    try {
      listener(cmd, obj);
    } catch {
      /* ignore */
    }
  }
  if (isTerminalStatus(cmd.status)) notifyWaiters(cmd.id, cmd);
  return true;
}
