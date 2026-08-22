import {
  confirmCultAgentCommand,
  enqueueCultAgentCommand,
  isCommandFinished,
  isCommandNeedsConfirm,
  unwrapAgentResult,
  waitForCultAgentCommand,
  type CultAgentCommand,
} from "./cultAgentApi";

export const CONFIRM_ACTIONS = new Set([
  "server.stop",
  "server.restart",
  "server.config.update",
  "builds.provision",
]);

export function boundServerPayload(
  localServerId: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const id = localServerId.trim();
  const rest = { ...extra };
  delete rest.cloud_server_id;
  return {
    ...rest,
    server_id: id,
    local_server_id: id,
  };
}

export function humanCommandPhase(cmd: CultAgentCommand): string {
  const st = String(cmd.status ?? "").toLowerCase();
  if (st.includes("queued") || st === "pending") return "Queued — waiting for the PC";
  if (st.includes("dispatch")) return "Sent to the PC…";
  if (st.includes("succeed") || st.includes("success") || st.includes("done"))
    return "Done";
  if (st.includes("expir")) return "Expired — the PC was offline";
  if (st.includes("fail") || st.includes("error")) return "Failed";
  if (st.includes("confirm") || st.includes("await")) return "Needs confirmation";
  return "Working…";
}

export type BoundCommandInput = {
  nodeId: string;
  action: string;
  localServerId: string;
  cloudServerId?: string | null;
  workloadId?: string | null;
  displayName?: string | null;
  extra?: Record<string, unknown>;
};

/** POST the command. Does not wait for the agent to finish. */
export async function enqueueBoundCommand(
  input: BoundCommandInput,
): Promise<CultAgentCommand> {
  const needsConfirm = CONFIRM_ACTIONS.has(input.action);
  const payload = boundServerPayload(input.localServerId, {
    ...(needsConfirm ? { confirm: true } : {}),
    ...(input.extra ?? {}),
  });
  let current = await enqueueCultAgentCommand(input.nodeId, {
    action: input.action,
    workload_id: input.workloadId ?? undefined,
    payload,
  });
  if (isCommandNeedsConfirm(current) && current.confirmToken) {
    await confirmCultAgentCommand(
      input.nodeId,
      current.id,
      current.confirmToken,
    );
  }
  return current;
}

/** Enqueue a bound-server command through the API and wait for the agent result. */
export async function runBoundCommand(
  input: BoundCommandInput,
): Promise<CultAgentCommand> {
  let current = await enqueueBoundCommand(input);
  if (!isCommandFinished(current) && !isCommandNeedsConfirm(current)) {
    current = await waitForCultAgentCommand(input.nodeId, current.id, {
      timeoutMs: 90_000,
      preferRealtime: true,
    });
  }
  if (isCommandNeedsConfirm(current) && current.confirmToken) {
    await confirmCultAgentCommand(
      input.nodeId,
      current.id,
      current.confirmToken,
    );
    current = await waitForCultAgentCommand(input.nodeId, current.id, {
      timeoutMs: 90_000,
      preferRealtime: true,
    });
  }
  const st = String(current.status ?? "").toLowerCase();
  if (st.includes("expir")) {
    throw new Error(
      "This computer is offline. Open CultAgent on that PC, then try again.",
    );
  }
  if (st.includes("fail") || st.includes("error")) {
    const data = unwrapAgentResult(current.result);
    const err =
      typeof data.error === "string"
        ? data.error
        : "The PC could not run that.";
    throw new Error(err);
  }
  return current;
}

export function parseStatusData(cmd: CultAgentCommand): {
  state: string;
  players?: number;
  maxPlayers?: number;
  uptimeSeconds?: number;
} {
  const data = unwrapAgentResult(cmd.result);
  return {
    state: String(data.state ?? data.status ?? "unknown"),
    players:
      typeof data.players === "number"
        ? data.players
        : typeof data.players_online === "number"
          ? data.players_online
          : undefined,
    maxPlayers:
      typeof data.max_players === "number"
        ? data.max_players
        : typeof data.maxPlayers === "number"
          ? data.maxPlayers
          : undefined,
    uptimeSeconds:
      typeof data.uptime_seconds === "number"
        ? data.uptime_seconds
        : undefined,
  };
}

export function parseConfigProperties(
  cmd: CultAgentCommand,
): Record<string, string> {
  const data = unwrapAgentResult(cmd.result);
  const props = data.properties ?? data.values ?? data;
  if (!props || typeof props !== "object" || Array.isArray(props)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(props as Record<string, unknown>)) {
    if (v == null || typeof v === "object") continue;
    out[k] = String(v);
  }
  return out;
}

export function commandLooksLikeMissingInstall(cmd: CultAgentCommand): boolean {
  const blob = JSON.stringify({
    result: cmd.result,
    status: cmd.status,
    raw: cmd.raw,
  }).toLowerCase();
  return /missing(\s+\w+)?\s+jar|jar not found|not installed|files? missing|no such file|need(s)? provision|build not found|nothing to (start|run)/.test(
    blob,
  );
}

export function parseConsoleFromCommand(cmd: CultAgentCommand): {
  lines: string[];
  nextSeq?: number;
} {
  const data = unwrapAgentResult(cmd.result);
  const blob = data.lines ?? data.output;
  const lines: string[] = [];
  if (Array.isArray(blob)) {
    for (const row of blob) {
      if (typeof row === "string") lines.push(row);
      else if (row && typeof row === "object" && "text" in row) {
        lines.push(String((row as { text: unknown }).text));
      }
    }
  }
  const next =
    typeof data.next_seq === "number"
      ? data.next_seq
      : typeof data.seq === "number"
        ? data.seq
        : undefined;
  return { lines, nextSeq: next };
}
