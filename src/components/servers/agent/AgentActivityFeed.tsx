import {
  formatActivityTime,
  type TelemetryActivityKind,
  type TelemetryActivityLine,
} from "../../../lib/cultAgentTelemetry";
import { cn } from "../../../lib/cn";

const KIND_MARK: Record<TelemetryActivityKind, string> = {
  ok: "●",
  warn: "▲",
  err: "✕",
  info: "·",
  work: "…",
};

const KIND_TONE: Record<TelemetryActivityKind, string> = {
  ok: "text-primary-base",
  warn: "text-state-warning",
  err: "text-state-error",
  info: "text-text-muted",
  work: "text-state-info",
};

type Props = {
  lines: TelemetryActivityLine[];
  className?: string;
  /** Cap visible rows (newest last). */
  max?: number;
  emptyHint?: string;
};

/** Friendly agent Activity HUD — same feed as `cf-agent run`. */
export function AgentActivityFeed({
  lines,
  className,
  max = 12,
  emptyHint = "Activity from this PC will show up here.",
}: Props) {
  const visible = lines.slice(-max);

  return (
    <div
      className={cn(
        "rounded-xl border border-white/10 bg-black/25 overflow-hidden",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/8">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Activity
        </p>
        <p className="text-[9px] text-text-disabled">Live from CultAgent</p>
      </div>
      {visible.length === 0 ? (
        <p className="px-3 py-4 text-[11px] text-text-muted">{emptyHint}</p>
      ) : (
        <ul className="max-h-40 overflow-y-auto scroll-hidden divide-y divide-white/5">
          {visible.map((line, i) => {
            const time = formatActivityTime(line.ts);
            return (
              <li
                key={`${line.ts ?? ""}-${line.text}-${i}`}
                className="flex items-start gap-2 px-3 py-1.5 text-[11px]"
              >
                <span
                  className={cn(
                    "shrink-0 w-3 text-center font-bold leading-5",
                    KIND_TONE[line.kind],
                  )}
                  aria-hidden
                >
                  {KIND_MARK[line.kind]}
                </span>
                {time ? (
                  <span className="shrink-0 font-mono text-[10px] text-text-disabled leading-5 tabular-nums">
                    {time}
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 text-text-secondary leading-5">
                  {line.text}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
