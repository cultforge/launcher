import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Bot,
  CalendarClock,
  ChevronLeft,
  FileCode2,
  Gauge,
  Layers,
  Network,
  Play,
  Server,
  Settings,
  Terminal,
  Users,
  Earth,
  Puzzle,
} from "lucide-react";
import type { GuildServer } from "../../data/guilds";
import {
  guildServerJoinAddress,
} from "../../data/guilds";
import { cn } from "../../lib/cn";
import { humanCommandPhase } from "../../lib/agentCommands";
import {
  getCultAgentNodeTelemetry,
  listAgentBindings,
  listCultAgentCommands,
  listCultAgentWorkloads,
  listGuildAgentEvents,
  listGuildAgentPlayers,
  listGuildCultAgentNodes,
  listMyCultAgentNodes,
  upsertCultAgentWorkload,
  type CultAgentBinding,
  type CultAgentCommand,
  type CultAgentGameEvent,
  type CultAgentNode,
  type CultAgentPlayerPresence,
  type CultAgentWorkload,
} from "../../lib/cultAgentApi";
import {
  capabilitiesForRole,
  membershipForUser,
} from "../../lib/guildPermissions";
import { useAppStore } from "../../userstore";
import {
  appendTelemetrySample,
  formatGb,
  summarizeTelemetry,
  type TelemetrySample,
} from "../../lib/cultAgentTelemetry";
import {
  applyMpingToServerStats,
  formatMpingLabel,
  liveOnlineFromMping,
  queryMpingStatus,
  syncMpingWatchList,
  type MpingStatus,
} from "../../lib/mping";
import { useGuildStore } from "../../stores/guilds";
import {
  useServerAdminStore,
  type ServerAdminSection,
} from "../../stores/serverAdmin";
import { EntityImage } from "../EntityImage";
import { AgentNodePicker } from "./agent/AgentNodePicker";
import { ServerControlPanel } from "./agent/ServerControlPanel";
import { TelemetryCharts } from "./agent/TelemetryCharts";
import { toast } from "sonner";
import {
  localServerIdForCloudServer,
  openLocalPanelIfRunning,
} from "../../lib/agentControl";

type NavSection = {
  section: string;
  advanced?: boolean;
  items: {
    id: ServerAdminSection;
    label: string;
    icon: typeof Server;
  }[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    section: "Control",
    items: [
      { id: "overview", label: "Overview", icon: Server },
      { id: "agent", label: "Control panel", icon: Bot },
    ],
  },
  {
    section: "Operations",
    advanced: true,
    items: [
      { id: "metrics", label: "Telemetry", icon: Gauge },
      { id: "command", label: "Activity", icon: Terminal },
      { id: "workloads", label: "Worlds on this PC", icon: Layers },
    ],
  },
  {
    section: "On that PC",
    advanced: true,
    items: [
      { id: "console", label: "Console", icon: Terminal },
      { id: "players", label: "Players", icon: Users },
      { id: "files", label: "Files", icon: FileCode2 },
      { id: "backups", label: "Backups", icon: Archive },
      { id: "schedules", label: "Events", icon: CalendarClock },
      { id: "plugins", label: "Mods", icon: Puzzle },
      { id: "worlds", label: "Worlds", icon: Earth },
    ],
  },
  {
    section: "Server",
    items: [
      { id: "settings", label: "Settings", icon: Settings },
      { id: "network", label: "Network", icon: Network },
    ],
  },
];

const NAV = NAV_SECTIONS.flatMap((s) => s.items);

function friendlyAction(action: string): string {
  const map: Record<string, string> = {
    "server.start": "Start",
    "server.stop": "Stop",
    "server.restart": "Restart",
    "server.status": "Status",
    "server.console.read": "Read log",
    "server.console.execute": "Console",
    "server.config.read": "Load settings",
    "server.config.update": "Save settings",
    "server.list": "List worlds",
    "node.status": "Ping PC",
    "node.metrics": "Metrics",
    "builds.provision": "Install build",
  };
  return map[action] ?? action.replace(/^[a-z]+\./, "").replace(/\./g, " ");
}

function connectHost(connect?: Record<string, unknown> | null): string {
  if (!connect) return "";
  const address = String(
    connect.address ??
      connect.host ??
      connect.effective_address ??
      connect.effectiveAddress ??
      "",
  ).trim();
  const port =
    connect.port ?? connect.effective_port ?? connect.effectivePort;
  if (!address) return "";
  if (address.includes(":")) return address;
  return port != null ? `${address}:${port}` : address;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="cf-panel rounded-xl border border-dashed border-white/12 bg-black/25 px-6 py-12 text-center">
      <h3 className="font-sora text-[15px] font-semibold text-text-primary">
        {title}
      </h3>
      <p className="mt-2 text-[13px] text-text-muted leading-relaxed max-w-lg mx-auto">
        {body}
      </p>
    </div>
  );
}

function useLiveMping(address: string) {
  const [status, setStatus] = useState<MpingStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      await syncMpingWatchList([address]);
      const next = await queryMpingStatus(address);
      if (!cancelled) setStatus(next);
    };
    void tick();
    const id = window.setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [address]);
  return status;
}

function useAgentFleet(guildId: string) {
  const [nodes, setNodes] = useState<CultAgentNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<Record<string, unknown> | null>(
    null,
  );
  const [workloads, setWorkloads] = useState<CultAgentWorkload[]>([]);
  const [commands, setCommands] = useState<CultAgentCommand[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const primary =
    nodes.find((n) => n.id === selectedId) ??
    nodes.find((n) => n.guildId === guildId) ??
    nodes[0] ??
    null;

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      let list: CultAgentNode[] = [];
      try {
        list = await listGuildCultAgentNodes(guildId);
      } catch {
        list = await listMyCultAgentNodes();
      }
      setNodes(list);
      const focus =
        list.find((n) => n.id === selectedId) ??
        list.find((n) => n.guildId === guildId) ??
        list[0] ??
        null;
      if (focus && focus.id !== selectedId) setSelectedId(focus.id);
      if (!focus) {
        setTelemetry(null);
        setWorkloads([]);
        setCommands([]);
        return;
      }
      const [tel, loads, cmds] = await Promise.all([
        getCultAgentNodeTelemetry(focus.id).catch(() => null),
        listCultAgentWorkloads(focus.id).catch(() => []),
        listCultAgentCommands(focus.id).catch(() => []),
      ]);
      setTelemetry(tel);
      setWorkloads(loads);
      setCommands(cmds);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(id);
  }, [guildId, selectedId]);

  return {
    nodes,
    primary,
    selectedId,
    setSelectedId,
    telemetry,
    workloads,
    commands,
    loading,
    error,
    refresh,
  };
}

function guildServerControlTarget(
  fleet: ReturnType<typeof useAgentFleet>,
  serverId: string,
  bindings: CultAgentBinding[] = [],
) {
  if (!fleet.primary) return null;
  const bound = bindings.find(
    (b) => !b.revokedAt && b.guildServerId === serverId,
  );
  const workload = fleet.workloads.find((w) => {
    const raw = w.raw;
    const ids = [
      w.localServerId,
      raw.local_server_id,
      raw.guild_server_id,
      raw.server_id,
      raw.resource_id,
    ];
    return ids.some((x) => String(x ?? "") === serverId);
  });
  return {
    nodeId: fleet.primary.id,
    localServerId: serverId,
    cloudServerId: serverId,
    workloadId: bound?.workloadId ?? workload?.id,
    initialState: workload?.reportedState ?? workload?.desiredState ?? null,
    agentName: fleet.primary.name,
    bound: Boolean(bound) || Boolean(workload),
  };
}

function GuildServerControlPanel({
  server,
  fleet,
  tall = false,
}: {
  server: GuildServer;
  fleet: ReturnType<typeof useAgentFleet>;
  tall?: boolean;
}) {
  const [bindings, setBindings] = useState<CultAgentBinding[]>([]);

  useEffect(() => {
    if (!fleet.primary) {
      setBindings([]);
      return;
    }
    let cancelled = false;
    void listAgentBindings(fleet.primary.id)
      .then((rows) => {
        if (!cancelled) setBindings(rows.filter((b) => !b.revokedAt));
      })
      .catch(() => {
        if (!cancelled) setBindings([]);
      });
    return () => {
      cancelled = true;
    };
  }, [fleet.primary?.id]);

  const target = guildServerControlTarget(fleet, server.id, bindings);

  if (!fleet.primary) {
    return (
      <EmptyState
        title="No computer linked"
        body="Connect an agent, then link this world to that PC."
      />
    );
  }

  if (!target) {
    return (
      <EmptyState
        title="No computer linked"
        body="Connect an agent, then open Control again."
      />
    );
  }

  if (!target.bound) {
    return (
      <EmptyState
        title="Not on this PC yet"
        body="Bind this world to the computer first. Start and console wait until it is hosted there."
      />
    );
  }

  return (
    <ServerControlPanel
      serverName={server.name}
      node={fleet.primary}
      localServerId={target.localServerId}
      cloudServerId={target.cloudServerId}
      workloadId={target.workloadId}
      guildId={server.guildId}
      buildId={server.requiredBuildId || undefined}
      joinAddress={guildServerJoinAddress(server) || undefined}
      initialState={target.initialState}
    />
  );
}

function TelemetryPanel({
  fleet,
}: {
  fleet: ReturnType<typeof useAgentFleet>;
}) {
  const view = summarizeTelemetry(fleet.telemetry);
  const node = fleet.primary;
  const [history, setHistory] = useState<TelemetrySample[]>([]);
  const lastKey = useRef<string>("");

  useEffect(() => {
    if (!fleet.telemetry) return;
    const key = JSON.stringify(fleet.telemetry);
    if (key === lastKey.current) return;
    lastKey.current = key;
    setHistory((prev) => appendTelemetrySample(prev, summarizeTelemetry(fleet.telemetry)));
  }, [fleet.telemetry]);

  useEffect(() => {
    setHistory([]);
    lastKey.current = "";
  }, [node?.id]);

  if (!node) {
    return (
      <EmptyState
        title="No computer selected"
        body="Link a PC to this world, then CPU and RAM from that machine show up here."
      />
    );
  }

  const hasAny =
    view.cpuPct != null ||
    view.ramPct != null ||
    view.ramUsedGb != null ||
    view.diskUsedGb != null ||
    view.tps != null ||
    (fleet.telemetry && Object.keys(fleet.telemetry).length > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-[15px] font-semibold text-text-primary">
            This computer
          </h3>
          <p className="text-[12px] text-text-muted">
            Live snapshot from {node.name}
            {fleet.loading ? " · updating…" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fleet.refresh()}
          className="rounded-lg border border-white/10 px-3 py-2 text-[12px] font-semibold cursor-pointer hover:bg-white/4"
        >
          Refresh
        </button>
      </div>

      {!hasAny ? (
        <EmptyState
          title="No snapshot yet"
          body="This computer has not sent CPU or RAM yet. If it is offline, open CultAgent there."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {[
              [
                "CPU",
                view.cpuPct != null ? `${Math.round(view.cpuPct)}%` : "—",
              ],
              [
                "RAM",
                view.ramUsedGb != null
                  ? `${formatGb(view.ramUsedGb)} / ${formatGb(view.ramTotalGb)}`
                  : view.ramPct != null
                    ? `${view.ramPct.toFixed(1)}%`
                    : "—",
              ],
              [
                "Disk",
                view.diskUsedGb != null
                  ? `${formatGb(view.diskUsedGb)} / ${formatGb(view.diskTotalGb)}`
                  : view.diskPct != null
                    ? `${view.diskPct.toFixed(1)}%`
                    : "—",
              ],
              ["TPS", view.tps != null ? view.tps.toFixed(1) : "—"],
              ["Uptime", view.uptime ?? "—"],
            ].map(([k, v]) => (
              <div
                key={k}
                className="cf-panel rounded-xl border border-white/8 bg-black/25 px-4 py-3.5"
              >
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  {k}
                </div>
                <div className="mt-1.5 text-[18px] font-sora font-bold tabular-nums text-text-primary">
                  {v}
                </div>
              </div>
            ))}
          </div>

          <TelemetryCharts view={view} history={history} />
        </>
      )}

      {fleet.telemetry ? (
        <details className="text-[11px] text-text-disabled">
          <summary className="cursor-pointer hover:text-text-muted">
            Raw snapshot
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto rounded-lg border border-white/8 bg-black/30 p-3 text-[10px] text-text-secondary">
            {JSON.stringify(fleet.telemetry, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

function friendlyStateLabel(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("run") || s.includes("online")) return "Online";
  if (s.includes("start")) return "Starting";
  if (s.includes("stop") && !s.includes("stopped")) return "Stopping";
  if (s.includes("crash")) return "Crashed";
  if (s.includes("queue")) return "Queued";
  return "Stopped";
}

function CommandsPanel({
  fleet,
}: {
  fleet: ReturnType<typeof useAgentFleet>;
}) {
  const node = fleet.primary;
  if (!node) {
    return (
      <EmptyState
        title="No computer selected"
        body="Link a PC first. Recent start/stop and console actions will show up here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div>
        <h3 className="font-sora text-[16px] font-bold text-text-primary">
          Recent activity
        </h3>
        <p className="mt-1 text-[12px] text-text-muted">
          What this launcher asked {node.name} to do. Start, stop, and console
          live on Control panel.
        </p>
      </div>
      {fleet.commands.length === 0 ? (
        <EmptyState
          title="Nothing yet"
          body="Use Control panel to start or stop the world. Results appear here."
        />
      ) : (
        <ul className="rounded-xl border border-white/8 divide-y divide-white/6 overflow-hidden">
          {fleet.commands.slice(0, 24).map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]"
            >
              <span className="text-text-primary truncate">
                {friendlyAction(c.action)}
              </span>
              <span className="text-[12px] text-text-muted shrink-0">
                {humanCommandPhase(c)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WorkloadsPanel({
  fleet,
  server,
}: {
  fleet: ReturnType<typeof useAgentFleet>;
  server: GuildServer;
}) {
  const node = fleet.primary;
  const [busy, setBusy] = useState(false);

  if (!node) {
    return (
      <EmptyState
        title="No computer selected"
        body="Bind this world to a PC from Agents, then it will show up here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div className="cf-panel rounded-xl border border-white/8 bg-black/25 p-4">
        <h3 className="font-sora text-[15px] font-bold text-text-primary">
          Worlds on {node.name}
        </h3>
        <p className="mt-1 text-[12px] text-text-muted leading-relaxed">
          This listing can run on that computer. Start and stop from Control
          panel.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await upsertCultAgentWorkload(node.id, {
                display_name: server.name,
                desired_state: "running",
                build_id: server.requiredBuildId || undefined,
                server_id: server.id,
                address: server.address,
              });
              toast.success(`Asked ${node.name} to keep ${server.name} running`);
              void fleet.refresh();
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Could not update the PC",
              );
            } finally {
              setBusy(false);
            }
          }}
          className="cf-btn-primary mt-3 rounded-lg px-3.5 py-2 text-[12px] font-bold cursor-pointer disabled:opacity-50"
        >
          {busy ? "Sending…" : `Keep “${server.name}” running`}
        </button>
      </div>

      {fleet.workloads.length === 0 ? (
        <EmptyState
          title="No worlds on this PC yet"
          body="Bind the listing from Agents, or wait for CultAgent to report what is installed."
        />
      ) : (
        <ul className="rounded-xl border border-white/8 divide-y divide-white/6 overflow-hidden">
          {fleet.workloads.map((w) => (
            <li key={w.id} className="px-4 py-3">
              <div className="text-[13px] font-semibold text-text-primary">
                {w.displayName}
              </div>
              <div className="mt-0.5 text-[12px] text-text-muted">
                {friendlyStateLabel(w.reportedState || w.desiredState)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SettingsPanel({ server }: { server: GuildServer }) {
  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div className="cf-panel rounded-xl border border-white/8 bg-black/25 p-5">
        <h3 className="font-sora text-[16px] font-bold text-text-primary">
          Listing
        </h3>
        <p className="mt-1 text-[12px] text-text-muted leading-relaxed">
          How this world appears in the guild. Difficulty, game mode, and MOTD
          are on Control panel.
        </p>
        <dl className="mt-4">
          {[
            ["Name", server.name],
            ["About", server.description || "—"],
            ["Region", server.region || "—"],
            ["Status", server.status],
            ["Tags", server.tags.length ? server.tags.join(", ") : "—"],
          ].map(([k, v]) => (
            <div
              key={k}
              className="flex justify-between gap-4 text-[13px] border-b border-white/6 py-2.5 last:border-0"
            >
              <span className="text-text-muted shrink-0">{k}</span>
              <span className="text-text-primary text-right truncate">{v}</span>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function NetworkPanel({
  server,
  mping,
}: {
  server: GuildServer;
  mping: MpingStatus | null;
}) {
  const live = applyMpingToServerStats(mping);
  const joinAddr = guildServerJoinAddress(server);

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div className="cf-panel rounded-xl border border-white/8 bg-black/25 p-5">
        <h3 className="font-sora text-[16px] font-bold text-text-primary">
          Network
        </h3>
        <p className="mt-1 text-[12px] text-text-muted leading-relaxed">
          Players join this address. If CultAgent has a tunnel up, that address
          is used instead of the catalog default.
        </p>
        <dl className="mt-4">
          {[
            ["Join address", joinAddr || "—"],
            ["Region", server.region || "—"],
            ["Listing", server.status],
            ["Reachable", formatMpingLabel(mping)],
            [
              "Players",
              live ? `${live.playersOnline} / ${live.playersMax || "—"}` : "—",
            ],
            [
              "Latency",
              live && live.pingMs > 0 ? `${Math.round(live.pingMs)} ms` : "—",
            ],
          ].map(([k, v]) => (
            <div
              key={k}
              className="flex justify-between gap-4 text-[13px] border-b border-white/6 py-2.5 last:border-0"
            >
              <span className="text-text-muted shrink-0">{k}</span>
              <span className="text-text-primary text-right truncate font-mono text-[12px]">
                {v}
              </span>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function HostOnPcPanel({
  title,
  body,
  localId,
}: {
  title: string;
  body: string;
  localId?: string | null;
}) {
  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <EmptyState title={title} body={body} />
      {localId ? (
        <button
          type="button"
          onClick={() =>
            void openLocalPanelIfRunning(localId).then((ok) => {
              if (!ok) {
                toast.message("Open CultAgent on the computer that runs this world.");
              }
            })
          }
          className="self-start text-[11px] text-text-disabled hover:text-text-muted cursor-pointer"
        >
          Open panel on this PC
        </button>
      ) : null}
    </div>
  );
}

function PlayersPanel({ guildId }: { guildId: string }) {
  const [players, setPlayers] = useState<CultAgentPlayerPresence[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const rows = await listGuildAgentPlayers(guildId);
        if (!cancelled) setPlayers(rows);
      } catch {
        if (!cancelled) setPlayers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [guildId]);

  if (loading && players.length === 0) {
    return (
      <EmptyState title="Players" body="Checking who is on this world…" />
    );
  }
  if (players.length === 0) {
    return (
      <EmptyState
        title="Nobody online"
        body="Names appear here when someone is in the world."
      />
    );
  }

  return (
    <div className="cf-panel rounded-xl border border-white/8 bg-black/25 p-4 max-w-3xl">
      <h3 className="font-sora text-[15px] font-bold text-text-primary mb-3">
        Online · {players.length}
      </h3>
      <ul className="flex flex-col">
        {players.map((p) => (
          <li
            key={p.uuid || p.name}
            className="flex items-center justify-between gap-3 border-b border-white/6 py-2.5 last:border-0"
          >
            <span className="text-[13px] font-medium text-text-primary truncate">
              {p.name}
            </span>
            <span className="text-[11px] text-text-muted shrink-0">
              {[
                p.gamemode,
                p.dimension,
                p.ping != null ? `${Math.round(p.ping)} ms` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EventsPanel({ guildId }: { guildId: string }) {
  const [events, setEvents] = useState<CultAgentGameEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const rows = await listGuildAgentEvents(guildId);
        if (!cancelled) setEvents(rows);
      } catch {
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [guildId]);

  if (loading && events.length === 0) {
    return <EmptyState title="Events" body="Loading recent joins and deaths…" />;
  }
  if (events.length === 0) {
    return (
      <EmptyState
        title="No recent events"
        body="Joins, deaths, and advancements show up after someone plays."
      />
    );
  }

  return (
    <div className="cf-panel rounded-xl border border-white/8 bg-black/25 p-4 max-w-3xl">
      <h3 className="font-sora text-[15px] font-bold text-text-primary mb-3">
        Recent events
      </h3>
      <ul className="flex flex-col">
        {events.slice(0, 40).map((ev) => (
          <li
            key={ev.id}
            className="border-b border-white/6 py-2.5 last:border-0"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-text-primary">
                {friendlyAction(ev.eventType)}
              </span>
              <span className="text-[10px] text-text-muted">
                {ev.occurredAt ? new Date(ev.occurredAt).toLocaleString() : ""}
              </span>
            </div>
            {ev.minecraftName ? (
              <div className="text-[12px] text-text-muted mt-0.5">
                {ev.minecraftName}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function HostToolsPanel({
  kind,
  fleet,
  guildId,
  server,
}: {
  kind: "console" | "players" | "files" | "backups" | "schedules" | "plugins" | "worlds";
  fleet: ReturnType<typeof useAgentFleet>;
  guildId: string;
  server: GuildServer;
}) {
  const localId = localServerIdForCloudServer(fleet.workloads, server.id);

  if (kind === "console") {
    return (
      <EmptyState
        title="Console"
        body="The live log is on Control panel, next to Start and Stop."
      />
    );
  }
  if (kind === "players") {
    return <PlayersPanel guildId={guildId} />;
  }
  if (kind === "schedules") {
    return <EventsPanel guildId={guildId} />;
  }

  const copy: Record<string, { title: string; body: string }> = {
    files: {
      title: "Files",
      body: "World files stay on the computer that runs this server. Open CultAgent on that PC to browse them.",
    },
    backups: {
      title: "Backups",
      body: "Backups are taken on that computer. Open CultAgent there to make or restore a copy.",
    },
    plugins: {
      title: "Mods",
      body: "Mods and plugins are installed on that computer, not from this window.",
    },
    worlds: {
      title: "Worlds",
      body: "World folders live on that computer. Use CultAgent there to copy or switch them.",
    },
  };
  const meta = copy[kind] ?? copy.files;
  return (
    <HostOnPcPanel title={meta.title} body={meta.body} localId={localId} />
  );
}

function OverviewPanel({
  server,
  mping,
  fleet,
  canManage,
}: {
  server: GuildServer;
  mping: MpingStatus | null;
  fleet: ReturnType<typeof useAgentFleet>;
  canManage: boolean;
}) {
  const live = applyMpingToServerStats(mping);
  const online = liveOnlineFromMping(mping);
  const label = formatMpingLabel(mping);
  const builds = useGuildStore((s) => s.buildReleases);
  const linked = builds.find((b) => b.id === server.requiredBuildId);

  return (
    <div className="flex flex-col gap-4 max-w-5xl">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ["Reachability", label],
          [
            "Players",
            live
              ? `${live.playersOnline} / ${live.playersMax || "—"}`
              : "—",
          ],
          ["Latency", live && live.pingMs > 0 ? `${live.pingMs} ms` : "—"],
          [
            "Agent",
            fleet.primary
              ? `${fleet.primary.name} · ${fleet.primary.status}`
              : "Not linked",
          ],
        ].map(([k, v]) => (
          <div
            key={k}
            className="cf-panel rounded-xl border border-white/8 bg-black/25 px-4 py-3.5"
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
              {k}
            </div>
            <div className="mt-1.5 text-[14px] font-semibold text-text-primary truncate">
              {v}
            </div>
          </div>
        ))}
      </div>

      {!fleet.primary ? (
        <EmptyState
          title="No agent hosting this server"
          body="Join still works from the catalog address. Admins bind a PC from Agents → Add server."
        />
      ) : (
        <div className="cf-panel rounded-xl border border-white/8 bg-black/25 p-4">
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            Hosting
          </h4>
          <p className="mt-1 text-[13px] text-text-primary">
            {fleet.primary.name} · {fleet.primary.status}
          </p>
          {canManage ? (
            <p className="mt-2 text-[12px] text-text-muted">
              Start, stop, and the live log are on Control panel — they are not
              refreshed from this overview.
            </p>
          ) : null}
        </div>
      )}

      <div className="cf-panel rounded-xl border border-white/8 bg-black/25 p-4">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted mb-3">
          Catalog
        </h4>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-[13px]">
          {[
            ["Join address", guildServerJoinAddress(server) || server.address],
            ["Region", server.region || "—"],
            ["Version", server.version || "—"],
            ["Listing", server.status],
            ["Build", linked?.name || "—"],
            [
              "Reachable",
              online === true
                ? "Yes"
                : online === false
                  ? "No"
                  : "Checking…",
            ],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-white/5 py-1">
              <dt className="text-text-muted">{k}</dt>
              <dd className="text-text-primary truncate">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

export function ServerAdminPanel() {
  const serverId = useServerAdminStore((s) => s.serverId);
  const section = useServerAdminStore((s) => s.section);
  const setSection = useServerAdminStore((s) => s.setSection);
  const close = useServerAdminStore((s) => s.close);
  const servers = useGuildStore((s) => s.servers);
  const guildId = useGuildStore((s) => s.activeGuildId);
  const members = useGuildStore((s) => s.members);
  const userId = useAppStore((s) => s.currentUser?.id ?? "");
  const canManage = capabilitiesForRole(
    membershipForUser(members, guildId, userId)?.role,
  ).openManagement;
  const joinServer = useGuildStore((s) => s.joinServer);
  const [joining, setJoining] = useState(false);

  const [showAdvanced, setShowAdvanced] = useState(false);

  const memberNav = useMemo(
    () =>
      NAV_SECTIONS
        .filter((group) => showAdvanced || !group.advanced)
        .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          canManage
            ? true
            : item.id === "overview" || item.id === "network" || item.id === "settings",
        ),
      })).filter((g) => g.items.length > 0),
    [canManage, showAdvanced],
  );

  const server = useMemo(
    () => servers.find((s) => s.id === serverId) ?? null,
    [servers, serverId],
  );
  const mping = useLiveMping(
    server ? guildServerJoinAddress(server) : "",
  );
  const fleet = useAgentFleet(guildId);
  const live = applyMpingToServerStats(mping);
  const online = liveOnlineFromMping(mping);

  useEffect(() => {
    if (serverId && !server) close();
  }, [serverId, server, close]);

  useEffect(() => {
    // Drop unknown / remapped section ids onto overview.
    if (section === "terminal" || section === "logs" || section === "database") {
      setSection("console");
      return;
    }
    if (!NAV.some((n) => n.id === section)) {
      setSection("overview");
      return;
    }
    if (
      !showAdvanced &&
      (section === "metrics" ||
        section === "command" ||
        section === "workloads" ||
        section === "console" ||
        section === "players" ||
        section === "files" ||
        section === "backups" ||
        section === "schedules" ||
        section === "plugins" ||
        section === "worlds")
    ) {
      setSection("overview");
      return;
    }
    if (
      !canManage &&
      section !== "overview" &&
      section !== "network" &&
      section !== "settings"
    ) {
      setSection("overview");
    }
  }, [section, setSection, canManage, showAdvanced]);

  if (!serverId || !server) return null;

  const iconSource =
    server.iconUrl || server.coverUrl || server.thumbnail || null;

  const onJoin = async () => {
    setJoining(true);
    try {
      const result = await joinServer(guildId, server.id);
      if (!result.ok) {
        toast.error(result.message || "Could not join");
        return;
      }
      const host =
        connectHost(result.connect) || guildServerJoinAddress(server);
      if (host) {
        try {
          await navigator.clipboard.writeText(host);
        } catch {
          /* ignore */
        }
        toast.success(result.message || "Join address ready", {
          description: host,
        });
      } else {
        toast.success(result.message || "Join payload ready");
      }
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="flex h-full w-full min-h-0 overflow-hidden">
      <aside
        aria-label="Server admin navigation"
        className="cf-side-nav cf-glass relative h-full w-58 shrink-0 flex flex-col border-r border-white/8"
      >
        <div className="cf-side-nav-header shrink-0 flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2.5">
          <button
            type="button"
            onClick={close}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] font-medium text-text-muted hover:text-text-primary hover:bg-white/3 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70"
          >
            <ChevronLeft size={15} />
            Servers
          </button>
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-disabled px-1">
            {canManage ? "Admin" : "Server"}
          </span>
        </div>

        <nav className="cf-side-nav-scroll flex-1 min-h-0 overflow-y-auto scroll-hidden flex flex-col gap-4 px-2.5 py-3">
          {memberNav.map((group) => (
            <div key={group.section} className="cf-side-nav-section flex flex-col gap-1">
              <div className="cf-side-nav-section-label px-2.5 mb-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-text-disabled/80">
                {group.section}
              </div>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = section === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSection(item.id)}
                      data-active={active}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "cf-side-nav-item relative group flex w-full items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70",
                        active
                          ? "text-text-primary bg-primary-base/11 border border-primary-base/30"
                          : "text-text-muted/85 border border-transparent hover:text-text-secondary hover:bg-white/3",
                      )}
                    >
                      {active ? (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.75 h-4.5 rounded-r-full bg-primary-base shadow-[0_0_8px_var(--color-primary-base)]" />
                      ) : null}
                      <Icon
                        size={17}
                        className={cn(
                          "shrink-0 transition-colors",
                          active
                            ? "text-primary-base"
                            : "text-text-muted group-hover:text-text-secondary",
                        )}
                      />
                      <span
                        className={cn(
                          "text-[12.5px] font-medium tracking-wide truncate",
                          active ? "text-text-primary" : "",
                        )}
                      >
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {canManage && (
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="mx-2.5 mt-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[10px] text-text-disabled hover:text-text-muted hover:bg-white/3 cursor-pointer transition-colors"
            >
              <Settings size={13} />
              {showAdvanced ? "Hide advanced" : "Show advanced"}
            </button>
          )}
        </nav>

        <div className="border-t border-white/8 p-3">
          <div className="flex items-center gap-2.5">
            <EntityImage
              kind="server"
              entityId={server.id}
              source={iconSource}
              alt=""
              className="h-9 w-9 rounded-lg shrink-0 border border-white/10"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full shrink-0",
                    online === true
                      ? "bg-primary-base"
                      : online === false
                        ? "bg-text-disabled"
                        : "bg-text-disabled animate-pulse",
                  )}
                />
                <div className="text-[12px] font-semibold text-text-primary truncate">
                  {server.name}
                </div>
              </div>
              <div className="text-[10px] text-text-muted truncate font-mono">
                {guildServerJoinAddress(server)}
              </div>
            </div>
          </div>
          <div className="mt-2 text-[9px] uppercase tracking-[0.14em] text-text-disabled">
            {canManage ? "Admin" : "Join & status"}
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 flex flex-col overflow-hidden">
        <div className="shrink-0 border-b border-white/8 px-5 py-4 flex flex-wrap items-start justify-between gap-4 bg-black/20">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-text-muted">
              Servers <span className="text-text-disabled">›</span> {server.name}
            </div>
            <div className="mt-2.5 flex items-start gap-4">
              <EntityImage
                kind="server"
                entityId={server.id}
                source={iconSource}
                alt=""
                className="h-14 w-14 rounded-xl shrink-0 border border-white/10"
              />
              <div className="min-w-0">
                <h2 className="font-sora text-[22px] font-bold text-text-primary truncate">
                  {server.name}
                </h2>
                <p className="mt-0.5 text-[13px] text-text-secondary line-clamp-2 max-w-2xl">
                  {server.description || "Guild Minecraft server"}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        online === true
                          ? "bg-primary-base"
                          : "bg-text-disabled",
                      )}
                    />
                    {formatMpingLabel(mping)}
                  </span>
                  <span>
                    Players{" "}
                    {live
                      ? `${live.playersOnline} / ${live.playersMax || "—"}`
                      : "—"}
                  </span>
                  {server.tags.slice(0, 3).map((t) => (
                    <span
                      key={t}
                      className="rounded-md border border-white/10 bg-white/3 px-2 py-0.5 text-[10px]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={joining}
              onClick={() => void onJoin()}
              className="cf-btn-primary flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-[12px] font-bold cursor-pointer disabled:opacity-50"
            >
              <Play size={14} />
              {joining ? "Joining…" : "Join server"}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scroll-hidden p-5 flex flex-col gap-4">
          {canManage &&
          section !== "agent" &&
          section !== "overview" &&
          section !== "console" ? (
            <AgentNodePicker
              nodes={fleet.nodes}
              selectedId={fleet.selectedId}
              onSelect={fleet.setSelectedId}
              loading={fleet.loading}
            />
          ) : null}

          {section === "overview" ? (
            <OverviewPanel
              server={server}
              mping={mping}
              fleet={fleet}
              canManage={canManage}
            />
          ) : null}
          {canManage && section === "agent" ? (
            <GuildServerControlPanel server={server} fleet={fleet} tall />
          ) : null}
          {canManage && section === "metrics" ? (
            <TelemetryPanel fleet={fleet} />
          ) : null}
          {canManage && section === "command" ? (
            <CommandsPanel fleet={fleet} />
          ) : null}
          {canManage && section === "workloads" ? (
            <WorkloadsPanel fleet={fleet} server={server} />
          ) : null}
          {section === "settings" ? <SettingsPanel server={server} /> : null}
          {section === "network" ? (
            <NetworkPanel server={server} mping={mping} />
          ) : null}
          {canManage &&
          (section === "console" ||
            section === "players" ||
            section === "files" ||
            section === "backups" ||
            section === "schedules" ||
            section === "plugins" ||
            section === "worlds") ? (
            <HostToolsPanel
              kind={section}
              fleet={fleet}
              guildId={guildId}
              server={server}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}
