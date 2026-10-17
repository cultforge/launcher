import { useEffect, useMemo, useState } from "react";
import { useGuildStore } from "../../../stores/guilds";
import { cn } from "../../../lib/cn";
import type { RankingMetric } from "../../../data/guilds";
import { getGuild } from "../../../data/guilds";
import {
  buildFacetKey,
  fetchGlobalGuildRankings,
  fetchGlobalPlayerRankings,
  fetchGuildScoreRankings,
  type RankingFacets,
  type ScoreStandingRow,
} from "../../../lib/rankingsApi";
import { ShareDeepLinkButton } from "../../CopyButton";
import type { CultforgeDeepLink } from "../../../lib/deepLinks";

const LEGACY_METRICS: { id: RankingMetric; label: string }[] = [
  { id: "xp", label: "Weekly XP" },
  { id: "kills", label: "Raid kills" },
  { id: "playtime", label: "Playtime" },
];

const GAME_MODES = ["", "survival", "creative", "adventure", "hardcore"];
const DIFFICULTIES = ["", "peaceful", "easy", "normal", "hard"];

type ScopeTab = "guild-score" | "guild-legacy" | "global-players" | "global-guilds";

export function RankingsPanel() {
  const guildId = useGuildStore((s) => s.activeGuildId);
  const metric = useGuildStore((s) => s.rankingMetric);
  const setMetric = useGuildStore((s) => s.setRankingMetric);
  const hydrateLegacy = useGuildStore((s) => s.hydrateGuildRankings);
  const legacyRows = useGuildStore((s) => s.rankings);
  const guild = getGuild(guildId);
  const verified = guild?.verificationStatus === "verified";

  const [scope, setScope] = useState<ScopeTab>("guild-score");
  const [facets, setFacets] = useState<RankingFacets>({
    gameMode: "",
    cheats: "",
    difficulty: "",
    pack: "",
  });
  const [scoreRows, setScoreRows] = useState<ScoreStandingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const facetKey = useMemo(() => buildFacetKey(facets), [facets]);

  useEffect(() => {
    if (scope === "guild-legacy") {
      void hydrateLegacy(guildId);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const run = async () => {
      try {
        let rows: ScoreStandingRow[] = [];
        if (scope === "guild-score") {
          rows = await fetchGuildScoreRankings(guildId, { facetKey });
        } else if (scope === "global-players") {
          rows = await fetchGlobalPlayerRankings({ facetKey });
        } else {
          rows = await fetchGlobalGuildRankings({ facetKey });
        }
        if (!cancelled) setScoreRows(rows);
      } catch (err) {
        if (!cancelled) {
          setScoreRows([]);
          setError(err instanceof Error ? err.message : "Could not load rankings");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [scope, guildId, facetKey, hydrateLegacy]);

  // Prefetch legacy into store when metric changes (existing hydrate path).
  useEffect(() => {
    if (scope === "guild-legacy") void hydrateLegacy(guildId);
  }, [metric, scope, guildId, hydrateLegacy]);

  const legacyFiltered = legacyRows
    .filter((r) => r.guildId === guildId && r.metric === metric)
    .sort((a, b) => a.rank - b.rank);

  const showOfficialClimb =
    scope === "guild-score" ||
    scope === "global-players" ||
    scope === "global-guilds";

  const shareLink: CultforgeDeepLink =
    scope === "global-players"
      ? { kind: "rankings-players" }
      : scope === "global-guilds"
        ? { kind: "rankings-guilds" }
        : { kind: "guild-rankings", guildId };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {guild?.verificationStatus ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide",
              verified
                ? "bg-primary-base/15 text-primary-base"
                : "bg-white/8 text-text-muted",
            )}
          >
            {guild.verificationStatus}
          </span>
        ) : (
          <span className="rounded-full bg-white/8 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-text-muted">
            unverified
          </span>
        )}
        {showOfficialClimb && !verified ? (
          <span className="text-[10px] text-text-muted">
            Official climb locked until this guild is verified.
          </span>
        ) : null}
        <div className="ml-auto">
          <ShareDeepLinkButton
            link={shareLink}
            label={
              scope === "global-players" || scope === "global-guilds"
                ? "Share rankings"
                : "Share guild board"
            }
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["guild-score", "Score"],
            ["guild-legacy", "Legacy"],
            ["global-players", "Global players"],
            ["global-guilds", "Global guilds"],
          ] as const
        ).map(([id, label]) => {
          const active = scope === id;
          const disabled = id !== "guild-legacy" && !verified;
          return (
            <button
              key={id}
              type="button"
              disabled={disabled && id.startsWith("global")}
              onClick={() => setScope(id)}
              className={cn(
                "px-3 py-1.5 text-[11px] font-semibold rounded-lg border cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
                active
                  ? "border-primary-base/40 bg-primary-base/12 text-primary-base"
                  : "border-white/8 text-text-muted hover:text-text-primary",
              )}
              title={
                disabled && id.startsWith("global")
                  ? "Verified guilds only"
                  : undefined
              }
            >
              {label}
            </button>
          );
        })}
      </div>

      {scope !== "guild-legacy" ? (
        <div className="flex flex-wrap gap-2 items-center">
          <FacetSelect
            label="Mode"
            value={facets.gameMode ?? ""}
            options={GAME_MODES}
            onChange={(v) => setFacets((f) => ({ ...f, gameMode: v }))}
          />
          <FacetSelect
            label="Cheats"
            value={facets.cheats ?? ""}
            options={["", "off", "on"]}
            onChange={(v) =>
              setFacets((f) => ({
                ...f,
                cheats: (v as RankingFacets["cheats"]) || "",
              }))
            }
          />
          <FacetSelect
            label="Difficulty"
            value={facets.difficulty ?? ""}
            options={DIFFICULTIES}
            onChange={(v) => setFacets((f) => ({ ...f, difficulty: v }))}
          />
          <label className="flex items-center gap-1.5 text-[10px] text-text-muted">
            Pack
            <input
              value={facets.pack ?? ""}
              onChange={(e) =>
                setFacets((f) => ({ ...f, pack: e.target.value }))
              }
              placeholder="optional"
              className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-text-primary w-28"
            />
          </label>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {LEGACY_METRICS.map((m) => {
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
      )}

      {!verified && scope === "guild-score" ? (
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-text-muted">
          Score board still loads for members, but official competitive climb
          CTAs stay greyed until verification.
        </div>
      ) : null}

      <div className="cf-panel rounded-xl p-1.5 flex flex-col gap-0.5">
        {loading ? (
          <div className="px-3 py-8 text-center text-[13px] text-text-muted">
            Loading rankings…
          </div>
        ) : error ? (
          <div className="px-3 py-8 text-center text-[13px] text-state-error">
            {error}
          </div>
        ) : scope === "guild-legacy" ? (
          legacyFiltered.length === 0 ? (
            <div className="px-3 py-8 text-center text-[13px] text-text-muted">
              No legacy rankings yet
            </div>
          ) : (
            legacyFiltered.map((r) => (
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
          )
        ) : scoreRows.length === 0 ? (
          <div className="px-3 py-8 text-center text-[13px] text-text-muted">
            No score rankings yet
          </div>
        ) : (
          scoreRows.map((r) => (
            <div
              key={`${r.userId}-${r.rank}`}
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
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-text-primary font-medium truncate">
                  {r.name}
                </div>
                <div className="text-[10px] text-text-muted truncate">
                  {[r.tier, r.activeTitle, r.guildName]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <span className="text-[12px] text-text-secondary tabular-nums">
                {Math.round(r.score)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function FacetSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[10px] text-text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-text-primary"
      >
        {options.map((o) => (
          <option key={o || "any"} value={o}>
            {o || "any"}
          </option>
        ))}
      </select>
    </label>
  );
}
