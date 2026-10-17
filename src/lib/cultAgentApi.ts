import { ClientHttpError, send, sendMutate } from "./client";

export class CultAgentApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "CultAgentApiError";
    this.status = status;
  }
}

export type CultAgentNode = {
  id: string;
  name: string;
  status: string;
  guildId?: string | null;
  /** Account that owns this node (API owner_id). */
  ownerId?: string | null;
  /** Display handle for the owner when known. */
  ownerHandle?: string | null;
  lastSeenAt?: string | null;
  platform?: string | null;
  version?: string | null;
  raw: Record<string, unknown>;
};

/** True when the signed-in user owns this node. */
export function isAgentNodeOwnedBy(
  node: CultAgentNode,
  userId: string | null | undefined,
): boolean {
  const me = (userId ?? "").trim();
  if (!me) return false;
  const owner = (node.ownerId ?? "").trim();
  if (!owner) return true; // treat missing owner as owned (personal /v1/agents lists)
  return owner === me;
}

/** True when the node credentials were revoked (unregister). */
export function isAgentNodeRevoked(node: CultAgentNode): boolean {
  const s = node.status.toLowerCase();
  if (s.includes("revoked")) return true;
  const raw = node.raw;
  if (raw.is_revoked === true || raw.isRevoked === true) return true;
  if (typeof raw.revoked_at === "string" && raw.revoked_at.trim()) return true;
  if (typeof raw.revokedAt === "string" && raw.revokedAt.trim()) return true;
  return false;
}

export function isAgentNodeOnline(node: CultAgentNode): boolean {
  if (isAgentNodeRevoked(node)) return false;
  const raw = node.raw;
  if (
    raw.online === true ||
    raw.connected === true ||
    raw.is_online === true ||
    raw.isOnline === true
  ) {
    return true;
  }
  if (raw.online === false || raw.connected === false) return false;
  const st = node.status.trim().toLowerCase();
  if (st === "true" || st === "1" || st === "yes") return true;
  if (/offline|disconnect|revoked|dead/i.test(st)) return false;
  if (/online|connected|ready|healthy|alive|active|idle|up\b/i.test(st)) {
    return true;
  }
  if (node.lastSeenAt) {
    const ts = Date.parse(node.lastSeenAt);
    if (Number.isFinite(ts) && Date.now() - ts < 120_000) return true;
  }
  return false;
}

function nodeRecencyScore(node: CultAgentNode): number {
  let score = 0;
  if (isAgentNodeOnline(node)) score += 1_000_000;
  if (node.guildId) score += 10_000;
  const ts = node.lastSeenAt ? Date.parse(node.lastSeenAt) : 0;
  if (Number.isFinite(ts)) score += ts / 1000;
  return score;
}

/** Hide revoked nodes and optionally collapse duplicate hostname registrations. */
export function filterActiveAgentNodes(
  nodes: CultAgentNode[],
  opts: { dedupe?: boolean } = {},
): CultAgentNode[] {
  const active = nodes.filter((n) => !isAgentNodeRevoked(n));
  if (opts.dedupe === false) return active;
  const byKey = new Map<string, CultAgentNode>();
  for (const node of active) {
    const key = node.name.trim().toLowerCase() || node.id;
    const prev = byKey.get(key);
    if (!prev || nodeRecencyScore(node) > nodeRecencyScore(prev)) {
      byKey.set(key, node);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => {
    const ao = isAgentNodeOnline(a) ? 0 : 1;
    const bo = isAgentNodeOnline(b) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
  });
}

export function listRevokedAgentNodes(
  nodes: CultAgentNode[],
): CultAgentNode[] {
  return nodes.filter(isAgentNodeRevoked);
}

export type CultAgentPairing = {
  code: string;
  expiresAt?: string | null;
  claimUrl?: string | null;
  raw: Record<string, unknown>;
};

export type CultAgentDeviceStart = {
  userCode: string;
  deviceCode?: string | null;
  verificationUri?: string | null;
  verificationUriComplete?: string | null;
  expiresIn?: number | null;
  interval?: number | null;
  raw: Record<string, unknown>;
};

export type CultAgentCommand = {
  id: string;
  action: string;
  status: string;
  confirmToken?: string | null;
  /** Agent-reported result / stdout / listing payload when finished. */
  result?: unknown;
  raw: Record<string, unknown>;
};

export type CultAgentWorkload = {
  id: string;
  displayName: string;
  desiredState: string;
  reportedState?: string | null;
  buildId?: string | null;
  localServerId?: string | null;
  raw: Record<string, unknown>;
};

function wrap(prefix: string, err: unknown): CultAgentApiError {
  if (err instanceof ClientHttpError) {
    return new CultAgentApiError(`${prefix}: ${err.message}`, err.status);
  }
  if (err instanceof CultAgentApiError) return err;
  return new CultAgentApiError(
    `${prefix}: ${err instanceof Error ? err.message : String(err)}`,
  );
}

function asRecord(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return data as Record<string, unknown>;
}

function unwrapList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const obj = asRecord(data);
  if (!obj) return [];

  const listKeys = [
    "data",
    "items",
    "agents",
    "nodes",
    "results",
    "commands",
    "workloads",
    "agent_nodes",
    "agentNodes",
  ] as const;

  for (const key of listKeys) {
    const val = obj[key];
    if (Array.isArray(val)) return val as unknown[];
    const nested = asRecord(val);
    if (nested) {
      for (const inner of listKeys) {
        if (Array.isArray(nested[inner])) return nested[inner] as unknown[];
      }
    }
  }

  const nested = asRecord(obj.data);
  if (nested) {
    for (const key of listKeys) {
      if (Array.isArray(nested[key])) return nested[key] as unknown[];
    }
  }
  return [];
}

function nodeFromRecord(row: unknown): CultAgentNode | null {
  const obj = asRecord(row);
  if (!obj) return null;
  const id = String(
    obj.id ??
      obj.node_id ??
      obj.nodeId ??
      obj.anode_id ??
      obj.anodeId ??
      obj.agent_id ??
      obj.agentId ??
      "",
  ).trim();
  if (!id) return null;
  const name = String(
    obj.name ?? obj.hostname ?? obj.label ?? obj.display_name ?? id,
  ).trim();
  const onlineFlag = obj.online ?? obj.connected ?? obj.is_online ?? obj.isOnline;
  let status = String(obj.status ?? obj.state ?? "").trim();
  if (!status) {
    if (onlineFlag === true || onlineFlag === "true" || onlineFlag === 1) {
      status = "online";
    } else if (onlineFlag === false || onlineFlag === "false" || onlineFlag === 0) {
      status = "offline";
    } else {
      status = "unknown";
    }
  }
  const lastSeenRaw =
    obj.last_seen_at ?? obj.lastSeenAt ?? obj.heartbeat_at ?? obj.last_seen;
  let lastSeenAt: string | null = null;
  if (typeof lastSeenRaw === "string" && lastSeenRaw.trim()) {
    lastSeenAt = lastSeenRaw;
  } else if (typeof lastSeenRaw === "number" && Number.isFinite(lastSeenRaw)) {
    const ms = lastSeenRaw < 1e12 ? lastSeenRaw * 1000 : lastSeenRaw;
    lastSeenAt = new Date(ms).toISOString();
  }
  const ownerId = String(
    obj.owner_id ?? obj.ownerId ?? obj.user_id ?? obj.userId ?? "",
  ).trim();
  const ownerHandle = String(
    obj.owner_handle ??
      obj.ownerHandle ??
      obj.owner_username ??
      obj.ownerUsername ??
      obj.owner_name ??
      obj.ownerName ??
      obj.handle_name ??
      obj.username ??
      "",
  ).trim();
  return {
    id,
    name,
    status,
    guildId:
      typeof obj.guild_id === "string"
        ? obj.guild_id
        : typeof obj.guildId === "string"
          ? obj.guildId
          : null,
    ownerId: ownerId || null,
    ownerHandle: ownerHandle || null,
    lastSeenAt,
    platform:
      typeof obj.platform === "string"
        ? obj.platform
        : typeof obj.os === "string"
          ? obj.os
          : null,
    version:
      typeof obj.version === "string"
        ? obj.version
        : typeof obj.agent_version === "string"
          ? obj.agent_version
          : null,
    raw: obj,
  };
}

export function commandFromRecord(row: unknown): CultAgentCommand | null {
  const obj = asRecord(row);
  if (!obj) return null;
  const id = String(obj.id ?? obj.command_id ?? "").trim();
  if (!id) return null;
  const result =
    obj.result ??
    obj.output ??
    obj.response ??
    obj.data ??
    obj.payload ??
    null;
  return {
    id,
    action: String(obj.action ?? obj.type ?? "command"),
    status: String(obj.status ?? obj.state ?? "unknown"),
    confirmToken:
      typeof obj.confirm_token === "string"
        ? obj.confirm_token
        : typeof obj.confirmToken === "string"
          ? obj.confirmToken
          : null,
    result: result === null ? undefined : result,
    raw: obj,
  };
}

/** Pretty-print agent command result for Crafty panels. */
export function formatCultAgentCommandResult(result: unknown): string {
  if (result == null) return "";
  if (typeof result === "string") return result;
  if (typeof result === "number" || typeof result === "boolean") {
    return String(result);
  }
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

export function unwrapAgentResult(
  result: unknown,
): Record<string, unknown> {
  if (!result || typeof result !== "object") return {};
  const obj = result as Record<string, unknown>;
  const data = asRecord(obj.data);
  return data ?? obj;
}

export function commandState(cmd: CultAgentCommand): string {
  return String(cmd.status ?? cmd.raw.state ?? "").toLowerCase();
}

export function isCommandFinished(cmd: CultAgentCommand): boolean {
  const st = commandState(cmd);
  return (
    st.includes("succeed") ||
    st.includes("success") ||
    st.includes("fail") ||
    st.includes("error") ||
    st.includes("expir") ||
    st.includes("done") ||
    st.includes("complete")
  );
}

export function isCommandNeedsConfirm(cmd: CultAgentCommand): boolean {
  const st = commandState(cmd);
  return st.includes("confirm") || st.includes("await");
}

/** GET /v1/agents/{node_id}/commands/{command_id} */
export async function getCultAgentCommand(
  nodeId: string,
  commandId: string,
): Promise<CultAgentCommand> {
  try {
    const raw = await send<unknown>("api", "get_command_for_a_node", {
      node_id: nodeId,
      command_id: commandId,
    });
    const obj = asRecord(raw) ?? {};
    const row = commandFromRecord(asRecord(obj.data) ?? obj);
    if (row) return row;
  } catch {
    /* fall back to list */
  }
  const list = await listCultAgentCommands(nodeId);
  const found = list.find((c) => c.id === commandId);
  if (!found) {
    throw new CultAgentApiError("Command not found", 404);
  }
  return found;
}

export type WorkloadConsoleSnapshot = {
  lines: { seq?: number; ts?: string; text: string }[];
  nextSeq?: number;
};

export async function getWorkloadConsoleSnapshot(
  nodeId: string,
  workloadId: string,
  afterSeq = 0,
  limit = 200,
): Promise<WorkloadConsoleSnapshot | null> {
  try {
    const raw = await send<unknown>("api", "get_workload_console_snapshot", {
      node_id: nodeId,
      workload_id: workloadId,
      after_seq: String(afterSeq),
      limit: String(limit),
    });
    const obj = asRecord(raw) ?? {};
    const data = asRecord(obj.data) ?? obj;
    const blob = data.lines ?? data.output;
    const lines: { seq?: number; ts?: string; text: string }[] = [];
    if (Array.isArray(blob)) {
      for (const row of blob) {
        if (typeof row === "string") {
          lines.push({ text: row });
        } else if (row && typeof row === "object") {
          const rec = row as Record<string, unknown>;
          lines.push({
            seq: typeof rec.seq === "number" ? rec.seq : undefined,
            ts: typeof rec.ts === "string" ? rec.ts : undefined,
            text: String(rec.text ?? rec.line ?? rec.message ?? ""),
          });
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
  } catch {
    return null;
  }
}

export async function waitForCultAgentCommand(
  nodeId: string,
  commandId: string,
  opts: { timeoutMs?: number; intervalMs?: number; preferRealtime?: boolean } = {},
): Promise<CultAgentCommand> {
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const intervalMs = opts.intervalMs ?? 2_000;
  const started = Date.now();

  const pollOnce = async (): Promise<CultAgentCommand | null> => {
    try {
      const found = await getCultAgentCommand(nodeId, commandId);
      if (isCommandFinished(found) || isCommandNeedsConfirm(found)) return found;
    } catch {
      return null;
    }
    return null;
  };

  if (opts.preferRealtime !== false) {
    try {
      const {
        waitForAgentCommandEvent,
        cancelWaitForAgentCommandEvent,
      } = await import("./agentCommandEvents");
      const wsPromise = waitForAgentCommandEvent(commandId, 0);
      void wsPromise.catch(() => undefined);
      const pollPromise = (async () => {
        while (Date.now() - started < timeoutMs) {
          const done = await pollOnce();
          if (done) return done;
          await new Promise((r) => window.setTimeout(r, intervalMs));
        }
        throw new CultAgentApiError(
          "The computer did not finish in time. It may be offline.",
          408,
        );
      })();
      try {
        return await Promise.race([wsPromise, pollPromise]);
      } finally {
        cancelWaitForAgentCommandEvent(commandId);
      }
    } catch (err) {
      if (err instanceof CultAgentApiError) throw err;
      /* WS helper unavailable — poll */
    }
  }

  while (Date.now() - started < timeoutMs) {
    const done = await pollOnce();
    if (done) return done;
    await new Promise((r) => window.setTimeout(r, intervalMs));
  }
  throw new CultAgentApiError(
    "The computer did not finish in time. It may be offline.",
    408,
  );
}

function workloadFromRecord(row: unknown): CultAgentWorkload | null {
  const obj = asRecord(row);
  if (!obj) return null;
  const id = String(obj.id ?? obj.workload_id ?? "").trim();
  if (!id) return null;
  return {
    id,
    displayName: String(
      obj.display_name ?? obj.displayName ?? obj.name ?? id,
    ),
    desiredState: String(
      obj.desired_state ?? obj.desiredState ?? "stopped",
    ),
    reportedState:
      typeof obj.reported_state === "string"
        ? obj.reported_state
        : typeof obj.local_state === "string"
          ? obj.local_state
          : typeof obj.state === "string"
            ? obj.state
            : null,
    buildId:
      typeof obj.build_id === "string"
        ? obj.build_id
        : typeof obj.buildId === "string"
          ? obj.buildId
          : null,
    localServerId:
      typeof obj.local_server_id === "string"
        ? obj.local_server_id
        : typeof obj.resource_id === "string"
          ? obj.resource_id
          : typeof obj.server_id === "string"
            ? obj.server_id
            : typeof obj.guild_server_id === "string"
              ? obj.guild_server_id
              : typeof obj.personal_server_id === "string"
                ? obj.personal_server_id
                : null,
    raw: obj,
  };
}

export function mergeAgentNodeLists(
  ...lists: CultAgentNode[][]
): CultAgentNode[] {
  const byId = new Map<string, CultAgentNode>();
  for (const list of lists) {
    for (const node of list) {
      const prev = byId.get(node.id);
      if (!prev || nodeRecencyScore(node) > nodeRecencyScore(prev)) {
        byId.set(node.id, node);
      }
    }
  }
  return Array.from(byId.values());
}

/** Personal + guild agent nodes the signed-in user can see. */
export async function listAccessibleCultAgentNodes(
  guildIds: string[],
  opts: { includeRevoked?: boolean; dedupe?: boolean } = {},
): Promise<CultAgentNode[]> {
  const personal = await listMyCultAgentNodes(50, {
    ...opts,
    dedupe: false,
  }).catch(() => [] as CultAgentNode[]);
  const guildLists = await Promise.all(
    guildIds.map((guildId) =>
      listGuildCultAgentNodes(guildId, 50, { ...opts, dedupe: false }).catch(
        () => [] as CultAgentNode[],
      ),
    ),
  );
  const merged = mergeAgentNodeLists(personal, ...guildLists);
  if (opts.includeRevoked) return merged;
  return filterActiveAgentNodes(merged, { dedupe: opts.dedupe });
}

/** GET /v1/agents — nodes owned by the signed-in user. */
export async function listMyCultAgentNodes(
  limit = 50,
  opts: { includeRevoked?: boolean; dedupe?: boolean } = {},
): Promise<CultAgentNode[]> {
  try {
    const raw = await send<unknown>("api", "list_my_cultagent_nodes", {
      limit: String(limit),
    });
    const all = unwrapList(raw)
      .map(nodeFromRecord)
      .filter((x): x is CultAgentNode => Boolean(x));
    if (opts.includeRevoked) return all;
    return filterActiveAgentNodes(all, { dedupe: opts.dedupe });
  } catch (err) {
    throw wrap("Could not list CultAgent nodes", err);
  }
}

/** GET /v1/guilds/{guild_id}/agents?scope=mine|all — default mine. */
export async function listGuildCultAgentNodes(
  guildId: string,
  limit = 50,
  opts: {
    includeRevoked?: boolean;
    dedupe?: boolean;
    scope?: "mine" | "all";
  } = {},
): Promise<CultAgentNode[]> {
  try {
    const raw = await send<unknown>("api", "list_cultagent_nodes_for_a_guild", {
      guild_id: guildId,
      limit: String(limit),
      scope: opts.scope ?? "mine",
    });
    const all = unwrapList(raw)
      .map(nodeFromRecord)
      .filter((x): x is CultAgentNode => Boolean(x));
    if (opts.includeRevoked) return all;
    return filterActiveAgentNodes(all, { dedupe: opts.dedupe });
  } catch (err) {
    throw wrap("Could not list guild CultAgent nodes", err);
  }
}

/** GET /v1/agents/{node_id} */
export async function getCultAgentNode(nodeId: string): Promise<CultAgentNode> {
  try {
    const raw = await send<unknown>("api", "get_cultagent_node", {
      node_id: nodeId,
    });
    const obj = asRecord(raw) ?? {};
    const node = nodeFromRecord(asRecord(obj.data) ?? obj);
    if (!node) throw new CultAgentApiError("Malformed node response", 502);
    return node;
  } catch (err) {
    throw wrap("Could not load CultAgent node", err);
  }
}

/** POST /v1/agents/pairing */
export async function createCultAgentPairingCode(
  guildId?: string | null,
): Promise<CultAgentPairing> {
  try {
    const body: Record<string, unknown> = {};
    if (guildId) body.guild_id = guildId;
    const raw = await sendMutate(
      "api",
      "create_a_short-lived_pairing_code_for_cf-agent_claim",
      body,
      "POST",
    );
    const obj = asRecord(raw) ?? {};
    const data = asRecord(obj.data) ?? obj;
    const code = String(
      data.code ?? data.pairing_code ?? data.pairingCode ?? "",
    ).trim();
    if (!code) {
      throw new CultAgentApiError("Pairing response missing code", 502);
    }
    return {
      code,
      expiresAt:
        typeof data.expires_at === "string"
          ? data.expires_at
          : typeof data.expiresAt === "string"
            ? data.expiresAt
            : null,
      claimUrl:
        typeof data.claim_url === "string"
          ? data.claim_url
          : typeof data.claimUrl === "string"
            ? data.claimUrl
            : null,
      raw: data,
    };
  } catch (err) {
    throw wrap("Could not create CultAgent pairing code", err);
  }
}

/** POST /v1/agents/device/start — started by cf-agent; launcher may also trigger for UX. */
export async function startCultAgentDeviceLogin(): Promise<CultAgentDeviceStart> {
  try {
    const raw = await sendMutate(
      "api",
      "start_gh-style_device_login_(cf-agent_login)",
      {},
      "POST",
    );
    const obj = asRecord(raw) ?? {};
    const data = asRecord(obj.data) ?? obj;
    const userCode = String(
      data.user_code ?? data.userCode ?? data.code ?? "",
    ).trim();
    if (!userCode) {
      throw new CultAgentApiError("Device login missing user_code", 502);
    }
    return {
      userCode,
      deviceCode:
        typeof data.device_code === "string"
          ? data.device_code
          : typeof data.deviceCode === "string"
            ? data.deviceCode
            : null,
      verificationUri:
        typeof data.verification_uri === "string"
          ? data.verification_uri
          : typeof data.verificationUri === "string"
            ? data.verificationUri
            : null,
      verificationUriComplete:
        typeof data.verification_uri_complete === "string"
          ? data.verification_uri_complete
          : typeof data.verificationUriComplete === "string"
            ? data.verificationUriComplete
            : null,
      expiresIn:
        typeof data.expires_in === "number"
          ? data.expires_in
          : typeof data.expiresIn === "number"
            ? data.expiresIn
            : null,
      interval:
        typeof data.interval === "number" ? data.interval : null,
      raw: data,
    };
  } catch (err) {
    throw wrap("Could not start CultAgent device login", err);
  }
}

/** POST /v1/agents/device/approve — launcher JWT. */
export async function approveCultAgentDeviceLogin(
  userCode: string,
  guildId?: string | null,
): Promise<unknown> {
  const code = userCode.trim();
  if (!code) throw new CultAgentApiError("user_code is required", 400);
  try {
    const body: Record<string, unknown> = { user_code: code };
    if (guildId) body.guild_id = guildId;
    else body.guild_id = null;
    return await sendMutate(
      "api",
      "approve_a_pending_device_login_(browser_/_launcher)",
      body,
      "POST",
    );
  } catch (err) {
    throw wrap("Could not approve CultAgent device login", err);
  }
}

/** POST /v1/guilds/{guild_id}/agents/{node_id}/attach */
export async function attachCultAgentToGuild(
  guildId: string,
  nodeId: string,
): Promise<unknown> {
  try {
    return await sendMutate(
      "api",
      "attach_an_agent_node_to_a_guild_(guildmaster_/_agent.manage)",
      { guild_id: guildId, node_id: nodeId },
      "POST",
    );
  } catch (err) {
    throw wrap("Could not attach CultAgent to guild", err);
  }
}

/** POST /v1/guilds/{guild_id}/agents/{node_id}/detach */
export async function detachCultAgentFromGuild(
  guildId: string,
  nodeId: string,
): Promise<unknown> {
  try {
    return await sendMutate(
      "api",
      "detach_an_agent_node_from_a_guild",
      { guild_id: guildId, node_id: nodeId },
      "POST",
    );
  } catch (err) {
    throw wrap("Could not detach CultAgent from guild", err);
  }
}

/** POST /v1/agents/{node_id}/revoke */
export async function revokeCultAgentNode(nodeId: string): Promise<unknown> {
  try {
    return await sendMutate(
      "api",
      "revoke_agent_credentials",
      { node_id: nodeId },
      "POST",
    );
  } catch (err) {
    throw wrap("Could not revoke CultAgent node", err);
  }
}

/** POST /v1/agents/{node_id}/rotate-token — returns new cagt_… once. */
export async function rotateCultAgentToken(
  nodeId: string,
): Promise<{ agentToken: string | null; raw: Record<string, unknown> }> {
  try {
    const raw = await sendMutate(
      "api",
      "rotate_agent_token_(returns_new_token_once)",
      { node_id: nodeId },
      "POST",
    );
    const obj = asRecord(raw) ?? {};
    const data = asRecord(obj.data) ?? obj;
    const token = String(
      data.agent_token ?? data.agentToken ?? data.token ?? "",
    ).trim();
    return { agentToken: token || null, raw: data };
  } catch (err) {
    throw wrap("Could not rotate CultAgent token", err);
  }
}

/** GET /v1/agents/{node_id}/telemetry — agent writes; launcher reads. */
export async function getCultAgentNodeTelemetry(
  nodeId: string,
): Promise<Record<string, unknown>> {
  try {
    const raw = await send<unknown>("api", "get_cultagent_node_telemetry", {
      node_id: nodeId,
    });
    const obj = asRecord(raw) ?? {};
    const data = asRecord(obj.data) ?? obj;
    // Prefer nested wrappers but keep activity/consoles (INTEGRATION §3.6).
    const nested =
      asRecord(data.telemetry) ??
      asRecord(data.snapshot) ??
      asRecord(data.metrics) ??
      asRecord(data.payload) ??
      data;
    const metrics = asRecord(data.metrics) ?? asRecord(nested.metrics);
    const activity =
      data.activity ?? nested.activity ?? metrics?.activity ?? null;
    const consoles =
      data.consoles ?? nested.consoles ?? metrics?.consoles ?? null;
    const presence =
      data.presence ?? nested.presence ?? metrics?.presence ?? null;
    const transport =
      data.transport ??
      nested.transport ??
      metrics?.transport ??
      data.realtime ??
      nested.realtime ??
      null;
    const merged: Record<string, unknown> = { ...nested };
    if (metrics) {
      for (const [k, v] of Object.entries(metrics)) {
        if (!(k in merged)) merged[k] = v;
      }
    }
    if (activity != null) merged.activity = activity;
    if (consoles != null) merged.consoles = consoles;
    if (presence != null) merged.presence = presence;
    if (transport != null) merged.transport = transport;
    return merged;
  } catch (err) {
    throw wrap("Could not fetch CultAgent telemetry", err);
  }
}

/** GET /v1/agents/{node_id}/workloads */
export async function listCultAgentWorkloads(
  nodeId: string,
): Promise<CultAgentWorkload[]> {
  try {
    const raw = await send<unknown>("api", "list_workloads_on_a_node", {
      node_id: nodeId,
    });
    return unwrapList(raw)
      .map(workloadFromRecord)
      .filter((x): x is CultAgentWorkload => Boolean(x));
  } catch (err) {
    throw wrap("Could not list CultAgent workloads", err);
  }
}

/** POST /v1/agents/{node_id}/workloads — desired state only. */
export async function upsertCultAgentWorkload(
  nodeId: string,
  payload: Record<string, unknown>,
): Promise<CultAgentWorkload | null> {
  try {
    const raw = await sendMutate(
      "api",
      "attach_a_workload_to_a_node",
      { node_id: nodeId, ...payload },
      "POST",
    );
    const obj = asRecord(raw) ?? {};
    return workloadFromRecord(asRecord(obj.data) ?? obj);
  } catch (err) {
    throw wrap("Could not update CultAgent workload", err);
  }
}

/** GET /v1/agents/{node_id}/commands */
export async function listCultAgentCommands(
  nodeId: string,
): Promise<CultAgentCommand[]> {
  try {
    const raw = await send<unknown>("api", "list_commands_for_a_node", {
      node_id: nodeId,
    });
    return unwrapList(raw)
      .map(commandFromRecord)
      .filter((x): x is CultAgentCommand => Boolean(x));
  } catch (err) {
    throw wrap("Could not list CultAgent commands", err);
  }
}

/** POST /v1/agents/{node_id}/commands */
export async function enqueueCultAgentCommand(
  nodeId: string,
  command: {
    action: string;
    payload?: Record<string, unknown>;
    workload_id?: string;
    local_server_id?: string;
    confirm?: boolean;
  },
): Promise<CultAgentCommand> {
  try {
    const raw = await sendMutate(
      "api",
      "enqueue_a_command_for_the_agent_to_poll",
      {
        node_id: nodeId,
        action: command.action,
        payload: command.payload ?? {},
        ...(command.workload_id ? { workload_id: command.workload_id } : {}),
        ...(command.local_server_id
          ? { local_server_id: command.local_server_id }
          : {}),
        ...(command.confirm ? { confirm: true } : {}),
      },
      "POST",
    );
    const obj = asRecord(raw) ?? {};
    if (
      Array.isArray(raw) ||
      Array.isArray(obj.data) ||
      Array.isArray(obj.items) ||
      Array.isArray(obj.commands)
    ) {
      throw new CultAgentApiError(
        "Command was not created (API returned a list)",
        502,
      );
    }
    const row = commandFromRecord(asRecord(obj.data) ?? obj);
    if (!row) throw new CultAgentApiError("Malformed command response", 502);
    return row;
  } catch (err) {
    throw wrap("Could not enqueue CultAgent command", err);
  }
}

/** POST /v1/agents/{node_id}/commands/{command_id}/confirm */
export async function confirmCultAgentCommand(
  nodeId: string,
  commandId: string,
  confirmToken: string,
): Promise<unknown> {
  try {
    return await sendMutate(
      "api",
      "confirm_a_high-risk_command_(e.g._backup.restore)",
      {
        node_id: nodeId,
        command_id: commandId,
        confirm_token: confirmToken,
      },
      "POST",
    );
  } catch (err) {
    throw wrap("Could not confirm CultAgent command", err);
  }
}

export type CultAgentRuntimeSnapshot = {
  workloadId: string;
  state: string;
  playerCount: number;
  tps?: number | null;
  mspt?: number | null;
  worldMeta?: Record<string, unknown> | null;
  recordedAt?: string | null;
  guildServerId?: string | null;
  raw: Record<string, unknown>;
};

export type CultAgentPlayerPresence = {
  uuid: string;
  name: string;
  ping?: number | null;
  gamemode?: string | null;
  dimension?: string | null;
  workloadId?: string | null;
  guildServerId?: string | null;
  cultforgeUserId?: string | null;
  raw: Record<string, unknown>;
};

export type CultAgentGameEvent = {
  id: string;
  eventType: string;
  minecraftName?: string | null;
  minecraftUuid?: string | null;
  payload?: Record<string, unknown> | null;
  occurredAt?: string | null;
  workloadId?: string | null;
  guildServerId?: string | null;
  raw: Record<string, unknown>;
};

export type CultAgentCommandProfile = {
  schemaVersion?: number;
  config: Record<string, unknown>;
  raw: Record<string, unknown>;
};

function runtimeFromRecord(row: unknown): CultAgentRuntimeSnapshot | null {
  const obj = asRecord(row);
  if (!obj) return null;
  const workloadId = String(
    obj.workload_id ?? obj.workloadId ?? obj.id ?? "",
  ).trim();
  if (!workloadId) return null;
  return {
    workloadId,
    state: String(obj.state ?? obj.status ?? "unknown"),
    playerCount: Number(obj.player_count ?? obj.playerCount ?? 0) || 0,
    tps:
      typeof obj.tps === "number"
        ? obj.tps
        : typeof obj.TPS === "number"
          ? obj.TPS
          : null,
    mspt:
      typeof obj.mspt === "number"
        ? obj.mspt
        : typeof obj.MSPT === "number"
          ? obj.MSPT
          : null,
    worldMeta: asRecord(obj.world_meta ?? obj.worldMeta),
    recordedAt:
      typeof obj.recorded_at === "string"
        ? obj.recorded_at
        : typeof obj.recordedAt === "string"
          ? obj.recordedAt
          : null,
    guildServerId:
      typeof obj.guild_server_id === "string"
        ? obj.guild_server_id
        : typeof obj.guildServerId === "string"
          ? obj.guildServerId
          : null,
    raw: obj,
  };
}

function playerFromRecord(row: unknown): CultAgentPlayerPresence | null {
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
    ping: typeof obj.ping === "number" ? obj.ping : null,
    gamemode:
      typeof obj.gamemode === "string"
        ? obj.gamemode
        : typeof obj.game_mode === "string"
          ? obj.game_mode
          : null,
    dimension: typeof obj.dimension === "string" ? obj.dimension : null,
    workloadId:
      typeof obj.workload_id === "string"
        ? obj.workload_id
        : typeof obj.workloadId === "string"
          ? obj.workloadId
          : null,
    guildServerId:
      typeof obj.guild_server_id === "string"
        ? obj.guild_server_id
        : typeof obj.guildServerId === "string"
          ? obj.guildServerId
          : typeof obj.server_id === "string"
            ? obj.server_id
            : typeof obj.serverId === "string"
              ? obj.serverId
              : null,
    cultforgeUserId:
      typeof obj.cultforge_user_id === "string"
        ? obj.cultforge_user_id
        : typeof obj.cultforgeUserId === "string"
          ? obj.cultforgeUserId
          : null,
    raw: obj,
  };
}

function eventFromRecord(row: unknown): CultAgentGameEvent | null {
  const obj = asRecord(row);
  if (!obj) return null;
  const id = String(obj.id ?? "").trim();
  const eventType = String(
    obj.event_type ?? obj.eventType ?? obj.type ?? "",
  ).trim();
  if (!id && !eventType) return null;
  return {
    id: id || `${eventType}-${obj.occurred_at ?? Date.now()}`,
    eventType: eventType || "event",
    minecraftName:
      typeof obj.minecraft_name === "string"
        ? obj.minecraft_name
        : typeof obj.player_name === "string"
          ? obj.player_name
          : null,
    minecraftUuid:
      typeof obj.minecraft_uuid === "string" ? obj.minecraft_uuid : null,
    payload: asRecord(obj.payload),
    occurredAt:
      typeof obj.occurred_at === "string"
        ? obj.occurred_at
        : typeof obj.occurredAt === "string"
          ? obj.occurredAt
          : typeof obj.created_at === "string"
            ? obj.created_at
            : null,
    workloadId:
      typeof obj.workload_id === "string"
        ? obj.workload_id
        : typeof obj.workloadId === "string"
          ? obj.workloadId
          : null,
    guildServerId:
      typeof obj.guild_server_id === "string"
        ? obj.guild_server_id
        : typeof obj.guildServerId === "string"
          ? obj.guildServerId
          : typeof obj.server_id === "string"
            ? obj.server_id
            : typeof asRecord(obj.payload)?.guild_server_id === "string"
              ? String(asRecord(obj.payload)!.guild_server_id)
              : null,
    raw: obj,
  };
}

function profileFromRecord(row: unknown): CultAgentCommandProfile {
  const obj = asRecord(row) ?? {};
  const nested = asRecord(obj.data) ?? obj;
  const config =
    asRecord(nested.config) ??
    asRecord(nested.profile) ??
    (nested.schema_version != null || nested.cli != null || nested.commands != null
      ? nested
      : {});
  return {
    schemaVersion:
      typeof config.schema_version === "number"
        ? config.schema_version
        : typeof nested.schema_version === "number"
          ? nested.schema_version
          : undefined,
    config,
    raw: nested,
  };
}

/** GET /v1/guilds/{guild_id}/agents/runtime */
export async function listGuildAgentRuntime(
  guildId: string,
  limit = 50,
): Promise<CultAgentRuntimeSnapshot[]> {
  try {
    const raw = await send<unknown>(
      "api",
      "list_agent_runtime_snapshots_for_a_guild",
      { guild_id: guildId, limit: String(limit) },
    );
    return unwrapList(raw)
      .map(runtimeFromRecord)
      .filter((x): x is CultAgentRuntimeSnapshot => Boolean(x));
  } catch (err) {
    throw wrap("Could not list agent runtime", err);
  }
}

/** GET /v1/guilds/{guild_id}/agents/players */
export async function listGuildAgentPlayers(
  guildId: string,
  limit = 200,
): Promise<CultAgentPlayerPresence[]> {
  try {
    const raw = await send<unknown>(
      "api",
      "list_live_agent_player_presence_for_a_guild",
      { guild_id: guildId, limit: String(limit) },
    );
    return unwrapList(raw)
      .map(playerFromRecord)
      .filter((x): x is CultAgentPlayerPresence => Boolean(x));
  } catch (err) {
    throw wrap("Could not list agent players", err);
  }
}

/** GET /v1/guilds/{guild_id}/agents/events */
export async function listGuildAgentEvents(
  guildId: string,
  limit = 50,
): Promise<CultAgentGameEvent[]> {
  try {
    const raw = await send<unknown>(
      "api",
      "list_recent_agent_gameplay_events_for_a_guild",
      { guild_id: guildId, limit: String(limit) },
    );
    return unwrapList(raw)
      .map(eventFromRecord)
      .filter((x): x is CultAgentGameEvent => Boolean(x));
  } catch (err) {
    throw wrap("Could not list agent events", err);
  }
}

/** GET /v1/guilds/{guild_id}/agent-commands */
export async function getGuildAgentCommandProfile(
  guildId: string,
): Promise<CultAgentCommandProfile> {
  try {
    const raw = await send<unknown>(
      "api",
      "get_guild_default_agent_command_profile",
      { guild_id: guildId },
    );
    return profileFromRecord(raw);
  } catch (err) {
    throw wrap("Could not load agent command profile", err);
  }
}

/** PUT /v1/guilds/{guild_id}/agent-commands */
export async function putGuildAgentCommandProfile(
  guildId: string,
  config: Record<string, unknown>,
): Promise<CultAgentCommandProfile> {
  try {
    const raw = await sendMutate(
      "api",
      "put_guild_default_agent_command_profile",
      { guild_id: guildId, config },
      "PUT",
    );
    return profileFromRecord(raw);
  } catch (err) {
    throw wrap("Could not save agent command profile", err);
  }
}

/** GET /v1/agents/{node_id}/commands/profile */
export async function getNodeAgentCommandProfile(
  nodeId: string,
): Promise<CultAgentCommandProfile> {
  try {
    const raw = await send<unknown>("api", "get_node_override_command_profile", {
      node_id: nodeId,
    });
    return profileFromRecord(raw);
  } catch (err) {
    throw wrap("Could not load node command profile", err);
  }
}

/** PUT /v1/agents/{node_id}/commands/profile */
export async function putNodeAgentCommandProfile(
  nodeId: string,
  config: Record<string, unknown>,
): Promise<CultAgentCommandProfile> {
  try {
    const raw = await sendMutate(
      "api",
      "put_node_override_command_profile",
      { node_id: nodeId, config },
      "PUT",
    );
    return profileFromRecord(raw);
  } catch (err) {
    throw wrap("Could not save node command profile", err);
  }
}

// ---------------------------------------------------------------------------
// Agent server bindings
// ---------------------------------------------------------------------------

export type CultAgentBinding = {
  id: string;
  nodeId: string;
  scope: "guild" | "personal";
  guildId?: string;
  guildServerId?: string;
  personalServerId?: string;
  workloadId?: string;
  localServerId?: string;
  /** Authoritative primary binding for tunnel / admin focus. */
  isPrimary: boolean;
  revokedAt?: string | null;
  createdAt: string;
  raw: Record<string, unknown>;
};

function bindingFromRecord(row: unknown): CultAgentBinding | null {
  const obj = asRecord(row);
  if (!obj) return null;
  const id = String(
    obj.id ??
      obj.binding_id ??
      obj.bindingId ??
      [
        obj.node_id ?? obj.nodeId,
        obj.guild_server_id ?? obj.guildServerId ?? obj.personal_server_id,
      ]
        .filter(Boolean)
        .join(":"),
  ).trim();
  if (!id) return null;
  const isPrimary =
    obj.is_primary === true ||
    obj.isPrimary === true ||
    String(obj.is_primary ?? obj.isPrimary ?? "").toLowerCase() === "true";
  return {
    id,
    nodeId: String(obj.node_id ?? obj.nodeId ?? ""),
    scope: obj.scope === "personal" ? "personal" : "guild",
    guildId: typeof obj.guild_id === "string" ? obj.guild_id : undefined,
    guildServerId:
      typeof obj.guild_server_id === "string"
        ? obj.guild_server_id
        : typeof obj.guildServerId === "string"
          ? obj.guildServerId
          : typeof obj.server_id === "string"
            ? obj.server_id
            : undefined,
    personalServerId:
      typeof obj.personal_server_id === "string"
        ? obj.personal_server_id
        : undefined,
    workloadId:
      typeof obj.workload_id === "string" ? obj.workload_id : undefined,
    localServerId:
      typeof obj.local_server_id === "string"
        ? obj.local_server_id
        : typeof obj.localServerId === "string"
          ? obj.localServerId
          : typeof obj.resource_id === "string"
            ? obj.resource_id
            : undefined,
    isPrimary,
    revokedAt:
      typeof obj.revoked_at === "string" ? obj.revoked_at : null,
    createdAt:
      typeof obj.created_at === "string"
        ? obj.created_at
        : new Date().toISOString(),
    raw: obj,
  };
}

/**
 * Resolve the admin / tunnel control target for a server.
 * Prefer preferred_agent_node_id, then binding is_primary, then first bound node.
 * Never prefer "newest by lastSeen".
 */
export function resolvePrimaryAgent(opts: {
  preferredNodeId?: string | null;
  bindings: CultAgentBinding[];
  nodes: CultAgentNode[];
  serverId?: string | null;
}): CultAgentNode | null {
  const { preferredNodeId, bindings, nodes, serverId } = opts;
  const active = bindings.filter((b) => !b.revokedAt);
  const forServer = serverId
    ? active.filter(
        (b) =>
          b.guildServerId === serverId ||
          b.personalServerId === serverId ||
          b.localServerId === serverId,
      )
    : active;
  const pool = forServer.length > 0 ? forServer : active;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const pref = (preferredNodeId ?? "").trim();
  if (pref && byId.has(pref)) {
    const bound = pool.some((b) => b.nodeId === pref);
    if (bound || pool.length === 0) return byId.get(pref) ?? null;
  }

  const primaryBind = pool.find((b) => b.isPrimary);
  if (primaryBind && byId.has(primaryBind.nodeId)) {
    return byId.get(primaryBind.nodeId) ?? null;
  }

  for (const b of pool) {
    const n = byId.get(b.nodeId);
    if (n) return n;
  }

  return nodes[0] ?? null;
}

/** PUT /v1/guilds/{guild_id}/servers/{server_id}/primary-agent */
export async function setGuildServerPrimaryAgent(
  guildId: string,
  serverId: string,
  nodeId: string,
): Promise<CultAgentBinding> {
  try {
    const raw = await sendMutate(
      "api",
      "set_primary_agent_for_a_guild_server",
      { guild_id: guildId, server_id: serverId, node_id: nodeId },
      "PUT",
    );
    const inner = asRecord(raw)?.data ?? raw;
    const binding = bindingFromRecord(inner);
    if (!binding)
      throw new CultAgentApiError("Primary-agent response malformed", 502);
    return binding;
  } catch (err) {
    throw wrap("Could not set guild server primary agent", err);
  }
}

/** PUT /v1/me/servers/{server_id}/primary-agent */
export async function setPersonalServerPrimaryAgent(
  serverId: string,
  nodeId: string,
): Promise<CultAgentBinding> {
  try {
    const raw = await sendMutate(
      "api",
      "set_primary_agent_for_a_personal_server",
      { server_id: serverId, node_id: nodeId },
      "PUT",
    );
    const inner = asRecord(raw)?.data ?? raw;
    const binding = bindingFromRecord(inner);
    if (!binding)
      throw new CultAgentApiError("Primary-agent response malformed", 502);
    return binding;
  } catch (err) {
    throw wrap("Could not set personal server primary agent", err);
  }
}

/** GET /v1/agents/{node_id}/bindings */
export async function listAgentBindings(
  nodeId: string,
): Promise<CultAgentBinding[]> {
  try {
    const raw = await send<unknown>("api", "list_agent_server_bindings", {
      node_id: nodeId,
    });
    return unwrapList(raw)
      .map(bindingFromRecord)
      .filter((x): x is CultAgentBinding => Boolean(x));
  } catch (err) {
    throw wrap("Could not list agent bindings", err);
  }
}

/** POST /v1/guilds/{guild_id}/servers/{server_id}/agents/{node_id}/bind */
export async function bindGuildServer(
  guildId: string,
  serverId: string,
  nodeId: string,
): Promise<CultAgentBinding> {
    try {
    const raw = await sendMutate(
      "api",
      "bind_guild_server_to_agent",
      { guild_id: guildId, server_id: serverId, node_id: nodeId },
      "POST",
    );
    const inner = asRecord(raw)?.data ?? raw;
    const binding = bindingFromRecord(inner);
    if (!binding)
      throw new CultAgentApiError("Bind response malformed", 502);
    return binding;
  } catch (err) {
    throw wrap("Could not bind guild server to agent", err);
  }
}

/** DELETE /v1/guilds/{guild_id}/servers/{server_id}/agents/{node_id}/bind */
export async function unbindGuildServer(
  guildId: string,
  serverId: string,
  nodeId: string,
): Promise<void> {
  try {
    await sendMutate(
      "api",
      "unbind_guild_server_from_agent",
      { guild_id: guildId, server_id: serverId, node_id: nodeId },
      "DELETE",
    );
  } catch (err) {
    throw wrap("Could not unbind guild server from agent", err);
  }
}

/** POST /v1/me/servers/{server_id}/agents/{node_id}/bind */
export async function bindPersonalServer(
  serverId: string,
  nodeId: string,
): Promise<CultAgentBinding> {
  try {
    const raw = await sendMutate(
      "api",
      "bind_personal_server_to_agent",
      { server_id: serverId, node_id: nodeId },
      "POST",
    );
    const inner = asRecord(raw)?.data ?? raw;
    const binding = bindingFromRecord(inner);
    if (!binding)
      throw new CultAgentApiError("Bind response malformed", 502);
    return binding;
  } catch (err) {
    throw wrap("Could not bind personal server to agent", err);
  }
}

/** DELETE /v1/me/servers/{server_id}/agents/{node_id}/bind */
export async function unbindPersonalServer(
  serverId: string,
  nodeId: string,
): Promise<void> {
  try {
    await sendMutate(
      "api",
      "unbind_personal_server_from_agent",
      { server_id: serverId, node_id: nodeId },
      "DELETE",
    );
  } catch (err) {
    throw wrap("Could not unbind personal server from agent", err);
  }
}

/** Friendly label for agent mode. */
export function agentModeLabel(node: CultAgentNode): string {
  return node.guildId ? "Guild" : "Personal";
}

