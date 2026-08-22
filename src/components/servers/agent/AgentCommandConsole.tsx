import { useEffect, useState } from "react";
import { toast } from "sonner";
import { humanizeAgentError } from "../../../lib/agentControl";
import {
  confirmCultAgentCommand,
  enqueueCultAgentCommand,
  formatCultAgentCommandResult,
  getNodeAgentCommandProfile,
  isAgentNodeOnline,
  listCultAgentCommands,
  putNodeAgentCommandProfile,
  waitForCultAgentCommand,
  type CultAgentCommand,
  type CultAgentNode,
} from "../../../lib/cultAgentApi";

const NODE_ACTIONS = [
  { action: "node.status", label: "Node status" },
  { action: "node.metrics", label: "Metrics" },
  { action: "server.list", label: "List servers" },
];

const SERVER_ACTIONS = [
  { action: "server.status", label: "Server status" },
  { action: "server.start", label: "Start", risk: true },
  { action: "server.stop", label: "Stop", risk: true },
  { action: "server.restart", label: "Restart", risk: true },
  { action: "backup.create", label: "Backup", risk: true },
];

const DEFAULT_PROFILE = {
  schema_version: 1,
  cli: { prompt: "cf-agent>", language: "cagl" },
  builtins: {
    enabled: [
      "node.status",
      "node.metrics",
      "server.list",
      "server.status",
      "server.start",
      "server.stop",
      "server.restart",
      "server.console.read",
      "server.console.execute",
    ],
  },
  aliases: { restart: "server.restart" },
  commands: {},
};

type Props = {
  node: CultAgentNode;
  localServerId?: string | null;
  workloadId?: string | null;
};

export function AgentCommandConsole({ node, localServerId, workloadId }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [output, setOutput] = useState("");
  const [statusLine, setStatusLine] = useState("");
  const [history, setHistory] = useState<CultAgentCommand[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<CultAgentCommand | null>(
    null,
  );
  const [customAction, setCustomAction] = useState("node.status");
  const [payloadJson, setPayloadJson] = useState("{}");
  const [shellLine, setShellLine] = useState("");
  const [showProfile, setShowProfile] = useState(false);
  const [profileJson, setProfileJson] = useState(
    JSON.stringify(DEFAULT_PROFILE, null, 2),
  );
  const [profileBusy, setProfileBusy] = useState(false);
  const online = isAgentNodeOnline(node);

  const refreshHistory = async () => {
    try {
      const rows = await listCultAgentCommands(node.id);
      setHistory(rows.slice(0, 12));
    } catch {
      /* listing is optional */
    }
  };

  useEffect(() => {
    void refreshHistory();
    void getNodeAgentCommandProfile(node.id)
      .then((p) => {
        if (p.config && Object.keys(p.config).length) {
          setProfileJson(JSON.stringify(p.config, null, 2));
        }
      })
      .catch(() => undefined);
  }, [node.id]);

  const run = async (
    action: string,
    extra: Record<string, unknown> = {},
  ): Promise<CultAgentCommand | null> => {
    setBusy(action);
    setPendingConfirm(null);
    setStatusLine(`Queuing ${action}…`);
    setOutput("");
    try {
      let payload: Record<string, unknown> = { ...extra };
      if (localServerId) {
        payload = {
          local_server_id: localServerId,
          server_id: localServerId,
          resource_id: localServerId,
          ...payload,
        };
      }
      if (workloadId) payload.workload_id = workloadId;
      const cmd = await enqueueCultAgentCommand(node.id, {
        action,
        payload,
        workload_id: workloadId ?? undefined,
      });
      setStatusLine(`${action} · ${cmd.status}`);
      if (cmd.confirmToken) {
        setPendingConfirm(cmd);
        setOutput(
          formatCultAgentCommandResult(cmd.result) ||
            "High-risk command — confirm to run it on the agent.",
        );
        toast.message("Confirm required");
        return cmd;
      }
      const done = await waitForCultAgentCommand(node.id, cmd.id, {
        timeoutMs: 40_000,
        preferRealtime: true,
      });
      setStatusLine(`${done.action} · ${done.status}`);
      if (done.confirmToken) {
        setPendingConfirm(done);
        setOutput(
          formatCultAgentCommandResult(done.result) ||
            "Agent is waiting for confirm.",
        );
      } else {
        setOutput(
          formatCultAgentCommandResult(done.result) ||
            `(no payload · ${done.status})`,
        );
      }
      toast.success(`${done.action} · ${done.status}`);
      await refreshHistory();
      return done;
    } catch (err) {
      const msg = humanizeAgentError(err);
      setStatusLine(msg);
      setOutput(msg);
      toast.error(msg);
      return null;
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
      toast.success("Confirmed");
      const done = await waitForCultAgentCommand(node.id, pendingConfirm.id);
      setPendingConfirm(null);
      setStatusLine(`${done.action} · ${done.status}`);
      setOutput(formatCultAgentCommandResult(done.result) || done.status);
      await refreshHistory();
    } catch (err) {
      toast.error(humanizeAgentError(err));
    } finally {
      setBusy(null);
    }
  };

  const onCustom = async () => {
    const action = customAction.trim();
    if (!action) return;
    let extra: Record<string, unknown> = {};
    try {
      extra = JSON.parse(payloadJson || "{}") as Record<string, unknown>;
    } catch {
      toast.error("Payload must be valid JSON");
      return;
    }
    await run(action, extra);
  };

  const onShell = async () => {
    const command = shellLine.trim();
    if (!command) return;
    setShellLine("");
    await run("server.console.execute", { command });
  };

  const saveProfile = async () => {
    setProfileBusy(true);
    try {
      const parsed = JSON.parse(profileJson) as Record<string, unknown>;
      const saved = await putNodeAgentCommandProfile(node.id, parsed);
      setProfileJson(JSON.stringify(saved.config, null, 2));
      toast.success("Command profile saved on this agent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setProfileBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-primary-base/20 bg-primary-base/6 p-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[11px] font-semibold text-text-primary">
            Agent commands
          </h3>
          <p className="text-[10px] text-text-muted mt-0.5">
            Real enqueue to cf-agent — not a mock. Node actions work as soon as
            the agent is linked. Server actions need a bound server.
            {!online
              ? " Agent is offline: commands queue until it reconnects."
              : " Online: WebSocket delivery, poll fallback."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowProfile((v) => !v)}
          className="rounded-md border border-white/12 px-2 py-1 text-[9px] text-text-secondary cursor-pointer"
        >
          {showProfile ? "Hide profile" : "Set commands (CAGL)"}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {NODE_ACTIONS.map((c) => (
          <button
            key={c.action}
            type="button"
            disabled={busy !== null}
            onClick={() => void run(c.action)}
            className="rounded-md border border-white/12 px-2.5 py-1.5 text-[10px] text-text-secondary cursor-pointer hover:bg-white/5 disabled:opacity-40"
          >
            {busy === c.action ? "…" : c.label}
          </button>
        ))}
        {SERVER_ACTIONS.map((c) => (
          <button
            key={c.action}
            type="button"
            disabled={busy !== null || !localServerId}
            title={
              localServerId
                ? undefined
                : "Bind a server first, then start/stop/console work"
            }
            onClick={() => void run(c.action)}
            className={`rounded-md border px-2.5 py-1.5 text-[10px] cursor-pointer disabled:opacity-40 ${
              c.risk
                ? "border-state-error/30 text-state-error"
                : "border-white/12 text-text-secondary hover:bg-white/5"
            }`}
          >
            {busy === c.action ? "…" : c.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={customAction}
          onChange={(e) => setCustomAction(e.target.value)}
          placeholder="action e.g. node.status"
          className="min-w-36 flex-1 rounded-lg border border-border-strong bg-black/25 px-2.5 py-1.5 font-mono text-[10px] text-text-primary outline-none"
        />
        <input
          value={payloadJson}
          onChange={(e) => setPayloadJson(e.target.value)}
          placeholder='{"key":"value"}'
          className="min-w-40 flex-[2] rounded-lg border border-border-strong bg-black/25 px-2.5 py-1.5 font-mono text-[10px] text-text-primary outline-none"
        />
        <button
          type="button"
          disabled={busy !== null || !customAction.trim()}
          onClick={() => void onCustom()}
          className="cf-btn-primary rounded-lg px-3 py-1.5 text-[10px] font-semibold cursor-pointer disabled:opacity-40"
        >
          Issue
        </button>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void onShell();
        }}
      >
        <input
          value={shellLine}
          onChange={(e) => setShellLine(e.target.value)}
          placeholder={
            localServerId
              ? "Minecraft console: list · say hello · tps"
              : "Bind a server to send Minecraft console commands"
          }
          disabled={!localServerId || busy !== null}
          className="flex-1 rounded-lg border border-border-strong bg-black/25 px-2.5 py-1.5 font-mono text-[10px] text-text-primary outline-none disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={!localServerId || busy !== null || !shellLine.trim()}
          className="rounded-lg border border-white/12 px-3 py-1.5 text-[10px] cursor-pointer disabled:opacity-40"
        >
          Send
        </button>
      </form>

      {showProfile ? (
        <div className="flex flex-col gap-2">
          <p className="text-[9px] text-text-muted">
            Node command profile — aliases and extra actions the agent expands
            before running.
          </p>
          <textarea
            value={profileJson}
            onChange={(e) => setProfileJson(e.target.value)}
            rows={8}
            spellCheck={false}
            className="w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 font-mono text-[10px] text-text-secondary outline-none"
          />
          <button
            type="button"
            disabled={profileBusy}
            onClick={() => void saveProfile()}
            className="self-start cf-btn-primary rounded-lg px-3 py-1.5 text-[10px] font-semibold cursor-pointer disabled:opacity-50"
          >
            {profileBusy ? "Saving…" : "Save command profile"}
          </button>
        </div>
      ) : null}

      <div className="rounded-lg border border-white/8 bg-black/35 px-3 py-2">
        <p className="text-[9px] uppercase tracking-wider text-text-disabled">
          {statusLine || "No command issued yet"}
        </p>
        <pre className="mt-1 max-h-40 overflow-y-auto scroll-hidden whitespace-pre-wrap font-mono text-[10px] text-text-secondary">
          {output || "Results from the agent show here."}
        </pre>
        {pendingConfirm ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void onConfirm()}
            className="mt-2 cf-btn-primary rounded-lg px-3 py-1.5 text-[10px] font-semibold cursor-pointer"
          >
            Confirm {pendingConfirm.action}
          </button>
        ) : null}
      </div>

      {history.length > 0 ? (
        <div>
          <p className="text-[9px] uppercase tracking-wider text-text-disabled mb-1">
            Recent commands
          </p>
          <ul className="flex flex-col gap-1">
            {history.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 text-[10px] text-text-muted font-mono"
              >
                <span className="truncate">{c.action}</span>
                <span className="shrink-0 text-text-disabled">{c.status}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
