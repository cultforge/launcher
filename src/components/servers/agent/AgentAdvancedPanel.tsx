import { useEffect, useState, type ReactNode } from "react";
import { Activity, Archive, Cpu, RefreshCw, Server, Wifi } from "lucide-react";
import { toast } from "sonner";
import {
  confirmCultAgentCommand,
  enqueueCultAgentCommand,
  isAgentNodeOnline,
  listCultAgentCommands,
  waitForCultAgentCommand,
  type CultAgentCommand,
  type CultAgentNode,
} from "../../../lib/cultAgentApi";
import {
  humanizeMetrics,
  humanizePcConnection,
  humanizeServerList,
  humanizeServerStatus,
} from "../../../lib/agentResultHumanize";
import { humanizeAgentError, openLocalPanelIfRunning } from "../../../lib/agentControl";
import { copyText, truncateMiddle } from "../../../lib/copyText";
import { cn } from "../../../lib/cn";

type Props = {
  node: CultAgentNode;
  localServerId?: string | null;
  workloadId?: string | null;
};

type QuickAction = {
  action: string;
  label: string;
  description: string;
  icon: typeof Wifi;
  needsServer?: boolean;
  risk?: boolean;
};

const PC_ACTIONS: QuickAction[] = [
  {
    action: "node.status",
    label: "Check connection",
    description: "Can this PC reach CultForge?",
    icon: Wifi,
  },
  {
    action: "node.metrics",
    label: "PC performance",
    description: "CPU and memory",
    icon: Cpu,
  },
  {
    action: "server.list",
    label: "List worlds",
    description: "Installed on this PC",
    icon: Server,
  },
];

const SERVER_ACTIONS: QuickAction[] = [
  {
    action: "server.status",
    label: "World status",
    description: "Is this world running?",
    icon: Activity,
    needsServer: true,
  },
  {
    action: "backup.create",
    label: "Create backup",
    description: "Snapshot this world",
    icon: Archive,
    needsServer: true,
    risk: true,
  },
];

function friendlyAction(action: string): string {
  const map: Record<string, string> = {
    "node.status": "Check PC",
    "node.metrics": "PC metrics",
    "server.list": "List worlds",
    "server.status": "Server status",
    "server.start": "Start",
    "server.stop": "Stop",
    "server.restart": "Restart",
    "server.console.read": "Read log",
    "server.console.execute": "Console",
    "backup.create": "Backup",
    "builds.provision": "Install build",
  };
  return map[action] ?? action.replace(/\./g, " · ");
}

function friendlyStatus(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("succeed") || s.includes("success") || s.includes("done"))
    return "Done";
  if (s.includes("fail") || s.includes("error")) return "Failed";
  if (s.includes("queue") || s.includes("pending")) return "Queued";
  if (s.includes("dispatch")) return "Sent";
  return status;
}

function humanizeResult(action: string, result: unknown): ReactNode {
  if (action === "node.status") {
    const view = humanizePcConnection(true, result);
    return (
      <div className="flex flex-col gap-1 text-[12px]">
        <p className="font-semibold text-text-primary">{view.linkLabel}</p>
        <p className="text-text-secondary">{view.linkDetail}</p>
      </div>
    );
  }
  if (action === "node.metrics") {
    const m = humanizeMetrics(result);
    return (
      <div className="flex gap-4 text-[12px]">
        <span>CPU: {m.cpu != null ? `${m.cpu}%` : "—"}</span>
        <span>Memory: {m.ram != null ? `${m.ram}%` : "—"}</span>
        {m.disk != null ? <span>Disk: {m.disk}%</span> : null}
      </div>
    );
  }
  if (action === "server.status") {
    const view = humanizeServerStatus(result);
    return (
      <div className="flex flex-col gap-1 text-[12px]">
        <p className="font-semibold text-text-primary">{view.label}</p>
        <p className="text-text-secondary">{view.detail}</p>
        {view.players ? (
          <p className="text-text-muted">{view.players}</p>
        ) : null}
      </div>
    );
  }
  if (action === "server.list") {
    const names = humanizeServerList(result);
    if (!names.length) {
      return <p className="text-[12px] text-text-muted">No worlds found.</p>;
    }
    return (
      <ul className="text-[12px] text-text-secondary list-disc pl-4">
        {names.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    );
  }
  if (action === "backup.create") {
    return (
      <p className="text-[12px] text-text-secondary">
        Backup requested. It will appear when the agent finishes.
      </p>
    );
  }
  return (
    <p className="text-[12px] text-text-muted">Action completed successfully.</p>
  );
}

function ActionGrid({
  items,
  busy,
  localServerId,
  onRun,
}: {
  items: QuickAction[];
  busy: string | null;
  localServerId?: string | null;
  onRun: (action: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
      {items.map((item) => {
        const disabled = busy !== null || (item.needsServer && !localServerId);
        const Icon = item.icon;
        return (
          <button
            key={item.action}
            type="button"
            disabled={disabled}
            title={
              item.needsServer && !localServerId
                ? "Select a world first"
                : undefined
            }
            onClick={() => onRun(item.action)}
            className={cn(
              "rounded-lg border px-2.5 py-2 text-left cursor-pointer transition-colors disabled:opacity-40",
              item.risk
                ? "border-state-error/20 bg-state-error/5 hover:bg-state-error/10"
                : "border-white/8 bg-black/15 hover:bg-white/4",
            )}
          >
            <div className="flex items-start gap-2">
              <Icon
                size={14}
                className={
                  item.risk
                    ? "text-state-error mt-0.5 shrink-0"
                    : "text-primary-base mt-0.5 shrink-0"
                }
              />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-text-primary">
                  {busy === item.action ? "Working…" : item.label}
                </p>
                <p className="text-[10px] text-text-muted leading-snug">
                  {item.description}
                </p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function AgentAdvancedPanel({
  node,
  localServerId,
  workloadId,
}: Props) {
  const online = isAgentNodeOnline(node);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ReactNode>(null);
  const [history, setHistory] = useState<CultAgentCommand[]>([]);
  const [pendingConfirm, setPendingConfirm] =
    useState<CultAgentCommand | null>(null);

  const refreshHistory = async () => {
    try {
      const rows = await listCultAgentCommands(node.id);
      setHistory(rows.slice(0, 6));
    } catch {
      /* optional */
    }
  };

  useEffect(() => {
    void refreshHistory();
  }, [node.id]);

  const run = async (action: string) => {
    if (busy) return;
    setBusy(action);
    setPendingConfirm(null);
    setLastAction(action);
    setLastResult(<p className="text-[12px] text-text-muted">Working…</p>);
    try {
      let payload: Record<string, unknown> = {};
      if (localServerId) {
        payload = {
          local_server_id: localServerId,
          server_id: localServerId,
          resource_id: localServerId,
          ...(action.includes("stop") ||
          action.includes("restart") ||
          action === "backup.create"
            ? { confirm: true }
            : {}),
        };
      }
      if (workloadId) payload.workload_id = workloadId;

      const cmd = await enqueueCultAgentCommand(node.id, {
        action,
        payload,
        workload_id: workloadId ?? undefined,
      });

      if (cmd.confirmToken) {
        setPendingConfirm(cmd);
        setLastResult(
          <p className="text-[12px] text-state-warning">
            This action needs confirmation — press Confirm below.
          </p>,
        );
        return;
      }

      const done = await waitForCultAgentCommand(node.id, cmd.id, {
        timeoutMs: 45_000,
        preferRealtime: true,
      });

      setLastResult(humanizeResult(action, done.result));
      toast.success(`${friendlyAction(action)} · ${friendlyStatus(done.status)}`);
      await refreshHistory();
    } catch (err) {
      const msg = humanizeAgentError(err);
      setLastResult(
        <p className="text-[12px] text-state-error">{msg}</p>,
      );
      toast.error(msg);
    } finally {
      setBusy(null);
    }
  };

  const onConfirm = async () => {
    if (!pendingConfirm?.confirmToken) return;
    setBusy("confirm");
    try {
      await confirmCultAgentCommand(
        node.id,
        pendingConfirm.id,
        pendingConfirm.confirmToken,
      );
      const done = await waitForCultAgentCommand(node.id, pendingConfirm.id);
      setPendingConfirm(null);
      setLastResult(humanizeResult(done.action, done.result));
      toast.success("Confirmed");
      await refreshHistory();
    } catch (err) {
      toast.error(humanizeAgentError(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 max-w-xl">
      <div>
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Advanced
        </h4>
        <p className="mt-0.5 text-[11px] text-text-muted leading-relaxed">
          Diagnostics and backups. Day-to-day play uses Server / Options /
          Console.
        </p>
      </div>

      {!online ? (
        <p className="rounded-lg border border-state-warning/30 bg-state-warning/8 px-3 py-2 text-[11px] text-state-warning">
          PC offline — commands queue until CultAgent reconnects.
        </p>
      ) : null}

      <section className="flex flex-col gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled">
          This PC
        </p>
        <ActionGrid
          items={PC_ACTIONS}
          busy={busy}
          localServerId={localServerId}
          onRun={(a) => void run(a)}
        />
      </section>

      <section className="flex flex-col gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled">
          Selected world
        </p>
        <ActionGrid
          items={SERVER_ACTIONS}
          busy={busy}
          localServerId={localServerId}
          onRun={(a) => void run(a)}
        />
      </section>

      {lastAction && lastResult ? (
        <div className="rounded-lg border border-white/8 bg-black/20 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-text-disabled">
            {friendlyAction(lastAction)}
          </p>
          <div className="mt-1.5">{lastResult}</div>
          {pendingConfirm ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void onConfirm()}
              className="mt-2 cf-btn-primary rounded-lg px-3 py-1.5 text-[11px] font-semibold cursor-pointer"
            >
              Confirm {friendlyAction(pendingConfirm.action)}
            </button>
          ) : null}
        </div>
      ) : null}

      <details className="rounded-lg border border-white/8 bg-black/15 px-3 py-2">
        <summary className="cursor-pointer text-[11px] font-semibold text-text-secondary select-none">
          Recent activity
          {history.length ? ` (${history.length})` : ""}
        </summary>
        <div className="mt-2 flex items-center justify-end">
          <button
            type="button"
            onClick={() => void refreshHistory()}
            className="inline-flex items-center gap-1 text-[10px] text-text-muted hover:text-text-primary cursor-pointer"
          >
            <RefreshCw size={11} />
            Refresh
          </button>
        </div>
        {history.length === 0 ? (
          <p className="mt-1 text-[11px] text-text-muted">No recent commands.</p>
        ) : (
          <ul className="mt-1.5 flex flex-col gap-1">
            {history.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[11px] bg-black/20"
              >
                <span className="text-text-secondary truncate">
                  {friendlyAction(c.action)}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-[9px] font-semibold",
                    String(c.status).toLowerCase().includes("fail")
                      ? "text-state-error"
                      : "text-text-muted",
                  )}
                >
                  {friendlyStatus(c.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </details>

      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/6">
        <p className="font-mono text-[10px] text-text-disabled truncate flex-1 min-w-0">
          {truncateMiddle(node.id)}
        </p>
        <button
          type="button"
          onClick={() => void copyText(node.id, "PC id copied")}
          className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-text-muted cursor-pointer hover:text-text-secondary"
        >
          Copy ID
        </button>
        <button
          type="button"
          onClick={() =>
            void openLocalPanelIfRunning(localServerId ?? undefined)
          }
          className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-text-muted cursor-pointer hover:text-text-secondary"
        >
          Local panel
        </button>
      </div>
    </div>
  );
}
