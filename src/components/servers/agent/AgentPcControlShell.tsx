import { useEffect, useMemo, useState } from "react";
import {
  Monitor,
  Plus,
  Settings,
  SlidersHorizontal,
  Terminal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  bindGuildServer,
  bindPersonalServer,
  isAgentNodeOnline,
  listAgentBindings,
  listCultAgentWorkloads,
  revokeCultAgentNode,
  unbindGuildServer,
  unbindPersonalServer,
  type CultAgentBinding,
  type CultAgentNode,
  type CultAgentWorkload,
} from "../../../lib/cultAgentApi";
import { runBoundCommand } from "../../../lib/agentCommands";
import {
  humanizeAgentError,
  localServerIdFromBinding,
  localServerIdFromWorkload,
  runningStateFromText,
} from "../../../lib/agentControl";
import { cn } from "../../../lib/cn";
import { useGuildStore } from "../../../stores/guilds";
import { usePersonalServersStore } from "../../../stores/personalServers";
import { humanizePcConnection } from "../../../lib/agentResultHumanize";
import type { TelemetryTransportMode } from "../../../lib/cultAgentTelemetry";
import { AgentAdvancedPanel } from "./AgentAdvancedPanel";
import { AgentPcOverview } from "./AgentPcOverview";
import { ServerControlPanel } from "./ServerControlPanel";

export type PcControlTab = "server" | "options" | "console" | "advanced";

const TABS: { id: PcControlTab; label: string; icon: typeof Monitor }[] = [
  { id: "server", label: "Server", icon: Monitor },
  { id: "options", label: "Options", icon: Settings },
  { id: "console", label: "Console", icon: Terminal },
  { id: "advanced", label: "Advanced", icon: SlidersHorizontal },
];

function dedupeBindings(bindings: CultAgentBinding[]): CultAgentBinding[] {
  const seen = new Set<string>();
  const out: CultAgentBinding[] = [];
  for (const b of bindings) {
    const key =
      b.guildServerId ?? b.personalServerId ?? b.workloadId ?? b.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(b);
  }
  return out;
}

function cloudServerIdFromWorkload(workload: CultAgentWorkload): string | null {
  const raw = workload.raw;
  for (const c of [
    raw.guild_server_id,
    raw.personal_server_id,
    raw.server_id,
    localServerIdFromWorkload(workload),
  ]) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

function dedupeOrphanWorkloads(
  workloads: CultAgentWorkload[],
  boundKeys: Set<string>,
): CultAgentWorkload[] {
  const seen = new Set<string>();
  const out: CultAgentWorkload[] = [];
  for (const w of workloads) {
    const state = String(w.reportedState ?? w.desiredState ?? "").toLowerCase();
    if (state.includes("removed") || state.includes("deleted")) continue;
    const cloudId = cloudServerIdFromWorkload(w);
    const localId = localServerIdFromWorkload(w);
    const keys = [cloudId, localId, w.id].filter(Boolean) as string[];
    if (keys.some((k) => boundKeys.has(k))) continue;
    const dedupeKey = cloudId ?? localId ?? w.id;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(w);
  }
  return out;
}

function friendlyWorkloadState(state: string): {
  label: string;
  running: boolean;
} {
  const s = state.toLowerCase();
  if (s.includes("run") || s === "running")
    return { label: "Online", running: true };
  if (s.includes("start")) return { label: "Starting…", running: true };
  if (s.includes("stop") && s.includes("ing"))
    return { label: "Stopping…", running: false };
  if (s.includes("crash")) return { label: "Crashed", running: false };
  if (s.includes("stop") || s === "stopped" || s === "unknown")
    return { label: "Stopped", running: false };
  return { label: "Stopped", running: false };
}

type ServerEntry = {
  key: string;
  name: string;
  localId: string;
  state: string;
  workloadId?: string;
  cloudId?: string;
  binding?: CultAgentBinding;
};

type Props = {
  node: CultAgentNode;
  focusLocalId?: string | null;
  onRefreshNodes?: () => void;
  showRevoke?: boolean;
  showAddServer?: boolean;
};

export function AgentPcControlShell({
  node,
  focusLocalId = null,
  onRefreshNodes,
  showRevoke = true,
  showAddServer = true,
}: Props) {
  const online = isAgentNodeOnline(node);
  const [bindings, setBindings] = useState<CultAgentBinding[]>([]);
  const [workloads, setWorkloads] = useState<CultAgentWorkload[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(focusLocalId);
  const [tab, setTab] = useState<PcControlTab>("server");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [transport, setTransport] = useState<TelemetryTransportMode>("unknown");
  const connection = humanizePcConnection(online, null, transport);

  const refresh = async () => {
    setLoading(true);
    try {
      const [b, w] = await Promise.all([
        listAgentBindings(node.id).catch(() => []),
        listCultAgentWorkloads(node.id).catch(() => []),
      ]);
      setBindings(dedupeBindings(b.filter((x) => !x.revokedAt)));
      setWorkloads(w);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [node.id]);

  useEffect(() => {
    if (focusLocalId) setSelectedId(focusLocalId);
  }, [focusLocalId]);

  const rows = useMemo(
    () =>
      dedupeBindings(bindings).map((b) => {
        const localId = localServerIdFromBinding(b);
        const wl = workloads.find((w) => w.id === b.workloadId);
        return { binding: b, localId, workload: wl };
      }),
    [bindings, workloads],
  );

  const extraWorkloads = useMemo(() => {
    const boundKeys = new Set<string>();
    for (const row of rows) {
      if (row.binding.guildServerId) boundKeys.add(row.binding.guildServerId);
      if (row.binding.personalServerId)
        boundKeys.add(row.binding.personalServerId);
      if (row.binding.workloadId) boundKeys.add(row.binding.workloadId);
      if (row.localId) boundKeys.add(row.localId);
    }
    return dedupeOrphanWorkloads(workloads, boundKeys);
  }, [rows, workloads]);

  const servers: ServerEntry[] = useMemo(() => {
    const out: ServerEntry[] = [];
    for (const { binding, localId, workload } of rows) {
      const id =
        localId ?? binding.guildServerId ?? binding.personalServerId ?? "";
      if (!id) continue;
      const name =
        workload?.displayName ||
        (typeof binding.raw.display_name === "string"
          ? binding.raw.display_name
          : null) ||
        binding.guildServerId ||
        binding.personalServerId ||
        "Server";
      out.push({
        key: binding.id,
        name:
          typeof name === "string" && !name.startsWith("srv_")
            ? name
            : "Server",
        localId: id,
        state: runningStateFromText(
          workload?.reportedState ?? workload?.desiredState,
        ),
        workloadId: binding.workloadId ?? workload?.id,
        cloudId: binding.guildServerId ?? binding.personalServerId ?? undefined,
        binding,
      });
    }
    for (const w of extraWorkloads) {
      const localId = localServerIdFromWorkload(w);
      if (!localId) continue;
      out.push({
        key: w.id,
        name: w.displayName || "Server",
        localId,
        state: runningStateFromText(w.reportedState ?? w.desiredState),
        workloadId: w.id,
        cloudId: cloudServerIdFromWorkload(w) ?? undefined,
      });
    }
    return out;
  }, [extraWorkloads, rows]);

  useEffect(() => {
    if (selectedId || loading || focusLocalId) return;
    if (servers.length === 1) setSelectedId(servers[0].localId);
  }, [focusLocalId, loading, selectedId, servers]);

  const selected = servers.find((s) => s.localId === selectedId) ?? null;

  const onRevokeNode = async () => {
    if (
      !window.confirm(
        "Disconnect this computer? You will need a new connect code to use it again.",
      )
    ) {
      return;
    }
    setBusy("revoke");
    try {
      await revokeCultAgentNode(node.id);
      toast.success("Computer disconnected");
      onRefreshNodes?.();
    } catch (err) {
      toast.error(humanizeAgentError(err));
    } finally {
      setBusy(null);
    }
  };

  const onUnbind = async (entry: ServerEntry) => {
    const b = entry.binding;
    if (!b) return;
    if (
      !window.confirm(
        "Remove this world from this PC? It will stop if running.",
      )
    ) {
      return;
    }
    setBusy("unbind");
    try {
      await runBoundCommand({
        nodeId: node.id,
        action: "server.stop",
        localServerId: entry.localId,
        workloadId: entry.workloadId,
        extra: { confirm: true },
      }).catch(() => undefined);
      if (b.scope === "guild" && b.guildId && b.guildServerId) {
        await unbindGuildServer(b.guildId, b.guildServerId, node.id);
      } else if (b.personalServerId) {
        await unbindPersonalServer(b.personalServerId, node.id);
      }
      toast.success("World removed from this PC");
      if (selectedId === entry.localId) setSelectedId(null);
      await refresh();
    } catch (err) {
      toast.error(humanizeAgentError(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 gap-0">
      {/* Worlds + tabs rail */}
      <aside className="w-48 sm:w-52 shrink-0 flex flex-col min-h-0 border-r border-white/10 pr-3 mr-3">
        <div className="shrink-0 flex flex-col gap-1.5 pb-2.5 border-b border-white/8">
          <div className="flex items-center justify-between gap-1 px-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled">
              Worlds
            </p>
            {showAddServer ? (
              <button
                type="button"
                onClick={() => setAdding((v) => !v)}
                className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[10px] font-semibold text-primary-base hover:bg-primary-base/10 cursor-pointer"
                title="Add world"
              >
                <Plus size={12} />
                Add
              </button>
            ) : null}
          </div>

          {loading ? (
            <p className="text-[11px] text-text-muted px-1">Loading…</p>
          ) : servers.length === 0 ? (
            <p className="text-[11px] text-text-muted px-1 leading-relaxed">
              No worlds yet.
            </p>
          ) : (
            <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto scroll-hidden">
              {servers.map((entry) => {
                const { label, running } = friendlyWorkloadState(entry.state);
                const active = selectedId === entry.localId;
                return (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => {
                      setSelectedId(entry.localId);
                      setTab("server");
                    }}
                    className={cn(
                      "rounded-lg px-2 py-1.5 text-left cursor-pointer transition-colors",
                      active
                        ? "bg-primary-base/15 text-primary-base"
                        : "hover:bg-white/5 text-text-secondary",
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full shrink-0",
                          running ? "bg-primary-base" : "bg-text-disabled",
                        )}
                      />
                      <span className="text-[12px] font-semibold truncate">
                        {entry.name}
                      </span>
                    </div>
                    <p
                      className={cn(
                        "mt-0.5 pl-3.5 text-[10px]",
                        active ? "text-primary-base/70" : "text-text-muted",
                      )}
                    >
                      {label}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <nav className="flex flex-col gap-0.5 py-2.5 shrink-0">
          {TABS.map(({ id, label, icon: IconTab }) => {
            const disabled = !selected && id !== "advanced";
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                onClick={() => setTab(id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-2 py-2 text-[12px] font-semibold text-left cursor-pointer transition-colors disabled:opacity-35 disabled:cursor-not-allowed",
                  tab === id && (selected || id === "advanced")
                    ? "bg-primary-base/15 text-primary-base"
                    : "text-text-muted hover:bg-white/5 hover:text-text-secondary",
                )}
              >
                <IconTab size={14} className="shrink-0 opacity-80" />
                {label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto pt-2 border-t border-white/8 shrink-0 space-y-2">
          <AgentPcOverview
            node={node}
            serverCount={servers.length}
            compact
            onTransportChange={setTransport}
          />
          {showRevoke ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void onRevokeNode()}
              className="w-full rounded-md px-2 py-1 text-[10px] text-state-error/80 hover:bg-state-error/10 cursor-pointer disabled:opacity-40"
            >
              Disconnect PC
            </button>
          ) : null}
        </div>
      </aside>

      <main className="flex-1 min-w-0 min-h-0 flex flex-col">
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 pb-2 mb-1">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold",
                connection.pcReachable
                  ? "bg-primary-base/15 text-primary-base"
                  : "bg-white/8 text-text-muted",
              )}
              title={connection.linkDetail}
            >
              {connection.linkLabel}
            </span>
            {selected ? (
              <span className="text-[13px] font-semibold text-text-primary truncate">
                {selected.name}
              </span>
            ) : (
              <span className="text-[12px] text-text-muted">
                {node.guildId ? "Guild PC" : "Personal PC"}
              </span>
            )}
          </div>
          {selected?.binding ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void onUnbind(selected)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-text-muted hover:text-state-error cursor-pointer disabled:opacity-40"
            >
              <Trash2 size={11} />
              Remove
            </button>
          ) : null}
        </div>

        {showAddServer && adding ? (
          <div className="mb-3 shrink-0">
            <AddServerForm
              node={node}
              onDone={async () => {
                setAdding(false);
                await refresh();
                onRefreshNodes?.();
              }}
              onCancel={() => setAdding(false)}
            />
          </div>
        ) : null}

        <div className="flex-1 min-h-0 overflow-y-auto scroll-hidden">
          {!selected && tab !== "advanced" ? (
            <div className="h-full min-h-[16rem] rounded-xl border border-dashed border-white/10 bg-black/10 flex items-center justify-center p-6 text-center">
              <div>
                <Monitor
                  size={28}
                  className="mx-auto text-text-disabled mb-2"
                />
                <p className="text-[14px] font-semibold text-text-primary">
                  Select a world
                </p>
                <p className="mt-1 text-[12px] text-text-muted max-w-xs mx-auto leading-relaxed">
                  Pick a world in the rail, then Start to launch Minecraft on
                  this PC.
                </p>
                {showAddServer && !adding ? (
                  <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="mt-3 cf-btn-primary inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold cursor-pointer"
                  >
                    <Plus size={13} />
                    Add world
                  </button>
                ) : null}
              </div>
            </div>
          ) : tab === "advanced" ? (
            <AgentAdvancedPanel
              node={node}
              localServerId={selected?.localId}
              workloadId={selected?.workloadId}
            />
          ) : selected ? (
            <ServerControlPanel
              serverName={selected.name}
              node={node}
              localServerId={selected.localId}
              cloudServerId={selected.cloudId}
              workloadId={selected.workloadId}
              guildId={node.guildId ?? undefined}
              initialState={selected.state}
              connectionMode={connection.mode}
              view={
                tab === "server"
                  ? "server"
                  : tab === "options"
                    ? "options"
                    : "console"
              }
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}

function AddServerForm({
  node,
  onDone,
  onCancel,
}: {
  node: CultAgentNode;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const guildId = useGuildStore((s) => s.activeGuildId);
  const guildServers = useGuildStore((s) => s.servers);
  const hydrateGuildServers = useGuildStore((s) => s.hydrateGuildServers);
  const personal = usePersonalServersStore((s) => s.servers);
  const refreshPersonal = usePersonalServersStore((s) => s.refresh);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refreshPersonal();
    const gid = node.guildId || guildId;
    if (gid) void hydrateGuildServers(gid);
  }, [refreshPersonal, hydrateGuildServers, node.guildId, guildId]);

  const isGuild = Boolean(node.guildId);
  const options = isGuild
    ? guildServers
        .filter((s) => s.guildId === node.guildId)
        .map((s) => ({ id: s.id, name: s.name, guildId: s.guildId }))
    : personal.map((s) => ({ id: s.id, name: s.name }));

  const submit = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      if (isGuild) {
        const selected = options.find((o) => o.id === pick) as
          | { id: string; name: string; guildId?: string }
          | undefined;
        const gid = node.guildId ?? selected?.guildId;
        if (!gid) {
          throw new Error(
            "This agent is not attached to a guild. Attach it from Guild → Manage first.",
          );
        }
        await bindGuildServer(gid, pick, node.id);
      } else {
        await bindPersonalServer(pick, node.id);
      }
      toast.success("World added to this PC.");
      await onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add world");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-primary-base/25 bg-primary-base/8 p-4 flex flex-col gap-3">
      <p className="text-[12px] text-text-secondary">
        {isGuild
          ? "Choose a guild world to host on this computer."
          : "Choose one of your worlds to host on this computer."}
      </p>
      {options.length === 0 ? (
        <p className="text-[11px] text-state-warning">No worlds available yet.</p>
      ) : (
        <select
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          className="rounded-lg border border-border-strong bg-black/25 px-3 py-2.5 text-[12px] text-text-primary"
        >
          <option value="">Select a world…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!pick || busy}
          onClick={() => void submit()}
          className="cf-btn-primary rounded-lg px-4 py-2 text-[11px] font-semibold cursor-pointer disabled:opacity-40"
        >
          {busy ? "Adding…" : "Add to this PC"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-white/12 px-4 py-2 text-[11px] cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
