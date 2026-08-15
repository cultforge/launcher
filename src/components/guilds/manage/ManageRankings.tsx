import { toast } from "sonner";
import type { RankingMetric } from "../../../data/guilds";
import { useGuildModalsStore } from "../../../stores/guildModals";
import { useGuildStore } from "../../../stores/guilds";

const METRICS: { id: RankingMetric; label: string }[] = [
  { id: "xp", label: "XP" },
  { id: "kills", label: "Kills" },
  { id: "playtime", label: "Playtime" },
];

export function ManageRankings() {
  const guildId = useGuildStore((state) => state.activeGuildId);
  const rankings = useGuildStore((state) => state.rankings);
  const metric = useGuildStore((state) => state.rankingMetric);
  const setMetric = useGuildStore((state) => state.setRankingMetric);
  const deleteRankingRow = useGuildStore((state) => state.deleteRankingRow);
  const open = useGuildModalsStore((state) => state.open);
  const rows = rankings
    .filter((row) => row.guildId === guildId && row.metric === metric)
    .sort((a, b) => a.rank - b.rank);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-sora text-[14px] font-bold text-text-primary">
            Rankings
          </h3>
          <p className="text-[10px] text-text-muted">
            Edit leaderboard rows per metric.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border-subtle p-0.5">
            {METRICS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setMetric(item.id)}
                className={`rounded-md px-2.5 py-1 text-[9px] cursor-pointer ${
                  metric === item.id
                    ? "bg-primary-base/15 text-primary-base"
                    : "text-text-muted"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => open("ranking")}
            className="cf-btn-primary rounded-lg px-3 py-2 text-[10px] font-semibold cursor-pointer"
          >
            Add row
          </button>
        </div>
      </div>
      <div className="cf-panel overflow-hidden rounded-xl">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[11px] text-text-muted">
            No rows for this metric.
          </p>
        ) : (
          <table className="w-full text-left">
            <thead className="border-b border-border-subtle text-[8px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Rank</th>
                <th className="px-3 py-2 font-medium">Player</th>
                <th className="px-3 py-2 font-medium">Score</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.metric}-${row.name}`}
                  className="border-b border-border-subtle/60 last:border-0"
                >
                  <td className="px-3 py-2 text-[11px] text-text-primary">
                    #{row.rank}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-text-secondary">
                    {row.name}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-text-muted">
                    {row.score}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => open("ranking", row.name)}
                      className="mr-2 text-[9px] text-primary-base cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const result = deleteRankingRow(
                          guildId,
                          row.metric,
                          row.name,
                        );
                        if (result.ok) toast.success(result.message);
                        else toast.error(result.message);
                      }}
                      className="text-[9px] text-state-error cursor-pointer"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
