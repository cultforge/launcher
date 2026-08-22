import {
  enqueueCultAgentCommand,
  waitForCultAgentCommand,
  type CultAgentBinding,
  type CultAgentCommand,
  type CultAgentWorkload,
} from "./cultAgentApi";

export const LOCAL_AGENT_PANEL = "http://127.0.0.1:8720";

export const VANILLA_COMMANDS = [
  "list",
  "say ",
  "tps",
  "whitelist list",
  "op ",
  "deop ",
  "ban ",
  "pardon ",
  "kick ",
  "save-all",
  "stop",
  "reload",
  "time set day",
  "weather clear",
];

export function localServerIdFromBinding(
  binding: CultAgentBinding,
): string | null {
  const raw = binding.raw;
  const candidates = [
    binding.guildServerId,
    binding.personalServerId,
    raw.guild_server_id,
    raw.personal_server_id,
    binding.localServerId,
    raw.local_server_id,
    raw.server_id,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

export function localServerIdForCloudServer(
  workloads: CultAgentWorkload[],
  cloudServerId: string,
): string | null {
  const target = cloudServerId.trim();
  if (!target) return null;
  for (const w of workloads) {
    const raw = w.raw;
    const ids = [
      w.localServerId,
      raw.local_server_id,
      raw.guild_server_id,
      raw.personal_server_id,
      raw.server_id,
      raw.resource_id,
    ];
    if (ids.some((x) => String(x ?? "") === target)) {
      return localServerIdFromWorkload(w) || target;
    }
  }
  return target;
}

export function localServerIdFromWorkload(
  workload: CultAgentWorkload,
): string | null {
  const raw = workload.raw;
  const candidates = [
    workload.localServerId,
    raw.local_server_id,
    raw.resource_id,
    raw.server_id,
    raw.guild_server_id,
    raw.personal_server_id,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

export function serverCommandPayload(
  localServerId: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    local_server_id: localServerId,
    server_id: localServerId,
    resource_id: localServerId,
    ...extra,
  };
}

export async function enqueueServerAction(
  nodeId: string,
  action: string,
  localServerId: string,
  extra?: Record<string, unknown>,
  workloadId?: string,
): Promise<CultAgentCommand> {
  return enqueueCultAgentCommand(nodeId, {
    action,
    workload_id: workloadId,
    payload: serverCommandPayload(localServerId, extra),
  });
}

export async function enqueueAndWait(
  nodeId: string,
  action: string,
  localServerId: string,
  extra?: Record<string, unknown>,
  workloadId?: string,
): Promise<CultAgentCommand> {
  const cmd = await enqueueServerAction(
    nodeId,
    action,
    localServerId,
    extra,
    workloadId,
  );
  try {
    return await waitForCultAgentCommand(nodeId, cmd.id, {
      timeoutMs: 40_000,
      preferRealtime: true,
    });
  } catch {
    return cmd;
  }
}

export function humanizeAgentError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    /429|rate limit|too many connection|forging process throttl/i.test(msg)
  ) {
    return "Too many requests — wait about a minute, then try again.";
  }
  if (/offline|not connected|websocket/i.test(msg) && /agent/i.test(msg)) {
    return "This computer is offline. Commands will run when it comes back.";
  }
  if (/timeout|timed out/i.test(msg)) {
    return "The computer did not answer in time. Check that cf-agent is running.";
  }
  if (/403|forbidden|permission/i.test(msg)) {
    return "You do not have permission to do that.";
  }
  const cleaned = msg
    .replace(/^could not enqueue cultagent command:\s*/i, "")
    .replace(/^cultagentapierror:\s*/i, "");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function remoteControlHint(online: boolean): string {
  return online
    ? "Connected"
    : "Offline — start, stop, and console wait until this computer is back";
}

export function parseConsoleLines(result: unknown): {
  lines: string[];
  nextSeq?: number;
} {
  if (result == null) return { lines: [] };
  if (typeof result === "string") {
    return { lines: result.split(/\r?\n/).filter(Boolean) };
  }
  if (Array.isArray(result)) {
    return {
      lines: result
        .map((row) =>
          typeof row === "string"
            ? row
            : typeof row === "object" && row && "line" in row
              ? String((row as { line: unknown }).line)
              : JSON.stringify(row),
        )
        .filter(Boolean),
    };
  }
  if (typeof result === "object") {
    const obj = result as Record<string, unknown>;
    const nested = obj.data && typeof obj.data === "object" ? (obj.data as Record<string, unknown>) : obj;
    const seq =
      typeof nested.next_seq === "number"
        ? nested.next_seq
        : typeof nested.after_seq === "number"
          ? nested.after_seq
          : undefined;
    const blob =
      nested.lines ??
      nested.output ??
      nested.stdout ??
      nested.log ??
      nested.logs ??
      nested.text;
    if (Array.isArray(blob)) {
      return {
        lines: blob.map((x) => String(x)).filter(Boolean),
        nextSeq: seq,
      };
    }
    if (typeof blob === "string") {
      return { lines: blob.split(/\r?\n/).filter(Boolean), nextSeq: seq };
    }
    try {
      return { lines: [JSON.stringify(nested, null, 2)] };
    } catch {
      return { lines: [String(result)] };
    }
  }
  return { lines: [String(result)] };
}

export async function probeLocalAgentPanel(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_AGENT_PANEL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function localPanelServerUrl(localServerId: string): string {
  return `${LOCAL_AGENT_PANEL}/panel/servers/${encodeURIComponent(localServerId)}/console`;
}

export async function openLocalPanelIfRunning(
  localServerId?: string | null,
): Promise<boolean> {
  const ok = await probeLocalAgentPanel();
  if (!ok) return false;
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  const href = localServerId
    ? localPanelServerUrl(localServerId)
    : `${LOCAL_AGENT_PANEL}/panel/`;
  await openUrl(href);
  return true;
}

export type ServerControlContext = {
  nodeId: string;
  localServerId: string;
  workloadId?: string;
};

export type ControlTransport = "local" | "remote";

export type ServerRunState = "running" | "stopped" | "unknown";

export function runningStateFromText(
  state: string | null | undefined,
): ServerRunState {
  const s = (state ?? "").toLowerCase();
  if (s.includes("run") || s.includes("online") || s.includes("started")) {
    return "running";
  }
  if (s.includes("stop") || s.includes("offline")) return "stopped";
  return "unknown";
}

let localProbeCache: { ok: boolean; at: number } | null = null;

export async function resolveControlTransport(): Promise<ControlTransport> {
  const now = Date.now();
  if (localProbeCache && now - localProbeCache.at < 8000) {
    return localProbeCache.ok ? "local" : "remote";
  }
  const ok = await probeLocalAgentPanel();
  localProbeCache = { ok, at: now };
  return ok ? "local" : "remote";
}

async function localJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${LOCAL_AGENT_PANEL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(8000),
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Local agent ${res.status}`);
  }
  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}

export async function readConsoleViaControl(
  ctx: ServerControlContext,
  afterSeq = 0,
  limit = 120,
  transport?: ControlTransport,
): Promise<{ lines: string[]; nextSeq?: number; transport: ControlTransport }> {
  const mode = transport ?? (await resolveControlTransport());
  if (mode === "local") {
    const q = new URLSearchParams({ limit: String(limit) });
    if (afterSeq > 0) q.set("after_seq", String(afterSeq));
    const raw = await localJson<unknown>(
      `/v1/servers/${encodeURIComponent(ctx.localServerId)}/console?${q}`,
    );
    const parsed = parseConsoleLines(raw);
    return { ...parsed, transport: "local" };
  }
  const cmd = await enqueueAndWait(
    ctx.nodeId,
    "server.console.read",
    ctx.localServerId,
    { after_seq: afterSeq, limit },
    ctx.workloadId,
  );
  return { ...parseConsoleLines(cmd.result), transport: "remote" };
}

export async function executeConsoleViaControl(
  ctx: ServerControlContext,
  command: string,
  transport?: ControlTransport,
): Promise<{ lines: string[]; transport: ControlTransport }> {
  const mode = transport ?? (await resolveControlTransport());
  if (mode === "local") {
    const raw = await localJson<unknown>(
      `/v1/servers/${encodeURIComponent(ctx.localServerId)}/console`,
      {
        method: "POST",
        body: JSON.stringify({ command }),
      },
    );
    return { lines: parseConsoleLines(raw).lines, transport: "local" };
  }
  const cmd = await enqueueAndWait(
    ctx.nodeId,
    "server.console.execute",
    ctx.localServerId,
    { command },
    ctx.workloadId,
  );
  return { lines: parseConsoleLines(cmd.result).lines, transport: "remote" };
}

export async function lifecycleViaControl(
  ctx: ServerControlContext,
  action: "server.start" | "server.stop" | "server.restart",
  transport?: ControlTransport,
): Promise<ControlTransport> {
  const mode = transport ?? (await resolveControlTransport());
  if (mode === "local") {
    const path =
      action === "server.start"
        ? "start"
        : action === "server.stop"
          ? "stop"
          : "restart";
    const body =
      action === "server.start" ? JSON.stringify({ accept_eula: true }) : "{}";
    await localJson<unknown>(
      `/v1/servers/${encodeURIComponent(ctx.localServerId)}/${path}`,
      { method: "POST", body },
    );
    return "local";
  }
  await enqueueServerAction(
    ctx.nodeId,
    action,
    ctx.localServerId,
    action === "server.start" ? { accept_eula: true } : {},
    ctx.workloadId,
  );
  return "remote";
}

export async function fetchServerStatusViaControl(
  ctx: ServerControlContext,
  transport?: ControlTransport,
): Promise<{
  state: ServerRunState;
  playersOnline?: number;
  playersMax?: number;
  transport: ControlTransport;
}> {
  const mode = transport ?? (await resolveControlTransport());
  if (mode === "local") {
    try {
      const raw = await localJson<Record<string, unknown>>(
        `/v1/servers/${encodeURIComponent(ctx.localServerId)}`,
      );
      const nested =
        raw.data && typeof raw.data === "object"
          ? (raw.data as Record<string, unknown>)
          : raw;
      const state = runningStateFromText(
        String(nested.state ?? nested.status ?? nested.local_state ?? ""),
      );
      return {
        state,
        playersOnline: Number(nested.players_online ?? nested.playersOnline ?? 0) || 0,
        playersMax: Number(nested.players_max ?? nested.playersMax ?? 0) || 0,
        transport: "local",
      };
    } catch {
      return { state: "unknown", transport: "local" };
    }
  }
  try {
    const cmd = await enqueueAndWait(
      ctx.nodeId,
      "server.status",
      ctx.localServerId,
      {},
      ctx.workloadId,
    );
    const result = cmd.result;
    const obj =
      result && typeof result === "object"
        ? ((result as Record<string, unknown>).data ?? result)
        : result;
    const rec =
      obj && typeof obj === "object" ? (obj as Record<string, unknown>) : {};
    return {
      state: runningStateFromText(
        String(rec.state ?? rec.status ?? rec.local_state ?? ""),
      ),
      playersOnline: Number(rec.players_online ?? rec.playersOnline ?? 0) || 0,
      playersMax: Number(rec.players_max ?? rec.playersMax ?? 0) || 0,
      transport: "remote",
    };
  } catch {
    return { state: "unknown", transport: "remote" };
  }
}

export type LocalFileEntry = {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
};

export async function listLocalServerFiles(
  localServerId: string,
  path = ".",
): Promise<LocalFileEntry[]> {
  const q = new URLSearchParams({ path });
  const raw = await localJson<unknown>(
    `/v1/servers/${encodeURIComponent(localServerId)}/files?${q}`,
  );
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const nested =
    obj.data && typeof obj.data === "object"
      ? (obj.data as Record<string, unknown>)
      : obj;
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(nested.entries)
      ? nested.entries
      : Array.isArray(nested.files)
        ? nested.files
        : Array.isArray(nested.items)
          ? nested.items
          : [];
  return list
    .map((row): LocalFileEntry | null => {
      if (typeof row === "string") {
        return { name: row, path: row, isDir: row.endsWith("/") };
      }
      if (!row || typeof row !== "object") return null;
      const rec = row as Record<string, unknown>;
      const name = String(rec.name ?? rec.filename ?? rec.path ?? "").trim();
      if (!name) return null;
      return {
        name,
        path: String(rec.path ?? rec.relpath ?? name),
        isDir: Boolean(rec.is_dir ?? rec.isDir ?? rec.directory ?? rec.type === "dir"),
        size: typeof rec.size === "number" ? rec.size : undefined,
      };
    })
    .filter((x): x is LocalFileEntry => Boolean(x));
}
