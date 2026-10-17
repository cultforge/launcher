/**
 * Competitive rankings (API SoT). Launcher displays totals only — never SCORE.md math.
 */
import { ClientHttpError, send } from "./client";
import {
  CacheKeys,
  cachedRead,
  invalidateApiCache,
} from "./apiCache";
import type { LeaderboardRow, RankingMetric } from "../data/guilds";
import { rankingFromApiRecord } from "./guildRankingsApi";

export type RankingBoard = "score" | "legacy";

export type RankingFacets = {
  gameMode?: string;
  cheats?: "on" | "off" | "";
  difficulty?: string;
  pack?: string;
};

export type ScoreStandingRow = {
  rank: number;
  name: string;
  userId: string;
  guildId?: string | null;
  guildName?: string | null;
  score: number;
  tier?: string | null;
  activeTitle?: string | null;
  categories?: Record<string, number>;
  facetKey?: string;
};

export class RankingsApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "RankingsApiError";
    this.status = status;
  }
}

function wrap(prefix: string, err: unknown): RankingsApiError {
  if (err instanceof ClientHttpError) {
    return new RankingsApiError(`${prefix}: ${err.message}`, err.status);
  }
  if (err instanceof RankingsApiError) return err;
  return new RankingsApiError(
    `${prefix}: ${err instanceof Error ? err.message : String(err)}`,
  );
}

function asRecord(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : null;
}

function unwrapList(data: unknown, keys: string[]): unknown[] {
  if (Array.isArray(data)) return data;
  const obj = asRecord(data);
  if (!obj) return [];
  for (const key of keys) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  return [];
}

/** Build facet_key query matching agent server_facet convention. */
export function buildFacetKey(facets: RankingFacets): string {
  const parts: string[] = [];
  if (facets.gameMode?.trim()) parts.push(`mode=${facets.gameMode.trim()}`);
  if (facets.cheats === "on" || facets.cheats === "off") {
    parts.push(`cheats=${facets.cheats}`);
  }
  if (facets.difficulty?.trim()) {
    parts.push(`difficulty=${facets.difficulty.trim()}`);
  }
  if (facets.pack?.trim()) parts.push(`pack=${facets.pack.trim()}`);
  return parts.join("|");
}

function standingFromRecord(raw: unknown): ScoreStandingRow | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const userId = String(obj.user_id ?? obj.userId ?? "").trim();
  const name = String(
    obj.handle_name ??
      obj.username ??
      obj.nickname ??
      obj.guild_name ??
      obj.name ??
      userId,
  ).trim();
  if (!userId && !name) return null;
  const cats = asRecord(obj.categories);
  const categories: Record<string, number> | undefined = cats
    ? Object.fromEntries(
        Object.entries(cats).map(([k, v]) => [
          k,
          typeof v === "number" ? v : Number(v) || 0,
        ]),
      )
    : undefined;
  return {
    rank: typeof obj.rank === "number" ? obj.rank : 0,
    name: name || userId,
    userId,
    guildId:
      typeof obj.guild_id === "string"
        ? obj.guild_id
        : typeof obj.guildId === "string"
          ? obj.guildId
          : null,
    guildName:
      typeof obj.guild_name === "string"
        ? obj.guild_name
        : typeof obj.guildName === "string"
          ? obj.guildName
          : null,
    score:
      typeof obj.total_score === "number"
        ? obj.total_score
        : typeof obj.score === "number"
          ? obj.score
          : Number(obj.total_score ?? obj.score ?? 0) || 0,
    tier: typeof obj.tier === "string" ? obj.tier : null,
    activeTitle:
      typeof obj.active_title === "string"
        ? obj.active_title
        : typeof obj.activeTitle === "string"
          ? obj.activeTitle
          : null,
    categories,
    facetKey:
      typeof obj.facet_key === "string"
        ? obj.facet_key
        : typeof obj.facetKey === "string"
          ? obj.facetKey
          : undefined,
  };
}

/** Guild score board (board=score). */
export async function fetchGuildScoreRankings(
  guildId: string,
  opts: { facetKey?: string; season?: string; limit?: number } = {},
): Promise<ScoreStandingRow[]> {
  try {
    const facetKey = opts.facetKey ?? "";
    const { data } = await cachedRead({
      key: `${CacheKeys.guildRankings(guildId)}.score.${facetKey || "default"}`,
      fetcher: async () => {
        const raw = await send<unknown>("guilds", "guild_leaderboard_rankings", {
          guild_id: guildId,
          board: "score",
          season: opts.season ?? "default",
          facet_key: facetKey,
          limit: String(opts.limit ?? 50),
        });
        return unwrapList(raw, ["data", "rankings", "items"])
          .map(standingFromRecord)
          .filter((x): x is ScoreStandingRow => Boolean(x));
      },
    });
    return data;
  } catch (err) {
    throw wrap("Could not load score rankings", err);
  }
}

/** Legacy guild board (kills / playtime / xp). */
export async function fetchGuildLegacyRankings(
  guildId: string,
  metric: RankingMetric = "kills",
): Promise<LeaderboardRow[]> {
  try {
    const { data } = await cachedRead({
      key: `${CacheKeys.guildRankings(guildId)}.legacy.${metric}`,
      fetcher: async () => {
        const raw = await send<unknown>("guilds", "guild_leaderboard_rankings", {
          guild_id: guildId,
          board: "legacy",
          metric,
        });
        return unwrapList(raw, ["data", "rankings", "items"])
          .map((row) => rankingFromApiRecord(row, guildId))
          .filter((x): x is LeaderboardRow => Boolean(x));
      },
    });
    return data;
  } catch (err) {
    throw wrap("Could not load legacy rankings", err);
  }
}

export async function fetchGlobalPlayerRankings(
  opts: { facetKey?: string; season?: string; limit?: number } = {},
): Promise<ScoreStandingRow[]> {
  try {
    const facetKey = opts.facetKey ?? "";
    const raw = await send<unknown>("api", "global_player_rankings", {
      season: opts.season ?? "default",
      facet_key: facetKey,
      limit: String(opts.limit ?? 50),
    });
    return unwrapList(raw, ["data", "rankings", "items"])
      .map(standingFromRecord)
      .filter((x): x is ScoreStandingRow => Boolean(x));
  } catch (err) {
    throw wrap("Could not load global player rankings", err);
  }
}

export async function fetchGlobalGuildRankings(
  opts: { facetKey?: string; season?: string; limit?: number } = {},
): Promise<ScoreStandingRow[]> {
  try {
    const facetKey = opts.facetKey ?? "";
    const raw = await send<unknown>("api", "global_guild_rankings", {
      season: opts.season ?? "default",
      facet_key: facetKey,
      limit: String(opts.limit ?? 50),
    });
    return unwrapList(raw, ["data", "rankings", "items"])
      .map((row) => {
        const obj = asRecord(row);
        if (!obj) return null;
        // Guild standings may use guild_id as the entity id.
        const mapped = standingFromRecord({
          ...obj,
          user_id: obj.guild_id ?? obj.user_id ?? obj.guildId,
          username: obj.guild_name ?? obj.name ?? obj.username,
        });
        return mapped;
      })
      .filter((x): x is ScoreStandingRow => Boolean(x));
  } catch (err) {
    throw wrap("Could not load global guild rankings", err);
  }
}

export async function invalidateGuildRankingsCache(guildId: string) {
  await invalidateApiCache(CacheKeys.guildRankings(guildId));
}
