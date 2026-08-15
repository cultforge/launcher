import { useGuildStore } from "../../../stores/guilds";
import { cn } from "../../../lib/cn";
import type { RankingMetric } from "../../../data/guilds";

const METRICS: { id: RankingMetric; label: string }[] = [
  { id: "xp", label: "Weekly XP" },
  { id: "kills", label: "Raid kills" },
  { id: "playtime", label: "Playtime" },
];

export function RankingsPanel() {
  const guildId = useGuildStore((s) => s.activeGuildId);
  const metric = useGuildStore((s) => s.rankingMetric);
  const setMetric = useGuildStore((s) => s.setRankingMetric);
  const rankings = useGuildStore((s) => s.rankings);
  const rows = rankings
    .filter((r) => r.guildId === guildId && r.metric === metric)
    .sort((a, b) => a.rank - b.rank);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {METRICS.map((m) => {
          const active = metric === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setMetric(m.id)}
              className={cn(
                "px-3 py-1.5 text-[11px] font-semibold rounded-lg border cursor-pointer",
                active
                  ? "border-primary-base/40 bg-primary-base/12 text-primary-base"
                  : "border-white/8 text-text-muted hover:text-text-primary",
              )}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      <div className="cf-panel rounded-xl p-1.5 flex flex-col gap-0.5">
        {rows.length === 0 ? (
          <div className="px-3 py-8 text-center text-[13px] text-text-muted">
            No rankings yet
          </div>
        ) : (
          rows.map((r) => (
            <div
              key={`${r.metric}-${r.rank}-${r.name}`}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-bg-elevated"
            >
              <span
                className={cn(
                  "w-8 text-[13px] font-bold tabular-nums",
                  r.rank === 1 ? "text-primary-base" : "text-text-muted",
                )}
              >
                #{r.rank}
              </span>
              <span className="flex-1 text-[13px] text-text-primary font-medium truncate">
                {r.name}
              </span>
              <span className="text-[12px] text-text-secondary tabular-nums">
                {r.score}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
