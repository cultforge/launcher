import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import {
  approveCultAgentDeviceLogin,
  listAccessibleCultAgentNodes,
} from "../../../lib/cultAgentApi";
import { joinedGuilds } from "../../../data/guilds";
import { copyText } from "../../../lib/copyText";

const LOGIN_CMD = "cf-agent login";
const RUN_CMD = "cf-agent run";

type Props = {
  onLinked?: () => void;
  className?: string;
  compact?: boolean;
};

export function AgentPersonalConnectPanel({
  onLinked,
  className,
  compact = false,
}: Props) {
  const [userCode, setUserCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [watching, setWatching] = useState(false);
  const pollRef = useRef<number | null>(null);
  const baselineRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  const stopWatch = () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
    setWatching(false);
  };

  const guildIds = () => joinedGuilds().map((g) => g.id);

  const loadNodes = async () => {
    const nodes = await listAccessibleCultAgentNodes(guildIds(), {
      dedupe: true,
    });
    return nodes.filter((n) => !n.guildId);
  };

  const startWatch = async () => {
    stopWatch();
    setWatching(true);
    try {
      const nodes = await loadNodes();
      baselineRef.current = new Set(nodes.map((n) => n.id));
    } catch {
      baselineRef.current = new Set();
    }

    let ticks = 0;
    pollRef.current = window.setInterval(() => {
      ticks += 1;
      void (async () => {
        try {
          const personal = await loadNodes();
          const appeared = personal.some(
            (n) => !baselineRef.current.has(n.id),
          );
          if (appeared || (personal.length > 0 && ticks <= 2)) {
            stopWatch();
            if (appeared) {
              toast.success("PC connected!", {
                description: "Your personal agent is linked.",
              });
            }
            onLinked?.();
            return;
          }
        } catch {
          /* keep polling */
        }
        if (ticks >= 36) stopWatch();
      })();
    }, 5000);
  };

  const onApprove = async () => {
    const code = userCode.trim().toUpperCase();
    if (!code) {
      toast.error("Enter the code shown by cf-agent login");
      return;
    }
    setBusy(true);
    try {
      await approveCultAgentDeviceLogin(code, null);
      toast.success("Device approved", {
        description: "Keep cf-agent run going on that PC.",
      });
      setUserCode("");
      void startWatch();
      onLinked?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not approve this device",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`cf-panel rounded-xl p-4 flex flex-col gap-3 ${className ?? ""}`}
    >
      <div>
        <h3 className="text-[13px] font-semibold text-text-primary">
          Connect your PC
        </h3>
        {!compact ? (
          <p className="text-[11px] text-text-muted mt-1.5 leading-relaxed">
            Install cf-agent on the computer that will run your worlds. Sign in
            with your CultForge account — no passwords pasted into the launcher.
          </p>
        ) : null}
      </div>

      <ol className="list-decimal list-inside text-[11px] text-text-secondary space-y-2 pl-0.5">
        <li>
          On that PC, run{" "}
          <span className="font-mono text-text-primary">{LOGIN_CMD}</span>
        </li>
        <li>Sign in when your browser opens</li>
        <li>
          Start the agent:{" "}
          <span className="font-mono text-text-primary">{RUN_CMD}</span>
        </li>
      </ol>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copyText(LOGIN_CMD, "Login command copied")}
          className="inline-flex items-center gap-1 rounded-lg border border-white/12 px-3 py-1.5 text-[10px] font-semibold text-text-secondary hover:bg-white/5 cursor-pointer"
        >
          <Copy size={12} />
          Copy login command
        </button>
        <button
          type="button"
          onClick={() => void copyText(RUN_CMD, "Run command copied")}
          className="inline-flex items-center gap-1 rounded-lg border border-white/12 px-3 py-1.5 text-[10px] font-semibold text-text-secondary hover:bg-white/5 cursor-pointer"
        >
          <Copy size={12} />
          Copy run command
        </button>
        <button
          type="button"
          onClick={() => void startWatch()}
          className="cf-btn-primary rounded-lg px-3 py-1.5 text-[10px] font-semibold cursor-pointer"
        >
          {watching ? "Watching…" : "Watch for PC"}
        </button>
      </div>

      <div className="rounded-lg border border-white/8 bg-black/20 px-3 py-2.5 flex flex-col gap-2">
        <p className="text-[10px] text-text-muted">
          Already ran login? Paste the code from the terminal here to approve
          from this launcher:
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={userCode}
            onChange={(e) => setUserCode(e.target.value.toUpperCase())}
            placeholder="ABCD-1234"
            className="min-w-40 flex-1 rounded-md border border-border-strong bg-black/25 px-2.5 py-2 font-mono text-[11px] text-text-primary outline-none placeholder:text-text-disabled uppercase"
          />
          <button
            type="button"
            disabled={busy || !userCode.trim()}
            onClick={() => void onApprove()}
            className="cf-btn-primary rounded-lg px-4 py-2 text-[10px] font-semibold cursor-pointer disabled:opacity-40"
          >
            {busy ? "Approving…" : "Approve device"}
          </button>
        </div>
      </div>
    </div>
  );
}
