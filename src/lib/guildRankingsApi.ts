import { ClientHttpError, send, sendMutate } from "./client";
import {
  CacheKeys,
  cachedRead,
  invalidateApiCache,
} from "./apiCache";
import type { LeaderboardRow, RankingMetric } from "../data/guilds";

export class GuildRankingsError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "GuildRankingsError";
    this.status = status;
  }
}

function wrap(prefix: string, err: unknown): GuildRankingsError {
  if (err instanceof ClientHttpError) {
    return new GuildRankingsError(`${prefix}: ${err.message}`, err.status);
  }
  if (err instanceof GuildRankingsError) return err;
  return new GuildRankingsError(
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

function metricFromApi(value: unknown): RankingMetric {
  const raw = String(value ?? "xp").toLowerCase();
  if (raw === "kills" || raw === "playtime") return raw;
  return "xp";
}

export function rankingFromApiRecord(
  raw: unknown,
  guildId: string,
): LeaderboardRow | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const userId = String(obj.user_id ?? "");
  const username = String(
    obj.nickname ?? obj.handle_name ?? obj.username ?? userId,
  ).trim();
  if (!userId && !username) return null;
  return {
    rank: typeof obj.rank === "number" ? obj.rank : 0,
    name: username || userId,
    score: String(obj.score ?? "0"),
    guildId,
    metric: metricFromApi(obj.metric),
  };
}

export async function fetchGuildRankings(
  guildId: string,
  metric: RankingMetric = "xp",
): Promise<LeaderboardRow[]> {
  try {
    const { data } = await cachedRead({
      key: `${CacheKeys.guildRankings(guildId)}.${metric}`,
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
    throw wrap("Could not load rankings", err);
  }
}

export async function upsertMemberStats(
  guildId: string,
  targetUserId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  try {
    await sendMutate(
      "guilds",
      "configure_/_upsert_a_member's_guild_stats",
      { guild_id: guildId, target_user_id: targetUserId, ...patch },
      "PATCH",
    );
    await invalidateApiCache(CacheKeys.guildRankings(guildId));
  } catch (err) {
    throw wrap("Could not update member stats", err);
  }
}
