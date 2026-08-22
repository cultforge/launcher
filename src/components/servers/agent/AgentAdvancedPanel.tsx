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
    description: "See if this PC can reach CultForge",
    icon: Wifi,
  },
  {
    action: "node.metrics",
    label: "PC performance",
    description: "CPU and memory on this computer",
    icon: Cpu,
  },
  {
    action: "server.list",
    label: "List worlds",
    description: "Worlds installed on this PC",
    icon: Server,
  },
];

const SERVER_ACTIONS: QuickAction[] = [
  {
    action: "server.status",
    label: "Server status",
    description: "Is the world running right now?",
    icon: Activity,
    needsServer: true,
  },
  {
    action: "backup.create",
    label: "Create backup",
    description: "Save a snapshot of this world",
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
      setHistory(rows.slice(0, 8));
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

  const actions = [...PC_ACTIONS, ...SERVER_ACTIONS];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Advanced tools
        </h4>
        <p className="mt-1 text-[12px] text-text-secondary leading-relaxed">
          Extra checks and maintenance. Normal play uses Start / Stop on the
          Server tab — you rarely need these.
        </p>
      </div>

      {!online ? (
        <p className="rounded-lg border border-state-warning/30 bg-state-warning/8 px-3 py-2 text-[12px] text-state-warning">
          PC is offline. Commands queue until CultAgent reconnects.
        </p>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {actions.map((item) => {
          const disabled =
            busy !== null || (item.needsServer && !localServerId);
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
              onClick={() => void run(item.action)}
              className={cn(
                "rounded-xl border px-3 py-3 text-left cursor-pointer transition-colors disabled:opacity-40",
                item.risk
                  ? "border-state-error/20 bg-state-error/5 hover:bg-state-error/10"
                  : "border-white/10 bg-black/20 hover:bg-white/4",
              )}
            >
              <div className="flex items-start gap-2.5">
                <Icon
                  size={16}
                  className={
                    item.risk ? "text-state-error mt-0.5" : "text-primary-base mt-0.5"
                  }
                />
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-text-primary">
                    {busy === item.action ? "Working…" : item.label}
                  </p>
                  <p className="text-[10px] text-text-muted mt-0.5">
                    {item.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {lastAction && lastResult ? (
        <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-text-disabled">
            {friendlyAction(lastAction)} result
          </p>
          <div className="mt-2">{lastResult}</div>
          {pendingConfirm ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void onConfirm()}
              className="mt-3 cf-btn-primary rounded-lg px-3 py-1.5 text-[11px] font-semibold cursor-pointer"
            >
              Confirm {friendlyAction(pendingConfirm.action)}
            </button>
          ) : null}
        </div>
      ) : null}

      {history.length > 0 ? (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[10px] uppercase tracking-wider text-text-disabled">
              Recent activity
            </p>
            <button
              type="button"
              onClick={() => void refreshHistory()}
              className="inline-flex items-center gap-1 text-[10px] text-text-muted hover:text-text-primary cursor-pointer"
            >
              <RefreshCw size={11} />
              Refresh
            </button>
          </div>
          <ul className="flex flex-col gap-1.5">
            {history.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/6 bg-black/15 px-3 py-2 text-[11px]"
              >
                <span className="text-text-secondary truncate">
                  {friendlyAction(c.action)}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold",
                    String(c.status).toLowerCase().includes("fail")
                      ? "bg-state-error/15 text-state-error"
                      : "bg-white/8 text-text-muted",
                  )}
                >
                  {friendlyStatus(c.status)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-xl border border-dashed border-white/10 px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-text-secondary">
            PC identifier
          </p>
          <p className="font-mono text-[10px] text-text-muted truncate">
            {truncateMiddle(node.id)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void copyText(node.id, "PC id copied")}
          className="rounded-lg border border-white/12 px-3 py-1.5 text-[10px] cursor-pointer"
        >
          Copy ID
        </button>
        <button
          type="button"
          onClick={() =>
            void openLocalPanelIfRunning(localServerId ?? undefined)
          }
          className="rounded-lg border border-white/12 px-3 py-1.5 text-[10px] cursor-pointer"
        >
          Open local panel
        </button>
      </div>
    </div>
  );
}
