import { useEffect, useState } from "react";
import {
  getCultAgentNodeTelemetry,
  isAgentNodeOnline,
  type CultAgentNode,
} from "../../../lib/cultAgentApi";
import { humanizePcConnection } from "../../../lib/agentResultHumanize";
import {
  parseTelemetryHud,
  summarizeTelemetry,
  type TelemetryActivityLine,
  type TelemetryTransportMode,
} from "../../../lib/cultAgentTelemetry";
import { copyText, truncateMiddle } from "../../../lib/copyText";
import { cn } from "../../../lib/cn";
import { AgentActivityFeed } from "./AgentActivityFeed";

function Meter({
  label,
  pct,
  compact,
}: {
  label: string;
  pct: number | null;
  compact?: boolean;
}) {
  const v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className={cn("flex-1", compact ? "min-w-0" : "min-w-[7rem]")}>
      <div
        className={cn(
          "flex justify-between text-text-muted mb-1",
          compact ? "text-[9px]" : "text-[11px] mb-1.5",
        )}
      >
        <span>{label}</span>
        <span className="tabular-nums">{pct == null ? "—" : `${Math.round(v)}%`}</span>
      </div>
      <div
        className={cn(
          "rounded-full bg-white/8 overflow-hidden",
          compact ? "h-1" : "h-2",
        )}
      >
        <div
          className="h-full rounded-full bg-primary-base transition-all duration-500"
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}

type Props = {
  node: CultAgentNode;
  serverCount: number;
  className?: string;
  /** Dense strip for sidebar / header — hides big cards + collapses activity. */
  compact?: boolean;
  /** Notify parent of inferred link mode (realtime vs standard). */
  onTransportChange?: (mode: TelemetryTransportMode) => void;
};

const TELEMETRY_POLL_MS = 10_000;

export function AgentPcOverview({
  node,
  serverCount,
  className,
  compact = false,
  onTransportChange,
}: Props) {
  const online = isAgentNodeOnline(node);
  const [transport, setTransport] = useState<TelemetryTransportMode>("unknown");
  const connection = humanizePcConnection(online, null, transport);
  const [cpu, setCpu] = useState<number | null>(null);
  const [ram, setRam] = useState<number | null>(null);
  const [activity, setActivity] = useState<TelemetryActivityLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [showActivity, setShowActivity] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const telemetry = await getCultAgentNodeTelemetry(node.id).catch(
          () => null,
        );
        if (cancelled) return;
        if (!telemetry) {
          setLoading(false);
          return;
        }
        const view = summarizeTelemetry(telemetry);
        const hud = parseTelemetryHud(telemetry);
        setCpu(view.cpuPct);
        setRam(view.ramPct);
        setActivity(hud.activity);
        setTransport(hud.transport);
        onTransportChange?.(hud.transport);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const id = window.setInterval(() => void load(), TELEMETRY_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [node.id, onTransportChange]);

  if (compact) {
    const latest = activity[activity.length - 1];
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-bold",
              connection.pcReachable
                ? "bg-primary-base/15 text-primary-base"
                : "bg-white/8 text-text-muted",
            )}
          >
            {connection.linkLabel}
          </span>
          <button
            type="button"
            onClick={() => void copyText(node.id, "PC id copied")}
            className="font-mono text-[9px] text-text-disabled hover:text-text-muted cursor-pointer truncate max-w-[7rem]"
            title={node.id}
          >
            {truncateMiddle(node.id, 6, 4)}
          </button>
        </div>
        <div className="flex gap-2">
          <Meter label="CPU" pct={loading ? null : cpu} compact />
          <Meter label="RAM" pct={loading ? null : ram} compact />
        </div>
        <p className="text-[10px] text-text-muted tabular-nums">
          {serverCount} world{serverCount === 1 ? "" : "s"}
        </p>
        {latest ? (
          <button
            type="button"
            onClick={() => setShowActivity((v) => !v)}
            className="text-left text-[10px] text-text-secondary leading-snug line-clamp-2 hover:text-text-primary cursor-pointer"
          >
            {latest.text}
            {activity.length > 1
              ? ` · ${showActivity ? "Hide" : `+${activity.length - 1}`}`
              : ""}
          </button>
        ) : null}
        {showActivity ? (
          <AgentActivityFeed lines={activity} max={8} className="mt-1" />
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-white/10 bg-black/20 p-4 flex flex-col gap-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
            This computer
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-bold",
                connection.pcReachable
                  ? "bg-primary-base/15 text-primary-base"
                  : "bg-white/8 text-text-muted",
              )}
            >
              {connection.linkLabel}
            </span>
            {node.guildId ? (
              <span className="rounded-full bg-accent-delta/12 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent-delta">
                Guild PC
              </span>
            ) : (
              <span className="rounded-full bg-state-info/12 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-state-info">
                Personal PC
              </span>
            )}
          </div>
          <p className="mt-2 text-[12px] text-text-secondary leading-relaxed max-w-md">
            {connection.linkDetail}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void copyText(node.id, "PC id copied")}
          className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] text-text-muted hover:text-text-primary cursor-pointer font-mono"
          title={node.id}
        >
          {truncateMiddle(node.id)} · Copy
        </button>
      </div>

      <div className="flex flex-wrap gap-4">
        <Meter label="CPU" pct={loading ? null : cpu} />
        <Meter label="Memory" pct={loading ? null : ram} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
        <div className="rounded-lg border border-white/8 bg-white/3 px-3 py-2.5">
          <p className="text-text-muted">Worlds on this PC</p>
          <p className="mt-0.5 text-[15px] font-semibold text-text-primary tabular-nums">
            {serverCount}
          </p>
        </div>
        <div className="rounded-lg border border-white/8 bg-white/3 px-3 py-2.5 sm:col-span-2">
          <p className="text-text-muted">What to do next</p>
          <p className="mt-0.5 text-text-secondary leading-snug">
            {serverCount === 0
              ? "Add a server below, then press Start to launch Minecraft on this PC."
              : "Pick a world, then Start to play."}
          </p>
        </div>
      </div>

      <AgentActivityFeed
        lines={activity}
        emptyHint={
          online
            ? "Waiting for CultAgent activity…"
            : "PC offline — activity appears when CultAgent reconnects."
        }
      />
    </div>
  );
}
