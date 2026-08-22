/** Parse CultAgent telemetry snapshots (Crafty-style nested `system.*` shapes). */

export type TelemetryView = {
  cpuPct: number | null;
  ramUsedGb: number | null;
  ramTotalGb: number | null;
  ramPct: number | null;
  diskUsedGb: number | null;
  diskTotalGb: number | null;
  diskPct: number | null;
  tps: number | null;
  playersOnline: number | null;
  playersMax: number | null;
  uptime: string | null;
  uptimeSec: number | null;
};

export type TelemetrySample = TelemetryView & { at: number };

/** Agent Activity HUD line (Phase 1 — embedded in telemetry). */
export type TelemetryActivityKind = "ok" | "warn" | "err" | "info" | "work";

export type TelemetryActivityLine = {
  ts: string | null;
  kind: TelemetryActivityKind;
  text: string;
  source?: string | null;
};

export type TelemetryConsoleLine = {
  seq: number | null;
  ts: string | null;
  text: string;
};

export type TelemetryConsoleTail = {
  serverId: string;
  seq: number | null;
  lines: TelemetryConsoleLine[];
};

export type TelemetryPresencePlayer = {
  name: string;
  minecraftName?: string | null;
  uuid?: string | null;
};

export type TelemetryPresence = {
  serverId: string;
  playerCount: number | null;
  players: TelemetryPresencePlayer[];
};

/** Link mode inferred from telemetry / node.status (UI context). */
export type TelemetryTransportMode = "realtime" | "standard" | "unknown";

export type TelemetryHud = {
  activity: TelemetryActivityLine[];
  consoles: TelemetryConsoleTail[];
  presence: TelemetryPresence[];
  transport: TelemetryTransportMode;
};

function asRecord(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : null;
}

export function readNumber(
  obj: Record<string, unknown> | null,
  keys: string[],
): number | null {
  if (!obj) return null;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function readNested(
  root: Record<string, unknown> | null,
  path: string[],
): Record<string, unknown> | null {
  let cur: unknown = root;
  for (const key of path) {
    const next = asRecord(cur);
    if (!next) return null;
    cur = next[key];
  }
  return asRecord(cur);
}

function firstRecord(
  root: Record<string, unknown> | null,
  paths: string[][],
): Record<string, unknown> | null {
  for (const path of paths) {
    const hit = readNested(root, path);
    if (hit) return hit;
  }
  return null;
}

function bytesToGb(value: number | null): number | null {
  if (value == null) return null;
  if (value < 10_000) return value;
  return value / (1024 * 1024 * 1024);
}

function formatUptime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function resolveUsedGb(
  used: number | null,
  total: number | null,
  pct: number | null,
): number | null {
  if (used != null) return bytesToGb(used);
  if (total != null && pct != null) {
    return bytesToGb(total) != null
      ? ((bytesToGb(total) as number) * pct) / 100
      : null;
  }
  return null;
}

function normalizeActivityKind(raw: unknown): TelemetryActivityKind {
  const k = String(raw ?? "info").toLowerCase();
  if (k === "ok" || k === "success" || k === "done") return "ok";
  if (k === "warn" || k === "warning") return "warn";
  if (k === "err" || k === "error" || k === "fail" || k === "failed")
    return "err";
  if (k === "work" || k === "busy" || k === "progress") return "work";
  return "info";
}

function parseActivityLines(raw: unknown): TelemetryActivityLine[] {
  const root = asRecord(raw);
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(root?.lines)
      ? root!.lines
      : [];
  const out: TelemetryActivityLine[] = [];
  for (const row of list) {
    if (typeof row === "string" && row.trim()) {
      out.push({ ts: null, kind: "info", text: row.trim() });
      continue;
    }
    const rec = asRecord(row);
    if (!rec) continue;
    const text = String(rec.text ?? rec.message ?? rec.line ?? "").trim();
    if (!text) continue;
    out.push({
      ts:
        typeof rec.ts === "string"
          ? rec.ts
          : typeof rec.timestamp === "string"
            ? rec.timestamp
            : null,
      kind: normalizeActivityKind(rec.kind ?? rec.level ?? rec.type),
      text,
      source: typeof rec.source === "string" ? rec.source : null,
    });
  }
  return out.slice(-40);
}

function parseConsoleLines(raw: unknown): TelemetryConsoleLine[] {
  if (!Array.isArray(raw)) return [];
  const out: TelemetryConsoleLine[] = [];
  for (const row of raw) {
    if (typeof row === "string" && row.trim()) {
      out.push({ seq: null, ts: null, text: row.trim() });
      continue;
    }
    const rec = asRecord(row);
    if (!rec) continue;
    const text = String(rec.text ?? rec.line ?? rec.message ?? "").trim();
    if (!text) continue;
    const seq = readNumber(rec, ["seq", "sequence", "id"]);
    out.push({
      seq,
      ts:
        typeof rec.ts === "string"
          ? rec.ts
          : typeof rec.timestamp === "string"
            ? rec.timestamp
            : null,
      text,
    });
  }
  return out.slice(-50);
}

function parseConsoleTails(raw: unknown): TelemetryConsoleTail[] {
  if (!Array.isArray(raw)) return [];
  const out: TelemetryConsoleTail[] = [];
  for (const row of raw) {
    const rec = asRecord(row);
    if (!rec) continue;
    const serverId = String(
      rec.server_id ??
        rec.serverId ??
        rec.local_server_id ??
        rec.localServerId ??
        rec.resource_id ??
        "",
    ).trim();
    if (!serverId) continue;
    const lines = parseConsoleLines(rec.lines ?? rec.log ?? rec.tail);
    const seq =
      readNumber(rec, ["seq", "next_seq", "nextSeq"]) ??
      (lines.length
        ? lines.reduce(
            (max, l) =>
              l.seq != null && (max == null || l.seq > max) ? l.seq : max,
            null as number | null,
          )
        : null);
    out.push({ serverId, seq, lines });
  }
  return out.slice(0, 8);
}

function parsePresencePlayers(raw: unknown): TelemetryPresencePlayer[] {
  if (!Array.isArray(raw)) return [];
  const out: TelemetryPresencePlayer[] = [];
  for (const row of raw) {
    if (typeof row === "string" && row.trim()) {
      out.push({ name: row.trim(), minecraftName: row.trim() });
      continue;
    }
    const rec = asRecord(row);
    if (!rec) continue;
    const name = String(
      rec.name ?? rec.minecraft_name ?? rec.minecraftName ?? rec.player_name ?? "",
    ).trim();
    if (!name) continue;
    out.push({
      name,
      minecraftName:
        typeof rec.minecraft_name === "string"
          ? rec.minecraft_name
          : typeof rec.minecraftName === "string"
            ? rec.minecraftName
            : name,
      uuid:
        typeof rec.uuid === "string"
          ? rec.uuid
          : typeof rec.minecraft_uuid === "string"
            ? rec.minecraft_uuid
            : null,
    });
  }
  return out;
}

function parsePresenceList(raw: unknown): TelemetryPresence[] {
  if (!Array.isArray(raw)) return [];
  const out: TelemetryPresence[] = [];
  for (const row of raw) {
    const rec = asRecord(row);
    if (!rec) continue;
    const serverId = String(
      rec.server_id ??
        rec.serverId ??
        rec.local_server_id ??
        rec.localServerId ??
        rec.resource_id ??
        "",
    ).trim();
    if (!serverId) continue;
    const players = parsePresencePlayers(rec.players ?? rec.roster ?? rec.online);
    const playerCount =
      readNumber(rec, ["player_count", "playerCount", "count", "online"]) ??
      (players.length ? players.length : null);
    out.push({ serverId, playerCount, players });
  }
  return out;
}

/** Infer realtime vs poll from telemetry transport / activity lines. */
export function inferTelemetryTransport(
  telemetry: Record<string, unknown> | null,
  activity: TelemetryActivityLine[] = [],
): TelemetryTransportMode {
  if (!telemetry && !activity.length) return "unknown";
  const root = telemetry ?? {};
  const metrics = asRecord(root.metrics) ?? root;
  const transport =
    asRecord(root.transport) ??
    asRecord(metrics.transport) ??
    asRecord(root.realtime) ??
    asRecord(metrics.realtime) ??
    asRecord(asRecord(root.cloud)?.transport) ??
    asRecord(asRecord(root.agent)?.transport);

  if (transport) {
    const mode = String(transport.mode ?? transport.kind ?? "").toLowerCase();
    if (
      transport.connected === true ||
      mode === "websocket" ||
      mode === "ws" ||
      mode === "realtime" ||
      transport.prefer_realtime === true ||
      transport.preferRealtime === true
    ) {
      return "realtime";
    }
    if (mode === "poll" || mode === "polling" || mode === "http") {
      return "standard";
    }
  }

  for (const line of activity) {
    const t = line.text.toLowerCase();
    if (t.includes("realtime") || t.includes("websocket") || t.includes("ws connected")) {
      return "realtime";
    }
    if (t.includes("poll") && (t.includes("standard") || t.includes("fallback"))) {
      return "standard";
    }
  }
  return "unknown";
}

/**
 * Extract Activity HUD + console tails + presence from a telemetry snapshot
 * (INTEGRATION §3.6 — may live at root or under `metrics`).
 */
export function parseTelemetryHud(
  telemetry: Record<string, unknown> | null,
): TelemetryHud {
  if (!telemetry) {
    return { activity: [], consoles: [], presence: [], transport: "unknown" };
  }
  const metrics = asRecord(telemetry.metrics) ?? telemetry;
  const activityRaw =
    telemetry.activity ?? metrics.activity ?? asRecord(telemetry.metrics)?.activity;
  const consolesRaw =
    telemetry.consoles ??
    metrics.consoles ??
    asRecord(telemetry.metrics)?.consoles;
  const presenceRaw =
    telemetry.presence ??
    metrics.presence ??
    asRecord(telemetry.metrics)?.presence;
  const activity = parseActivityLines(activityRaw);
  return {
    activity,
    consoles: parseConsoleTails(consolesRaw),
    presence: parsePresenceList(presenceRaw),
    transport: inferTelemetryTransport(telemetry, activity),
  };
}

function serverIdSet(serverIds: Array<string | null | undefined>): Set<string> {
  return new Set(serverIds.map((x) => String(x ?? "").trim()).filter(Boolean));
}

/** Match a console tail for this world (server_id / local_server_id). */
export function matchConsoleForServer(
  consoles: TelemetryConsoleTail[],
  serverIds: Array<string | null | undefined>,
): TelemetryConsoleTail | null {
  const ids = serverIdSet(serverIds);
  if (!ids.size) return null;
  return consoles.find((c) => ids.has(c.serverId)) ?? null;
}

/** Match presence roster for this world. */
export function matchPresenceForServer(
  presence: TelemetryPresence[],
  serverIds: Array<string | null | undefined>,
): TelemetryPresence | null {
  const ids = serverIdSet(serverIds);
  if (!ids.size) return null;
  return presence.find((p) => ids.has(p.serverId)) ?? null;
}

/**
 * Merge a telemetry console snapshot into local log lines by seq.
 * Returns null when there is nothing new to apply.
 */
export function mergeConsoleTail(
  prevLines: string[],
  prevSeq: number,
  tail: TelemetryConsoleTail,
): { lines: string[]; nextSeq: number } | null {
  const numbered = tail.lines.filter(
    (l): l is TelemetryConsoleLine & { seq: number } => l.seq != null,
  );
  if (numbered.length) {
    const fresh = numbered.filter((l) => l.seq > prevSeq);
    const nextSeq = Math.max(
      prevSeq,
      tail.seq ?? 0,
      ...numbered.map((l) => l.seq),
    );
    if (fresh.length) {
      return {
        lines: [...prevLines, ...fresh.map((l) => l.text)].slice(-400),
        nextSeq,
      };
    }
    if (prevLines.length) return null;
    // First paint — use full snapshot
    return { lines: numbered.map((l) => l.text).slice(-400), nextSeq };
  }

  const texts = tail.lines.map((l) => l.text).filter(Boolean);
  if (!texts.length) return null;
  if (tail.seq != null && tail.seq <= prevSeq && prevLines.length) return null;
  const nextSeq =
    tail.seq != null && tail.seq > prevSeq ? tail.seq : prevSeq;
  return { lines: texts.slice(-400), nextSeq };
}

export function summarizeTelemetry(
  telemetry: Record<string, unknown> | null,
): TelemetryView {
  const empty: TelemetryView = {
    cpuPct: null,
    ramUsedGb: null,
    ramTotalGb: null,
    ramPct: null,
    diskUsedGb: null,
    diskTotalGb: null,
    diskPct: null,
    tps: null,
    playersOnline: null,
    playersMax: null,
    uptime: null,
    uptimeSec: null,
  };
  if (!telemetry || Object.keys(telemetry).length === 0) return empty;

  // Prefer nested crafty/agent shape: system.{cpu,ram,disk}
  const system = readNested(telemetry, ["system"]) ?? telemetry;
  const cpu =
    firstRecord(telemetry, [
      ["system", "cpu"],
      ["cpu"],
      ["host", "cpu"],
      ["metrics", "cpu"],
    ]) ?? system;
  const mem =
    firstRecord(telemetry, [
      ["system", "ram"],
      ["system", "memory"],
      ["ram"],
      ["memory"],
      ["host", "memory"],
      ["metrics", "ram"],
    ]) ?? system;
  const disk =
    firstRecord(telemetry, [
      ["system", "disk"],
      ["system", "storage"],
      ["disk"],
      ["storage"],
      ["metrics", "disk"],
    ]) ?? system;
  const game =
    firstRecord(telemetry, [
      ["minecraft"],
      ["game"],
      ["server"],
      ["metrics", "minecraft"],
    ]) ?? telemetry;
  const players =
    firstRecord(telemetry, [
      ["players"],
      ["minecraft", "players"],
      ["server", "players"],
    ]) ?? game;

  const cpuPct = readNumber(cpu, [
    "percent",
    "usage",
    "cpu_percent",
    "cpuPercent",
    "cpu",
    "load",
  ]);
  const ramPct = readNumber(mem, [
    "percent",
    "usage",
    "ram_percent",
    "ramPercent",
  ]);
  const diskPct = readNumber(disk, [
    "percent",
    "usage",
    "disk_percent",
    "diskPercent",
  ]);
  const ramTotalRaw = readNumber(mem, [
    "total",
    "total_bytes",
    "totalBytes",
    "total_gb",
    "totalGb",
  ]);
  const ramUsedRaw = readNumber(mem, [
    "used",
    "used_bytes",
    "usedBytes",
    "used_gb",
    "usedGb",
  ]);
  const diskTotalRaw = readNumber(disk, [
    "total",
    "total_bytes",
    "totalBytes",
    "total_gb",
    "totalGb",
  ]);
  const diskUsedRaw = readNumber(disk, [
    "used",
    "used_bytes",
    "usedBytes",
    "used_gb",
    "usedGb",
  ]);

  const uptimeSec =
    readNumber(telemetry, ["uptime_sec", "uptimeSec", "uptime_seconds"]) ??
    readNumber(system, ["uptime_sec", "uptime", "uptime_seconds"]) ??
    readNumber(game, ["uptime_sec", "uptime"]);

  let uptime: string | null =
    typeof telemetry.uptime === "string"
      ? telemetry.uptime
      : typeof telemetry.uptime_human === "string"
        ? telemetry.uptime_human
        : typeof system.uptime_human === "string"
          ? (system.uptime_human as string)
          : null;
  if (!uptime && uptimeSec != null && uptimeSec < 10_000_000) {
    uptime = formatUptime(uptimeSec);
  }

  return {
    cpuPct,
    ramPct,
    diskPct,
    ramTotalGb: bytesToGb(ramTotalRaw),
    ramUsedGb: resolveUsedGb(ramUsedRaw, ramTotalRaw, ramPct),
    diskTotalGb: bytesToGb(diskTotalRaw),
    diskUsedGb: resolveUsedGb(diskUsedRaw, diskTotalRaw, diskPct),
    tps: readNumber(game, ["tps", "tick_rate", "tickRate", "mspt"]),
    playersOnline: readNumber(players, [
      "online",
      "count",
      "players_online",
      "playersOnline",
    ]),
    playersMax: readNumber(players, [
      "max",
      "limit",
      "players_max",
      "playersMax",
    ]),
    uptime,
    uptimeSec,
  };
}

export function formatGb(value: number | null): string {
  if (value == null) return "—";
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} GB`;
}

export function formatActivityTime(ts: string | null): string {
  if (!ts) return "";
  const ms = Date.parse(ts);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function appendTelemetrySample(
  history: TelemetrySample[],
  view: TelemetryView,
  max = 48,
): TelemetrySample[] {
  const next = [...history, { ...view, at: Date.now() }];
  return next.length > max ? next.slice(next.length - max) : next;
}
