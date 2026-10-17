import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Play, RotateCcw, Square } from "lucide-react";
import {
  getCultAgentNodeTelemetry,
  getWorkloadConsoleSnapshot,
  isAgentNodeOnline,
  isCommandFinished,
  listCultAgentWorkloads,
  listGuildAgentEvents,
  listGuildAgentPlayers,
  listGuildAgentRuntime,
  waitForCultAgentCommand,
  type CultAgentGameEvent,
  type CultAgentNode,
} from "../../../lib/cultAgentApi";
import {
  matchConsoleForServer,
  matchPresenceForServer,
  mergeConsoleTail,
  parseTelemetryHud,
  summarizeTelemetry,
  type TelemetryTransportMode,
} from "../../../lib/cultAgentTelemetry";
import {
  commandLooksLikeMissingInstall,
  enqueueBoundCommand,
  humanCommandPhase,
  parseConsoleFromCommand,
  parseStatusData,
  parseConfigProperties,
} from "../../../lib/agentCommands";
import { subscribeAgentCommandEvents } from "../../../lib/agentCommandEvents";
import {
  humanizeAgentError,
  lifecycleViaControl,
  openLocalPanelIfRunning,
  readConsoleViaControl,
  executeConsoleViaControl,
  resolveControlTransport,
  fetchServerStatusViaControl,
  type ControlTransport,
  type ServerControlContext,
} from "../../../lib/agentControl";
import { startingPhaseLabel } from "../../../lib/agentResultHumanize";
import { cn } from "../../../lib/cn";
import {
  canServerControlAction,
  membershipForUser,
} from "../../../lib/guildPermissions";
import { useGuildStore } from "../../../stores/guilds";
import { useAppStore } from "../../../userstore";
import { eventText } from "../../guilds/ActivityFeedPanel";

const DIFFICULTIES = ["peaceful", "easy", "normal", "hard"] as const;
const GAMEMODES = ["survival", "creative", "adventure", "spectator"] as const;

/** Telemetry poll for metrics + consoles[] (Phase 1). */
const TELEMETRY_POLL_MS = 10_000;
/** Fallback enqueue cadence only when telemetry consoles are missing. */
const CONSOLE_READ_FALLBACK_MS = 45_000;
const THROTTLE_BACKOFF_MS = 90_000;

function serverActivityWorthPolling(state: string): boolean {
  const s = state.toLowerCase();
  return (
    s.includes("run") ||
    s.includes("online") ||
    s.includes("start") ||
    s.includes("stop")
  );
}

function isThrottleError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /429|rate limit|too many connection|forging process throttl/i.test(msg);
}

export type ServerControlView = "all" | "server" | "options" | "console";

type Props = {
  serverName: string;
  node: CultAgentNode;
  localServerId: string;
  cloudServerId?: string;
  workloadId?: string;
  guildId?: string;
  buildId?: string;
  joinAddress?: string;
  initialState?: string | null;
  className?: string;
  view?: ServerControlView;
  /** From Host PC strip — drives Starting… latency copy. */
  connectionMode?: "realtime" | "standard" | "offline" | TelemetryTransportMode;
};

function friendlyState(raw: string): { label: string; tone: string } {
  const s = raw.toLowerCase();
  if (s.includes("run") || s.includes("online"))
    return { label: "Online", tone: "bg-primary-base/15 text-primary-base" };
  if (s.includes("start"))
    return { label: "Starting…", tone: "bg-state-warning/15 text-state-warning" };
  if (s.includes("stop") && s.includes("ing"))
    return { label: "Stopping…", tone: "bg-state-warning/15 text-state-warning" };
  if (s.includes("crash"))
    return { label: "Crashed", tone: "bg-state-error/15 text-state-error" };
  if (s.includes("queue"))
    return { label: "Queued", tone: "bg-white/8 text-text-muted" };
  if (s.includes("stop"))
    return { label: "Stopped", tone: "bg-white/8 text-text-muted" };
  return { label: "Stopped", tone: "bg-white/8 text-text-muted" };
}

function classifyMcLogLine(
  line: string,
): "error" | "warn" | "success" | "info" | "muted" {
  const s = line.replace(/\u001b\[[0-9;]*m/g, "");
  if (/\[?(ERROR|FATAL|SEVERE)\]?|Exception|Error:/i.test(s)) return "error";
  if (/\[?(WARN|WARNING)\]?/i.test(s)) return "warn";
  if (/Done \(|\[?(SUCCESS)\]?|joined the game/i.test(s)) return "success";
  if (/\[?(INFO|DEBUG)\]?/i.test(s)) return "info";
  if (s.startsWith(">")) return "muted";
  return "info";
}

function logLineClass(kind: ReturnType<typeof classifyMcLogLine>): string {
  switch (kind) {
    case "error":
      return "text-state-error";
    case "warn":
      return "text-state-warning";
    case "success":
      return "text-state-success";
    case "muted":
      return "text-text-disabled";
    default:
      return "text-text-secondary";
  }
}

function eventLabel(ev: CultAgentGameEvent): string {
  return eventText(ev);
}

function Meter({
  label,
  pct,
}: {
  label: string;
  pct: number | null;
}) {
  const v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className="flex-1 min-w-24">
      <div className="flex justify-between text-[10px] text-text-muted mb-1">
        <span>{label}</span>
        <span>{pct == null ? "—" : `${Math.round(v)}%`}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary-base"
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}

export function ServerControlPanel({
  serverName,
  node,
  localServerId,
  cloudServerId,
  workloadId,
  guildId,
  buildId,
  joinAddress,
  initialState,
  className,
  view = "all",
  connectionMode = "unknown",
}: Props) {
  const online = isAgentNodeOnline(node);
  const viewerPermissions = useGuildStore((s) =>
    guildId ? s.viewerPermissionsByGuild[guildId] : undefined,
  );
  const members = useGuildStore((s) => s.members);
  const userId = useAppStore((s) => s.currentUser?.id ?? "");
  const memberRole = guildId
    ? membershipForUser(members, guildId, userId)?.role
    : null;
  const canAction = (action: string) =>
    canServerControlAction(action, {
      guildScoped: Boolean(guildId),
      permissions: viewerPermissions,
      role: memberRole,
    });
  const [runState, setRunState] = useState(initialState ?? "stopped");
  const [players, setPlayers] = useState<number | null>(null);
  const [maxPlayers, setMaxPlayers] = useState<number | null>(null);
  const [playerNames, setPlayerNames] = useState<string[]>([]);
  const [recentEvents, setRecentEvents] = useState<CultAgentGameEvent[]>([]);
  const [phase, setPhase] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [afterSeq, setAfterSeq] = useState(0);
  const [draft, setDraft] = useState("");
  const [cpu, setCpu] = useState<number | null>(null);
  const [ram, setRam] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState("normal");
  const [gamemode, setGamemode] = useState("survival");
  const [motd, setMotd] = useState("");
  const [maxPlayersInput, setMaxPlayersInput] = useState("20");
  const [nether, setNether] = useState(true);
  const [pvp, setPvp] = useState(true);
  const [whitelist, setWhitelist] = useState(false);
  const [spawnMonsters, setSpawnMonsters] = useState(true);
  const [onlineMode, setOnlineMode] = useState(true);
  const [commandBlocks, setCommandBlocks] = useState(false);
  const [viewDistance, setViewDistance] = useState("10");
  const [simulationDistance, setSimulationDistance] = useState("10");
  const [levelName, setLevelName] = useState("world");
  const [levelSeed, setLevelSeed] = useState("");
  const [allProps, setAllProps] = useState<Record<string, string>>({});
  const [propsLoading, setPropsLoading] = useState(false);
  const [propsError, setPropsError] = useState<string | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [adminCmd, setAdminCmd] = useState(false);
  const [needsInstall, setNeedsInstall] = useState(false);
  const [linkMode, setLinkMode] = useState(connectionMode);
  const endRef = useRef<HTMLDivElement>(null);
  const lastReadAt = useRef(0);
  const openedKey = useRef("");
  const afterSeqRef = useRef(0);
  const inFlightRef = useRef<string | null>(null);
  const consoleReadInFlight = useRef(false);
  const telemetryHasConsole = useRef(false);
  const throttleUntilRef = useRef(0);
  const transportRef = useRef<ControlTransport | null>(null);
  /** Prevent stale workload polls from clobbering optimistic start/stop. */
  const stickyRunUntilRef = useRef(0);
  const stickyRunStateRef = useRef<string | null>(null);
  const boundId = (cloudServerId || localServerId).trim();

  const applyRunState = useCallback((next: string, stickyMs = 0) => {
    setRunState(next);
    if (stickyMs > 0) {
      stickyRunStateRef.current = next;
      stickyRunUntilRef.current = Date.now() + stickyMs;
    }
  }, []);

  const mergeRemoteRunState = useCallback((incoming: string | null | undefined) => {
    if (!incoming) return;
    const now = Date.now();
    if (now < stickyRunUntilRef.current && stickyRunStateRef.current) {
      const sticky = stickyRunStateRef.current.toLowerCase();
      const rem = incoming.toLowerCase();
      // Keep optimistic starting/running until remote agrees or sticky expires.
      if (
        (sticky.includes("start") || sticky.includes("run")) &&
        (rem.includes("stop") || rem === "unknown" || rem === "offline")
      ) {
        return;
      }
      if (
        sticky.includes("stop") &&
        (rem.includes("run") || rem.includes("online"))
      ) {
        return;
      }
    }
    setRunState(incoming);
  }, []);

  useEffect(() => {
    setLinkMode(connectionMode);
  }, [connectionMode]);

  const controlCtx = useMemo<ServerControlContext>(
    () => ({
      nodeId: node.id,
      localServerId: boundId,
      workloadId: workloadId ?? undefined,
    }),
    [boundId, node.id, workloadId],
  );

  const ids = useMemo(
    () => ({
      nodeId: node.id,
      localServerId: boundId,
      cloudServerId: boundId,
      workloadId: workloadId ?? null,
    }),
    [boundId, node.id, workloadId],
  );

  useEffect(() => {
    afterSeqRef.current = afterSeq;
  }, [afterSeq]);

  useEffect(() => {
    let cancelled = false;
    void resolveControlTransport().then((mode) => {
      if (!cancelled) transportRef.current = mode;
    });
    return () => {
      cancelled = true;
    };
  }, [node.id, boundId]);

  const refreshRuntime = useCallback(async () => {
    let usedTelemetryConsole = false;
    try {
      const raw = await getCultAgentNodeTelemetry(node.id);
      const view = summarizeTelemetry(raw);
      setCpu(view.cpuPct);
      setRam(view.ramPct);
      if (view.playersOnline != null) setPlayers(view.playersOnline);
      if (view.playersMax != null) setMaxPlayers(view.playersMax);

      // Phase 1: prefer telemetry consoles[] / presence over enqueue
      const hud = parseTelemetryHud(raw);
      if (hud.transport !== "unknown") setLinkMode(hud.transport);
      const tail = matchConsoleForServer(hud.consoles, [
        boundId,
        cloudServerId,
        localServerId,
      ]);
      if (tail && tail.lines.length) {
        usedTelemetryConsole = true;
        telemetryHasConsole.current = true;
        setLines((prev) => {
          const next = mergeConsoleTail(prev, afterSeqRef.current, tail);
          if (!next) return prev;
          afterSeqRef.current = next.nextSeq;
          setAfterSeq(next.nextSeq);
          return next.lines;
        });
      } else if (hud.consoles.length === 0) {
        telemetryHasConsole.current = false;
      }

      const presence = matchPresenceForServer(hud.presence, [
        boundId,
        cloudServerId,
        localServerId,
      ]);
      if (presence) {
        if (presence.playerCount != null) setPlayers(presence.playerCount);
        if (presence.players.length) {
          setPlayerNames(presence.players.map((p) => p.name));
        }
      }
    } catch {
      /* GET telemetry is optional */
    }
    try {
      const loads = await listCultAgentWorkloads(node.id);
      const match = loads.find((w) => {
        if (workloadId && w.id === workloadId) return true;
        const raw = w.raw;
        return [
          w.localServerId,
          raw.local_server_id,
          raw.guild_server_id,
          raw.server_id,
          raw.resource_id,
        ].some((x) => String(x ?? "") === boundId);
      });
      if (match?.reportedState) mergeRemoteRunState(match.reportedState);
    } catch {
      /* GET workloads is optional */
    }
    if (!guildId) return usedTelemetryConsole;
    try {
      const snaps = await listGuildAgentRuntime(guildId);
      const snap = snaps.find(
        (s) =>
          s.guildServerId === boundId ||
          (workloadId != null && s.workloadId === workloadId),
      );
      if (snap) {
        if (snap.state && snap.state !== "unknown") mergeRemoteRunState(snap.state);
        setPlayers(snap.playerCount);
      }
    } catch {
      /* GET runtime is optional */
    }
    try {
      const roster = await listGuildAgentPlayers(guildId);
      const names = roster
        .filter((p) => {
          if (!workloadId) return true;
          return !p.workloadId || p.workloadId === workloadId;
        })
        .map((p) => p.name)
        .filter(Boolean);
      if (names.length) {
        setPlayerNames(names);
        setPlayers(names.length);
      }
    } catch {
      /* GET players is optional */
    }
    try {
      const events = await listGuildAgentEvents(guildId, 12);
      const filtered = events.filter((ev) => {
        const t = ev.eventType.toLowerCase();
        return (
          t.includes("join") ||
          t.includes("leave") ||
          t.includes("quit") ||
          t.includes("death") ||
          t.includes("advancement")
        );
      });
      setRecentEvents(filtered.slice(0, 8));
    } catch {
      /* GET events is optional */
    }
    return usedTelemetryConsole;
  }, [boundId, cloudServerId, guildId, localServerId, mergeRemoteRunState, node.id, workloadId]);

  const refreshPlayersOnly = useCallback(async () => {
    await refreshRuntime();
  }, [refreshRuntime]);

  const pullConsole = useCallback(
    async (enqueueFallback = false, runStateHint = runState) => {
      if (!online || !boundId) return;
      const seq = afterSeqRef.current;
      const mode = transportRef.current ?? (await resolveControlTransport());

      if (mode === "local") {
        try {
          const parsed = await readConsoleViaControl(controlCtx, seq, 200, "local");
          if (parsed.lines.length) {
            setLines((prev) => [...prev, ...parsed.lines].slice(-400));
          }
          if (parsed.nextSeq != null) setAfterSeq(parsed.nextSeq);
        } catch {
          /* keep last log */
        }
        return;
      }

      // Prefer workload snapshot GET when available
      if (workloadId) {
        const snap = await getWorkloadConsoleSnapshot(
          node.id,
          workloadId,
          seq,
          200,
        );
        if (snap) {
          const texts = snap.lines.map((l) => l.text).filter(Boolean);
          if (texts.length) setLines((prev) => [...prev, ...texts].slice(-400));
          if (snap.nextSeq != null) setAfterSeq(snap.nextSeq);
          return;
        }
      }

      // Do not timer-enqueue while telemetry consoles[] are present
      if (telemetryHasConsole.current) return;
      if (!enqueueFallback || inFlightRef.current) return;
      if (!serverActivityWorthPolling(runStateHint)) return;
      if (Date.now() < throttleUntilRef.current) return;
      const now = Date.now();
      if (now - lastReadAt.current < CONSOLE_READ_FALLBACK_MS) return;
      if (consoleReadInFlight.current) return;
      lastReadAt.current = now;
      consoleReadInFlight.current = true;
      try {
        let cmd = await enqueueBoundCommand({
          ...ids,
          action: "server.console.read",
          extra: { after_seq: seq, limit: 200 },
        });
        if (!isCommandFinished(cmd)) {
          cmd = await waitForCultAgentCommand(node.id, cmd.id, {
            timeoutMs: 40_000,
          });
        }
        const parsed = parseConsoleFromCommand(cmd);
        if (parsed.lines.length) {
          setLines((prev) => [...prev, ...parsed.lines].slice(-400));
        }
        if (parsed.nextSeq != null) setAfterSeq(parsed.nextSeq);
      } catch (err) {
        if (isThrottleError(err)) {
          throttleUntilRef.current = Date.now() + THROTTLE_BACKOFF_MS;
        }
      } finally {
        consoleReadInFlight.current = false;
      }
    },
    [boundId, controlCtx, ids, node.id, online, runState, workloadId],
  );

  useEffect(() => {
    const key = `${node.id}:${boundId}:${workloadId ?? ""}:${online ? "on" : "off"}`;
    if (openedKey.current === key) return;
    openedKey.current = key;
    setLines([]);
    setAfterSeq(0);
    afterSeqRef.current = 0;
    lastReadAt.current = 0;
    telemetryHasConsole.current = false;
    setNeedsInstall(false);
    if (!online) {
      setPhase("PC is offline — open CultAgent on that computer.");
      return;
    }
    setPhase("");
    void (async () => {
      const fromTelemetry = await refreshRuntime();
      if (!fromTelemetry && serverActivityWorthPolling(initialState ?? runState)) {
        void pullConsole(true, initialState ?? runState);
      }
    })();
  }, [boundId, initialState, node.id, online, pullConsole, refreshRuntime, runState, workloadId]);

  useEffect(() => {
    if (!online) return;
    const id = window.setInterval(() => {
      void (async () => {
        const fromTelemetry = await refreshRuntime();
        if (
          !fromTelemetry &&
          !telemetryHasConsole.current &&
          serverActivityWorthPolling(runState)
        ) {
          void pullConsole(true, runState);
        }
      })();
    }, TELEMETRY_POLL_MS);
    return () => window.clearInterval(id);
  }, [online, pullConsole, refreshRuntime, runState]);

  useEffect(() => {
    return subscribeAgentCommandEvents((cmd) => {
      const frameNode = String(cmd.raw.node_id ?? cmd.raw.nodeId ?? "");
      if (frameNode && frameNode !== node.id) return;
      if (
        cmd.action === "server.start" ||
        cmd.action === "server.stop" ||
        cmd.action === "server.restart" ||
        cmd.action === "server.console.execute" ||
        cmd.action === "builds.provision"
      ) {
        setPhase(humanCommandPhase(cmd));
      }
      if (cmd.action === "server.console.read") {
        const parsed = parseConsoleFromCommand(cmd);
        if (parsed.lines.length) {
          setLines((prev) => [...prev, ...parsed.lines].slice(-400));
        }
        if (parsed.nextSeq != null) setAfterSeq(parsed.nextSeq);
      }
      if (cmd.action === "server.start") {
        const st = String(cmd.status ?? "").toLowerCase();
        if (st.includes("succeed") || st.includes("success") || st.includes("done")) {
          const data = parseStatusData(cmd);
          setRunState(
            data.state && data.state !== "unknown" ? data.state : "running",
          );
          stickyRunStateRef.current = "running";
          stickyRunUntilRef.current = Date.now() + 45_000;
        } else if (st.includes("dispatch") || st.includes("queue")) {
          setRunState("starting");
          stickyRunStateRef.current = "starting";
          stickyRunUntilRef.current = Date.now() + 45_000;
        }
      }
      if (cmd.action === "server.stop") {
        const st = String(cmd.status ?? "").toLowerCase();
        if (st.includes("succeed") || st.includes("success") || st.includes("done")) {
          setRunState("stopped");
          stickyRunStateRef.current = "stopped";
          stickyRunUntilRef.current = Date.now() + 30_000;
        } else if (st.includes("dispatch") || st.includes("queue")) {
          setRunState("stopping");
          stickyRunStateRef.current = "stopping";
          stickyRunUntilRef.current = Date.now() + 30_000;
        }
      }
    });
  }, [node.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines]);

  const run = async (action: string, extra?: Record<string, unknown>) => {
    if (!online) {
      const msg = "PC is offline — open CultAgent on that computer.";
      setPhase(msg);
      toast.error(msg);
      return null;
    }
    if (inFlightRef.current) return null;
    inFlightRef.current = action;
    setBusy(action);
    setPhase("Sending…");
    try {
      const mode = transportRef.current ?? (await resolveControlTransport());
      transportRef.current = mode;

      if (mode === "local") {
        if (
          action === "server.start" ||
          action === "server.stop" ||
          action === "server.restart"
        ) {
          if (action === "server.start") setRunState("starting");
          if (action === "server.stop") setRunState("stopping");
          await lifecycleViaControl(
            controlCtx,
            action as "server.start" | "server.stop" | "server.restart",
            "local",
          );
          const status = await fetchServerStatusViaControl(controlCtx, "local");
          if (status.state === "running") applyRunState("running", 45_000);
          else if (status.state === "stopped") applyRunState("stopped", 30_000);
          else if (action === "server.start") applyRunState("running", 45_000);
          else if (action === "server.stop") applyRunState("stopped", 30_000);
          setPhase("Done");
          void refreshRuntime();
          void pullConsole(
            false,
            action === "server.start"
              ? "running"
              : action === "server.stop"
                ? "stopped"
                : runState,
          );
          return null;
        }
        if (action === "server.console.execute") {
          const command = String(extra?.command ?? "").trim();
          if (command) {
            const result = await executeConsoleViaControl(
              controlCtx,
              command,
              "local",
            );
            if (result.lines.length) {
              setLines((prev) => [...prev, ...result.lines].slice(-400));
            }
          }
          setPhase("Done");
          return null;
        }
      }

      if (Date.now() < throttleUntilRef.current) {
        const msg = humanizeAgentError(new Error("429 rate limit"));
        setPhase(msg);
        toast.error(msg);
        if (action === "server.start") setRunState("stopped");
        return null;
      }

      let cmd = await enqueueBoundCommand({
        ...ids,
        action,
        extra,
        displayName: serverName,
      });
      setPhase(humanCommandPhase(cmd));
      const st = String(cmd.status ?? "").toLowerCase();
      const pickedUp =
        st.includes("dispatch") ||
        st.includes("queue") ||
        st.includes("succeed") ||
        st.includes("success");
      if (action === "server.start" && pickedUp) {
        setRunState("starting");
        setPhase(startingPhaseLabel(linkMode));
      }
      if (action === "server.stop" && pickedUp) setRunState("stopping");
      if (!isCommandFinished(cmd)) {
        cmd = await waitForCultAgentCommand(node.id, cmd.id, {
          timeoutMs: 90_000,
          preferRealtime: true,
        });
        setPhase(humanCommandPhase(cmd));
      }
      if (action === "server.start") {
        if (commandLooksLikeMissingInstall(cmd)) {
          setNeedsInstall(true);
          setRunState("stopped");
          setPhase("Files are not on this PC yet. Install the build, then Start once.");
        } else {
          const data = parseStatusData(cmd);
          setRunState(
            data.state && data.state !== "unknown" ? data.state : "running",
          );
        }
      }
      if (action === "server.stop") setRunState("stopped");
      if (action === "builds.provision") {
        const done = String(cmd.status ?? "").toLowerCase();
        if (done.includes("succeed") || done.includes("success") || done.includes("done")) {
          setNeedsInstall(false);
          setPhase("Build installed. Press Start when you are ready.");
        }
      }
      void refreshRuntime();
      void pullConsole(false, runState);
      return cmd;
    } catch (err) {
      if (isThrottleError(err)) {
        throttleUntilRef.current = Date.now() + THROTTLE_BACKOFF_MS;
      }
      const msg = humanizeAgentError(err);
      setPhase(msg);
      toast.error(msg);
      if (action === "server.start") setRunState("stopped");
      return null;
    } finally {
      inFlightRef.current = null;
      setBusy(null);
    }
  };

  const onStart = () => {
    if (inFlightRef.current) return;
    if (!canAction("server.start")) {
      toast.error("Missing permission: server.start");
      return;
    }
    setPhase(startingPhaseLabel(linkMode));
    applyRunState("starting", 60_000);
    void run("server.start", { accept_eula: true });
  };

  const onStop = () => {
    if (!canAction("server.stop")) {
      toast.error("Missing permission: server.stop");
      return;
    }
    if (!window.confirm("Stop the server?")) return;
    void run("server.stop");
  };

  const onRestart = () => {
    if (!canAction("server.restart")) {
      toast.error("Missing permission: server.restart");
      return;
    }
    if (!window.confirm("Restart the server?")) return;
    void run("server.restart");
  };

  const onInstall = () => {
    if (!canAction("builds.provision")) {
      toast.error("Missing permission: builds.provision");
      return;
    }
    if (!buildId) {
      toast.error("This listing has no build to install.");
      return;
    }
    void run("builds.provision", { build_id: buildId });
  };

  const onSaveSettings = () => {
    if (!canAction("server.config.update")) {
      toast.error("Missing permission: server.config.update");
      return;
    }
    if (!window.confirm("Save these server.properties on the PC?")) return;
    const values: Record<string, string> = {
      ...allProps,
      difficulty,
      gamemode,
      motd,
      "max-players": maxPlayersInput,
      "allow-nether": nether ? "true" : "false",
      pvp: pvp ? "true" : "false",
      "white-list": whitelist ? "true" : "false",
      "spawn-monsters": spawnMonsters ? "true" : "false",
      "online-mode": onlineMode ? "true" : "false",
      "enable-command-block": commandBlocks ? "true" : "false",
      "view-distance": viewDistance,
      "simulation-distance": simulationDistance,
      "level-name": levelName,
      ...(levelSeed.trim() ? { "level-seed": levelSeed.trim() } : {}),
    };
    void run("server.config.update", { values }).then((cmd) => {
      if (cmd) {
        setAllProps(values);
        toast.success("Properties saved — they apply on the next start");
      }
    });
  };

  const loadServerProperties = useCallback(async () => {
    if (!online || !boundId) return;
    setPropsLoading(true);
    setPropsError(null);
    try {
      const cmd = await enqueueBoundCommand({
        nodeId: node.id,
        action: "server.config.read",
        localServerId: boundId,
        workloadId: workloadId ?? undefined,
      });
      const finished = await waitForCultAgentCommand(node.id, cmd.id);
      const props = parseConfigProperties(finished);
      if (!Object.keys(props).length) {
        setPropsError("No server.properties returned from this PC yet.");
        setConfigLoaded(true);
        return;
      }
      setAllProps(props);
      if (props.difficulty) setDifficulty(props.difficulty);
      if (props.gamemode) setGamemode(props.gamemode);
      if (props.motd != null) setMotd(props.motd);
      if (props["max-players"]) setMaxPlayersInput(props["max-players"]);
      if (props["allow-nether"] != null)
        setNether(props["allow-nether"] === "true");
      if (props.pvp != null) setPvp(props.pvp === "true");
      if (props["white-list"] != null)
        setWhitelist(props["white-list"] === "true");
      if (props["spawn-monsters"] != null)
        setSpawnMonsters(props["spawn-monsters"] === "true");
      if (props["online-mode"] != null)
        setOnlineMode(props["online-mode"] === "true");
      if (props["enable-command-block"] != null)
        setCommandBlocks(props["enable-command-block"] === "true");
      if (props["view-distance"]) setViewDistance(props["view-distance"]);
      if (props["simulation-distance"])
        setSimulationDistance(props["simulation-distance"]);
      if (props["level-name"]) setLevelName(props["level-name"]);
      if (props["level-seed"] != null) setLevelSeed(props["level-seed"]);
      setConfigLoaded(true);
    } catch (err) {
      setPropsError(
        err instanceof Error ? err.message : "Could not read server.properties",
      );
    } finally {
      setPropsLoading(false);
    }
  }, [boundId, node.id, online, workloadId]);

  useEffect(() => {
    setConfigLoaded(false);
    setAllProps({});
    setPropsError(null);
  }, [boundId]);

  useEffect(() => {
    if (!(view === "all" || view === "options") || configLoaded || !online) {
      return;
    }
    void loadServerProperties();
  }, [configLoaded, loadServerProperties, online, view]);

  const onSend = async () => {
    if (!canAction("server.console.execute")) {
      toast.error("Missing permission: server.console.execute");
      return;
    }
    const command = draft.trim().replace(/^\//, "");
    if (!command) return;
    setDraft("");
    setLines((prev) => [...prev, `> ${command}`]);
    const cmd = await run("server.console.execute", { command });
    if (cmd) void pullConsole(false);
  };

  const badge = friendlyState(runState);
  const starting =
    (/\bstart|\bqueue/i.test(runState) && !/\bstop/i.test(runState)) ||
    busy === "server.start";
  const startLabel = starting ? startingPhaseLabel(linkMode) : "Start";
  // Treat starting/running as "live" so Start does not reappear while booting.
  const live =
    /\brun|\bonline|\bstart/i.test(runState) && !/\bstopp|\bstopped\b/i.test(runState);
  const locked = busy !== null || !online || starting;
  const showServer = view === "all" || view === "server";
  const showOptions = view === "all" || view === "options";
  const showConsole = view === "all" || view === "console";
  const playersSummary =
    players != null
      ? `${players}${maxPlayers != null ? ` / ${maxPlayers}` : ""}`
      : null;

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {!online && showServer ? (
        <p className="rounded-lg border border-state-warning/30 bg-state-warning/8 px-3 py-2 text-[12px] text-state-warning">
          This PC is offline. Open CultAgent on that computer, then try again.
        </p>
      ) : null}

      {showServer ? (
      <>
      {view === "server" ? (
        <div className="cf-panel rounded-2xl border border-white/10 bg-black/25 p-6 flex flex-col gap-5">
          <div className="text-center">
            <span
              className={`inline-block rounded-full px-3 py-1 text-[11px] font-bold ${badge.tone}`}
            >
              {badge.label}
            </span>
            <h3 className="mt-3 font-sora text-[22px] font-bold text-text-primary">
              {serverName}
            </h3>
            <p className="mt-1 text-[13px] text-text-muted">
              {playersSummary
                ? `${playersSummary} players online`
                : "No players yet"}
            </p>
            {joinAddress ? (
              <p className="mt-2 font-mono text-[12px] text-primary-base">
                {joinAddress}
              </p>
            ) : null}
            {phase ? (
              <p className="mt-2 text-[12px] text-text-secondary">{phase}</p>
            ) : null}
          </div>

          <div className="flex flex-col items-center gap-3 max-w-md mx-auto w-full">
            {!live ? (
              <button
                type="button"
                disabled={locked || !canAction("server.start")}
                title={
                  canAction("server.start")
                    ? undefined
                    : "Requires server.start permission"
                }
                onClick={onStart}
                className="cf-btn-primary w-full inline-flex items-center justify-center gap-2 rounded-2xl px-8 py-4 text-[18px] font-bold cursor-pointer disabled:opacity-40 shadow-lg shadow-primary-base/20"
              >
                <Play size={22} />
                {startLabel}
              </button>
            ) : (
              <div className="flex w-full gap-2">
                <button
                  type="button"
                  disabled={
                    busy !== null || !online || !canAction("server.stop")
                  }
                  title={
                    canAction("server.stop")
                      ? undefined
                      : "Requires server.stop permission"
                  }
                  onClick={onStop}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl border border-state-error/40 px-6 py-4 text-[16px] font-bold text-state-error cursor-pointer hover:bg-state-error/10 disabled:opacity-40"
                >
                  <Square size={18} />
                  Stop
                </button>
                <button
                  type="button"
                  disabled={
                    busy !== null || !online || !canAction("server.restart")
                  }
                  title={
                    canAction("server.restart")
                      ? undefined
                      : "Requires server.restart permission"
                  }
                  onClick={onRestart}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/12 px-5 py-4 text-[13px] font-semibold cursor-pointer disabled:opacity-40"
                >
                  <RotateCcw size={16} />
                  Restart
                </button>
              </div>
            )}
          </div>

          {needsInstall ? (
            <div className="rounded-xl border border-state-warning/30 bg-state-warning/8 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] text-state-warning">
                This world is not installed on the PC yet.
              </p>
              <button
                type="button"
                disabled={busy !== null || !online || !buildId}
                onClick={onInstall}
                className="cf-btn-primary rounded-lg px-3 py-1.5 text-[12px] font-semibold cursor-pointer disabled:opacity-40"
              >
                {busy === "builds.provision" ? "Installing…" : "Install build"}
              </button>
            </div>
          ) : null}

          <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-3 text-left">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Players
              </h4>
              <button
                type="button"
                onClick={() => void refreshPlayersOnly()}
                className="text-[10px] text-text-disabled hover:text-text-muted cursor-pointer"
              >
                Refresh
              </button>
            </div>
            <p className="mt-1 text-[13px] font-semibold text-text-primary tabular-nums">
              {playersSummary ?? "0"}
              {maxPlayers != null ? "" : players != null ? " online" : ""}
            </p>
            {playerNames.length ? (
              <p className="mt-1.5 text-[12px] text-text-secondary leading-snug">
                {playerNames.join(", ")}
              </p>
            ) : (
              <p className="mt-1.5 text-[12px] text-text-muted">
                {live ? "No one yet" : "Server is empty"}
              </p>
            )}
            {recentEvents.length ? (
              <ul className="mt-2 space-y-0.5 border-t border-white/8 pt-2">
                {recentEvents.slice(0, 4).map((ev) => (
                  <li
                    key={ev.id}
                    className="text-[10px] text-text-muted truncate"
                  >
                    {eventLabel(ev)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-4 pt-1">
            <Meter label="CPU" pct={cpu} />
            <Meter label="RAM" pct={ram} />
          </div>
        </div>
      ) : (
      <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-sora text-[18px] font-bold text-text-primary">
            {serverName}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.tone}`}>
              {badge.label}
            </span>
            <span>
              {playersSummary ? `${playersSummary} playing` : "—"}
            </span>
            {joinAddress ? (
              <span className="font-mono text-[10px]">{joinAddress}</span>
            ) : null}
          </div>
          {phase ? (
            <p className="mt-1 text-[12px] text-text-muted">{phase}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {!live ? (
            <button
              type="button"
              disabled={locked || !canAction("server.start")}
              title={
                canAction("server.start")
                  ? undefined
                  : "Requires server.start permission"
              }
              onClick={onStart}
              className="cf-btn-primary inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-[16px] font-bold cursor-pointer disabled:opacity-40"
            >
              <Play size={18} />
              {startLabel}
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={
                  busy !== null || !online || !canAction("server.stop")
                }
                title={
                  canAction("server.stop")
                    ? undefined
                    : "Requires server.stop permission"
                }
                onClick={onStop}
                className="inline-flex items-center gap-2 rounded-xl border border-state-error/40 px-8 py-3.5 text-[16px] font-bold text-state-error cursor-pointer hover:bg-state-error/10 disabled:opacity-40"
              >
                <Square size={16} />
                Stop
              </button>
              <button
                type="button"
                disabled={
                  busy !== null || !online || !canAction("server.restart")
                }
                title={
                  canAction("server.restart")
                    ? undefined
                    : "Requires server.restart permission"
                }
                onClick={onRestart}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 px-5 py-3.5 text-[13px] font-semibold cursor-pointer disabled:opacity-40"
              >
                <RotateCcw size={14} />
                Restart
              </button>
            </>
          )}
        </div>
      </div>

      {needsInstall ? (
        <div className="rounded-lg border border-state-warning/30 bg-state-warning/8 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] text-state-warning">
            This world is not installed on the PC yet. Install once, then press Start.
          </p>
          <button
            type="button"
            disabled={busy !== null || !online || !buildId}
            onClick={onInstall}
            className="cf-btn-primary rounded-lg px-3 py-1.5 text-[12px] font-semibold cursor-pointer disabled:opacity-40"
          >
            {busy === "builds.provision" ? "Installing…" : "Install build"}
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-4">
        <Meter label="CPU" pct={cpu} />
        <Meter label="RAM" pct={ram} />
      </div>

      <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Players
          </h4>
          <button
            type="button"
            onClick={() => void refreshPlayersOnly()}
            className="text-[10px] text-text-disabled hover:text-text-muted cursor-pointer"
          >
            Refresh
          </button>
        </div>
        <p className="mt-1 text-[12px] text-text-primary">
          {playerNames.length
            ? playerNames.join(", ")
            : playersSummary
              ? `${playersSummary} online`
              : live
                ? "No one yet"
                : "Server is empty"}
        </p>
        {recentEvents.length ? (
          <p className="mt-1 text-[10px] text-text-muted truncate">
            {eventLabel(recentEvents[0]!)}
          </p>
        ) : null}
      </div>
      </>
      )}
      </>
      ) : null}

      {showOptions ? (
      <div className="rounded-xl border border-white/8 bg-black/20 p-3 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Server properties
            </h4>
            <p className="mt-0.5 text-[10px] text-text-muted">
              Edits Minecraft <span className="font-mono">server.properties</span> on this PC.
            </p>
          </div>
          <button
            type="button"
            disabled={busy !== null || !online || propsLoading}
            onClick={() => void loadServerProperties()}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-semibold text-text-secondary cursor-pointer disabled:opacity-40"
          >
            {propsLoading ? "Loading…" : "Reload"}
          </button>
        </div>
        {propsError ? (
          <p className="text-[11px] text-state-error">{propsError}</p>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[10px] text-text-muted">
            Difficulty
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="rounded-lg border border-border-strong bg-black/30 px-2 py-2 text-[12px] text-text-primary"
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {d[0].toUpperCase() + d.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-text-muted">
            Game mode
            <select
              value={gamemode}
              onChange={(e) => setGamemode(e.target.value)}
              className="rounded-lg border border-border-strong bg-black/30 px-2 py-2 text-[12px] text-text-primary"
            >
              {GAMEMODES.map((d) => (
                <option key={d} value={d}>
                  {d[0].toUpperCase() + d.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-[10px] text-text-muted">
            MOTD
            <input
              value={motd}
              onChange={(e) => setMotd(e.target.value)}
              className="rounded-lg border border-border-strong bg-black/30 px-2 py-2 text-[12px] text-text-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-text-muted">
            Max players
            <input
              type="number"
              min={1}
              max={200}
              value={maxPlayersInput}
              onChange={(e) => setMaxPlayersInput(e.target.value)}
              className="rounded-lg border border-border-strong bg-black/30 px-2 py-2 text-[12px] text-text-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-text-muted">
            View distance
            <input
              type="number"
              min={2}
              max={32}
              value={viewDistance}
              onChange={(e) => setViewDistance(e.target.value)}
              className="rounded-lg border border-border-strong bg-black/30 px-2 py-2 text-[12px] text-text-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-text-muted">
            Simulation distance
            <input
              type="number"
              min={2}
              max={32}
              value={simulationDistance}
              onChange={(e) => setSimulationDistance(e.target.value)}
              className="rounded-lg border border-border-strong bg-black/30 px-2 py-2 text-[12px] text-text-primary"
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-[10px] text-text-muted">
            Level seed
            <input
              value={levelSeed}
              onChange={(e) => setLevelSeed(e.target.value)}
              placeholder="Leave blank to keep current"
              className="rounded-lg border border-border-strong bg-black/30 px-2 py-2 text-[12px] text-text-primary"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-3 text-[12px] text-text-secondary">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={nether} onChange={(e) => setNether(e.target.checked)} />
            Nether
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={pvp} onChange={(e) => setPvp(e.target.checked)} />
            PvP
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={whitelist}
              onChange={(e) => setWhitelist(e.target.checked)}
            />
            Whitelist
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={onlineMode}
              onChange={(e) => setOnlineMode(e.target.checked)}
            />
            Online mode
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={spawnMonsters}
              onChange={(e) => setSpawnMonsters(e.target.checked)}
            />
            Spawn monsters
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={commandBlocks}
              onChange={(e) => setCommandBlocks(e.target.checked)}
            />
            Command blocks
          </label>
        </div>
        {Object.keys(allProps).length > 0 ? (
          <details className="rounded-lg border border-white/8 bg-black/25 p-2">
            <summary className="cursor-pointer text-[11px] font-semibold text-text-secondary">
              All properties ({Object.keys(allProps).length})
            </summary>
            <div className="mt-2 max-h-48 overflow-y-auto flex flex-col gap-1.5">
              {Object.keys(allProps)
                .sort()
                .map((key) => (
                  <label
                    key={key}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2 items-center text-[10px]"
                  >
                    <span className="font-mono text-text-muted truncate" title={key}>
                      {key}
                    </span>
                    <input
                      value={allProps[key] ?? ""}
                      onChange={(e) =>
                        setAllProps((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      className="rounded border border-border-strong bg-black/30 px-2 py-1 text-[11px] text-text-primary font-mono"
                    />
                  </label>
                ))}
            </div>
          </details>
        ) : null}
        <button
          type="button"
          disabled={busy !== null || !online}
          onClick={onSaveSettings}
          className="self-start cf-btn-primary rounded-lg px-3 py-2 text-[11px] font-semibold cursor-pointer disabled:opacity-40"
        >
          Save properties
        </button>
      </div>
      ) : null}

      {showConsole ? (
      <div className="flex flex-col gap-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Console
        </h4>
        <pre className="min-h-40 max-h-[min(50vh,420px)] flex-1 overflow-y-auto rounded-lg border border-white/8 bg-black/45 p-3 text-[10px] leading-relaxed font-mono whitespace-pre-wrap scroll-hidden">
          {lines.length ? (
            lines.map((line, i) => (
              <div
                key={`${i}-${line.slice(0, 32)}`}
                className={logLineClass(classifyMcLogLine(line))}
              >
                {line}
              </div>
            ))
          ) : (
            <span className="text-text-disabled">
              No log yet. Start the server to see output.
            </span>
          )}
          <div ref={endRef} />
        </pre>
        {adminCmd ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void onSend();
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="list, say hello…"
              disabled={busy !== null}
              className="flex-1 rounded-lg border border-border-strong bg-black/30 px-3 py-2 text-[11px] font-mono text-text-primary outline-none disabled:opacity-40"
            />
            <button
              type="submit"
              disabled={busy !== null || !draft.trim()}
              className="rounded-lg border border-white/12 px-3 py-2 text-[11px] cursor-pointer disabled:opacity-40"
            >
              Send
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdminCmd(true)}
            className="self-start text-[10px] text-text-disabled hover:text-text-muted cursor-pointer"
          >
            Command bar
          </button>
        )}
      </div>
      ) : null}

      {view === "all" ? (
      <button
        type="button"
        onClick={() => void openLocalPanelIfRunning(localServerId)}
        className="self-start text-[10px] text-text-disabled hover:text-text-muted cursor-pointer"
      >
        Open panel on this PC (only if CultAgent is running here)
      </button>
      ) : null}
    </div>
  );
}
