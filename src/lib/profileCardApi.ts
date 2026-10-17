/**
 * Profile identity card — SCORE → TIER → RANK; ACHIEVEMENTS → TITLES → FEATURED.
 * Tier / rank / score are read-only. Title + featured are unlocked-only writes.
 */
import { ClientHttpError, send, sendMutate } from "./client";

export type ProfileCard = {
  userId: string;
  username?: string | null;
  handleName?: string | null;
  tier: string;
  activeTitle?: string | null;
  featuredAchievementIds: string[];
  score: number;
  rank: number | null;
  categories: Record<string, number>;
  titleIds: string[];
  achievements: { id: string; rarity?: string | number | null }[];
};

export type CatalogItem = {
  id: string;
  label: string;
  rarity?: string | null;
  description?: string | null;
};

export class ProfileCardApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "ProfileCardApiError";
    this.status = status;
  }
}

function wrap(prefix: string, err: unknown): ProfileCardApiError {
  if (err instanceof ClientHttpError) {
    return new ProfileCardApiError(`${prefix}: ${err.message}`, err.status);
  }
  if (err instanceof ProfileCardApiError) return err;
  return new ProfileCardApiError(
    `${prefix}: ${err instanceof Error ? err.message : String(err)}`,
  );
}

function asRecord(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : null;
}

function unwrapOne(data: unknown): Record<string, unknown> {
  const obj = asRecord(data);
  if (!obj) return {};
  const inner = asRecord(obj.data);
  return inner ?? obj;
}

function unwrapList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const obj = asRecord(data);
  if (!obj) return [];
  for (const key of ["data", "items", "results", "achievements", "titles"]) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  return [];
}

function cardFromRecord(raw: unknown): ProfileCard | null {
  const obj = unwrapOne(raw);
  const userId = String(obj.user_id ?? obj.userId ?? "").trim();
  if (!userId && !obj.username) return null;
  const cats = asRecord(obj.categories) ?? {};
  const achievementsRaw = Array.isArray(obj.achievements)
    ? obj.achievements
    : [];
  const featured = Array.isArray(obj.featured_achievements)
    ? obj.featured_achievements
    : Array.isArray(obj.featuredAchievements)
      ? obj.featuredAchievements
      : [];
  const titles = Array.isArray(obj.titles) ? obj.titles : [];
  return {
    userId: userId || String(obj.username ?? ""),
    username: typeof obj.username === "string" ? obj.username : null,
    handleName:
      typeof obj.handle_name === "string"
        ? obj.handle_name
        : typeof obj.handleName === "string"
          ? obj.handleName
          : null,
    tier: String(obj.tier ?? "E"),
    activeTitle:
      typeof obj.active_title === "string"
        ? obj.active_title
        : typeof obj.activeTitle === "string"
          ? obj.activeTitle
          : null,
    featuredAchievementIds: featured.map((x) => String(x)),
    score:
      typeof obj.score === "number"
        ? obj.score
        : Number(obj.score ?? obj.total_score ?? 0) || 0,
    rank:
      typeof obj.rank === "number"
        ? obj.rank
        : obj.rank == null
          ? null
          : Number(obj.rank) || null,
    categories: Object.fromEntries(
      Object.entries(cats).map(([k, v]) => [
        k,
        typeof v === "number" ? v : Number(v) || 0,
      ]),
    ),
    titleIds: titles.map((t) => String(t)),
    achievements: achievementsRaw.map((a) => {
      const r = asRecord(a);
      if (!r) return { id: String(a) };
      return {
        id: String(r.id ?? r.achievement_id ?? ""),
        rarity: (r.rarity as string | number | null) ?? null,
      };
    }),
  };
}

/** GET /v1/profile/{identifier}/card */
export async function fetchProfileCard(
  identifier: string,
  opts: { season?: string; facetKey?: string } = {},
): Promise<ProfileCard> {
  try {
    const raw = await send<unknown>("api", "get_profile_card", {
      identifier,
      season: opts.season ?? "default",
      facet_key: opts.facetKey ?? "",
    });
    const card = cardFromRecord(raw);
    if (!card) throw new ProfileCardApiError("Malformed profile card", 502);
    return card;
  } catch (err) {
    throw wrap("Could not load profile card", err);
  }
}

/** PATCH /v1/profile/me/active-title */
export async function setMyActiveTitle(
  titleId: string,
): Promise<ProfileCard> {
  try {
    const raw = await sendMutate(
      "api",
      "set_my_active_title",
      { title_id: titleId },
      "PATCH",
    );
    const card = cardFromRecord(raw);
    if (!card) throw new ProfileCardApiError("Malformed title response", 502);
    return card;
  } catch (err) {
    throw wrap("Could not set active title", err);
  }
}

/** PATCH /v1/profile/me/featured-achievements (3–5 unlocked). */
export async function setMyFeaturedAchievements(
  achievementIds: string[],
): Promise<ProfileCard> {
  try {
    const raw = await sendMutate(
      "api",
      "set_my_featured_achievements",
      { achievement_ids: achievementIds.slice(0, 5) },
      "PATCH",
    );
    const card = cardFromRecord(raw);
    if (!card) throw new ProfileCardApiError("Malformed featured response", 502);
    return card;
  } catch (err) {
    throw wrap("Could not set featured achievements", err);
  }
}

function catalogItemFromRecord(raw: unknown): CatalogItem | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const id = String(obj.id ?? obj.title_id ?? obj.achievement_id ?? "").trim();
  if (!id) return null;
  return {
    id,
    label: String(obj.label ?? obj.name ?? obj.title ?? id),
    rarity: typeof obj.rarity === "string" ? obj.rarity : null,
    description:
      typeof obj.description === "string" ? obj.description : null,
  };
}

/** GET /v1/achievements */
export async function fetchAchievementsCatalog(): Promise<CatalogItem[]> {
  try {
    const raw = await send<unknown>("api", "list_achievements_catalog");
    return unwrapList(raw)
      .map(catalogItemFromRecord)
      .filter((x): x is CatalogItem => Boolean(x));
  } catch (err) {
    throw wrap("Could not load achievements catalog", err);
  }
}

/** GET /v1/titles */
export async function fetchTitlesCatalog(): Promise<CatalogItem[]> {
  try {
    const raw = await send<unknown>("api", "list_titles_catalog");
    return unwrapList(raw)
      .map(catalogItemFromRecord)
      .filter((x): x is CatalogItem => Boolean(x));
  } catch (err) {
    throw wrap("Could not load titles catalog", err);
  }
}
