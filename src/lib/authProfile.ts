import type { CurrentUser } from "../userstore";

const EMPTY_STATS = {
  kills: 0,
  deaths: 0,
  mobsKilled: 0,
  blocksPlaced: 0,
  distanceKm: 0,
  playtimeHours: 0,
  level: 1,
};

/** Rewrite stale api.cultforge.com avatar paths after uid migration (cult__/… → cf_…). */
export function canonicalizeHostedAvatarUrl(
  userId: string,
  avatarUrl: string,
): string {
  const id = (userId || "").trim();
  const url = (avatarUrl || "").trim();
  if (!id || !url) return url;
  const match = url.match(
    /^https?:\/\/(?:www\.)?api\.cultforge\.com\/v1\/profile\/(.+)\/avatar(?:\?.*)?$/i,
  );
  if (!match) return url;
  let pathId = match[1];
  try {
    pathId = decodeURIComponent(pathId);
  } catch {
    /* keep */
  }
  if (pathId === id) return url;
  return `https://api.cultforge.com/v1/profile/${id}/avatar`;
}

export const DEFAULT_DISPLAY_NAME = "CultForge Player";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

/** Unwrap common API envelopes for /v1/profile/me and search. */
export function unwrapProfilePayload(
  raw: unknown,
): Record<string, unknown> | null {
  const root = asRecord(raw);
  if (!root) return null;

  for (const key of ["user", "data", "payload", "profile", "result"]) {
    const nested = asRecord(root[key]);
    if (nested) {
      // One more level if double-wrapped (data.user / payload.user).
      for (const innerKey of ["user", "data", "profile"]) {
        const deeper = asRecord(nested[innerKey]);
        if (
          deeper &&
          (deeper.username ||
            deeper.handle_name ||
            deeper.id ||
            deeper.user_id)
        ) {
          return deeper;
        }
      }
      if (
        nested.username ||
        nested.handle_name ||
        nested.id ||
        nested.user_id ||
        nested.email ||
        nested.avatar_url
      ) {
        return nested;
      }
    }
  }
  return root;
}

/** Top-level keys only — for debug logs (no PII values). */
export function profileEnvelopeKeys(raw: unknown): string {
  const root = asRecord(raw);
  if (!root) return String(raw);
  return Object.keys(root).join(",");
}

/** Best-effort map of get_my_profile (or similar) JSON into CurrentUser. */
export function mapApiProfileToCurrentUser(
  raw: unknown,
  fallback?: Partial<{
    name: string;
    email: string;
    avatarUrl: string;
  }>,
): CurrentUser {
  const root = asRecord(raw) ?? {};
  const data = unwrapProfilePayload(raw) ?? root;

  const pickString = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = data[key] ?? root[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
      }
    }
    return undefined;
  };

  const name =
    pickString("username", "name", "display_name", "displayName") ??
    fallback?.name ??
    DEFAULT_DISPLAY_NAME;
  const email = pickString("email") ?? fallback?.email ?? "";
  const id =
    pickString("id", "user_id", "userId", "uuid", "uid", "sub") ??
    (email ? `email:${email}` : `user:${name.toLowerCase()}`);

  const rawAvatar =
    pickString(
      "avatar_url",
      "avatarUrl",
      "avatar",
      "picture",
      "google_avatar_url",
    ) ??
    fallback?.avatarUrl ??
    "";
  const avatarUrl = canonicalizeHostedAvatarUrl(id, rawAvatar);

  const bio = pickString("bio", "about") ?? "";
  const title = pickString("title", "role") ?? "Member";
  const guild = pickString("guild", "guild_name", "guildName") ?? null;
  const joined = pickString("joined", "created_at", "createdAt") ?? "";
  const handle = pickString("handle", "handle_name", "handleName");

  return {
    id,
    name,
    email,
    avatarUrl,
    activity: pickString("activity", "status_text") ?? "Online",
    status: "online",
    guild,
    title: handle ? `@${handle.replace(/^@/, "")}` : title,
    joined,
    mainBuild: pickString("main_build", "mainBuild") ?? "",
    stats: EMPTY_STATS,
    rankings: [],
    banner: "/art/cultforge-fallback.webp",
    bio,
    relationship: "none",
    lastSeen: "Online now",
    achievements: [],
    recentActivity: [],
    playedBuilds: [],
    performance: [],
  };
}

/** True when mapped user has a real CultForge identity (not the default sentinel). */
export function hasRealProfileIdentity(user: {
  name?: string;
  title?: string;
}): boolean {
  const name = (user.name || "").trim();
  if (!name || name === DEFAULT_DISPLAY_NAME) {
    // Allow OAuth temporary names only when they are not the sentinel;
    // title @handle alone is not enough without a username for shell auth.
    const title = (user.title || "").trim();
    return Boolean(title.startsWith("@") && title.length > 1);
  }
  return true;
}

export function isProfileSuccess(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const obj = raw as Record<string, unknown>;
  if (obj.error) return false;
  if (obj.status === false || obj.status === "error") return false;
  const code = obj.code;
  if (typeof code === "number" && code >= 400) return false;
  // status: "success" from /v1/profile/me is OK.
  const nested = unwrapProfilePayload(raw);
  if (!nested) return false;
  // Identity must include username or handle_name — not only email/avatar.
  const username =
    typeof nested.username === "string" && nested.username.trim();
  const handle =
    (typeof nested.handle_name === "string" && nested.handle_name.trim()) ||
    (typeof nested.handleName === "string" && nested.handleName.trim()) ||
    (typeof nested.handle === "string" && nested.handle.trim());
  return Boolean(username || handle);
}

/** Classify OAuth callback as existing-user login vs new-user registration. */
export function classifyOAuthOutcome(input: {
  token_kind?: string;
  message?: string;
}): "login" | "register" | "unknown" {
  const kind = (input.token_kind || "").toLowerCase();
  if (kind === "session") return "login";
  if (kind === "register") return "register";

  const msg = (input.message || "").toLowerCase();
  if (msg.includes("authenticated")) return "login";
  if (msg.includes("oauth verified") || msg.includes("verified")) {
    return "register";
  }
  return "unknown";
}

export function randomAccountPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
