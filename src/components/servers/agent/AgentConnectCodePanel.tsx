import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import {
  createCultAgentPairingCode,
  listGuildCultAgentNodes,
  listMyCultAgentNodes,
  type CultAgentPairing,
} from "../../../lib/cultAgentApi";
import { copyText } from "../../../lib/copyText";

type Props = {
  /** When set, the pairing code registers the agent for this guild. */
  guildId?: string | null;
  onLinked?: () => void;
  title?: string;
  subtitle?: string;
  className?: string;
  /** Pre-fill a code from a deep link (display only until regenerated). */
  initialCode?: string | null;
};

function registerCommand(code: string): string {
  return `cf-agent register --code ${code}`;
}

export function AgentConnectCodePanel({
  guildId,
  onLinked,
  title = "Connect a guild PC",
  subtitle,
  className,
  initialCode,
}: Props) {
  const [pairing, setPairing] = useState<CultAgentPairing | null>(
    initialCode?.trim()
      ? { code: initialCode.trim(), expiresAt: null, claimUrl: null, raw: {} }
      : null,
  );
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

  const loadNodes = async () => {
    if (guildId) {
      return listGuildCultAgentNodes(guildId, 50, {
        dedupe: true,
        scope: "mine",
      });
    }
    return listMyCultAgentNodes(50, { dedupe: true });
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
          const nodes = await loadNodes();
          const appeared = nodes.some((n) => !baselineRef.current.has(n.id));
          if (appeared || (nodes.length > 0 && ticks <= 2)) {
            if (appeared) {
              stopWatch();
              toast.success("PC connected!", {
                description: "Your agent appeared in the list.",
              });
            } else if (nodes.length > 0) {
              stopWatch();
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

  const onGenerate = async () => {
    setBusy(true);
    try {
      const next = await createCultAgentPairingCode(guildId);
      setPairing(next);
      toast.success("Connect code ready", {
        description: "Copy the code or full command for the hosting PC.",
      });
      onLinked?.();
      void startWatch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not create code";
      if (msg.includes("403") || /limit/i.test(msg)) {
        toast.error(
          "Agent limit reached (3 personal, or 7 if you admin a guild). Revoke an old agent first.",
        );
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const code = pairing?.code ?? "";
  const command = code ? registerCommand(code) : "";
  const scopeLabel = guildId ? "this guild" : "your account";

  return (
    <div
      className={`cf-panel rounded-xl p-4 flex flex-col gap-3 ${className ?? ""}`}
    >
      <div>
        <h3 className="text-[13px] font-semibold text-text-primary">{title}</h3>
        <p className="text-[11px] text-text-muted mt-1.5 leading-relaxed">
          {subtitle ??
            `Install cf-agent on the machine that will host guild worlds. Generate a code here, then on that PC run the register command below.`}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onGenerate()}
          className="cf-btn-primary rounded-lg px-4 py-2 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
        >
          {busy ? "Creating…" : pairing ? "New code" : "Generate connect code"}
        </button>
      </div>

      {pairing ? (
        <div className="rounded-lg border border-primary-base/25 bg-primary-base/8 px-3 py-3 text-[11px] text-text-secondary flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-text-muted">Code</span>
            <span className="font-mono text-[15px] font-bold text-primary-base tracking-wide">
              {code}
            </span>
            <button
              type="button"
              onClick={() => void copyText(code, "Code copied")}
              className="inline-flex items-center gap-1 rounded-md border border-white/12 px-2 py-1 text-[10px] text-text-secondary hover:bg-white/5 cursor-pointer"
            >
              <Copy size={12} />
              Copy code
            </button>
          </div>

          <div className="rounded-md bg-black/30 px-2.5 py-2 font-mono text-[10px] text-text-primary break-all">
            {command}
          </div>
          <button
            type="button"
            onClick={() => void copyText(command, "Command copied")}
            className="self-start inline-flex items-center gap-1 rounded-md border border-white/12 px-2.5 py-1.5 text-[10px] font-semibold text-text-secondary hover:bg-white/5 cursor-pointer"
          >
            <Copy size={12} />
            Copy command
          </button>

          {pairing.expiresAt ? (
            <p className="text-[10px] text-text-muted">
              Expires {new Date(pairing.expiresAt).toLocaleString()}
            </p>
          ) : null}

          <p className="text-[10px] text-text-muted leading-relaxed">
            On the hosting PC:{" "}
            <span className="font-mono text-text-primary">{command}</span>, then{" "}
            <span className="font-mono text-text-primary">cf-agent run</span>.
            Registers for {scopeLabel}.
            {watching
              ? " Watching for this PC to appear (~3 min)…"
              : " Generate a fresh code to start watching again."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
