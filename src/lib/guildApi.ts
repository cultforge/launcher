import { ClientHttpError, send, sendMutate } from "./client";
import type { Guild, GuildMember, GuildRole } from "../data/guilds";
import { getGuild } from "../data/guilds";
import { roleFromViewer } from "./guildPermissions";
import { parseDiscordGuildSource } from "./discordWidget";
import {
  CacheKeys,
  cachedRead,
  invalidateApiCache,
  invalidateGuildCaches,
} from "./apiCache";

export class GuildApiError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "GuildApiError";
    this.status = status;
  }
}

function wrap(prefix: string, err: unknown): GuildApiError {
  if (err instanceof ClientHttpError) {
    return new GuildApiError(`${prefix}: ${err.message}`, err.status);
  }
  if (err instanceof GuildApiError) return err;
  return new GuildApiError(
    `${prefix}: ${err instanceof Error ? err.message : String(err)}`,
  );
}

function asRecord(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : null;
}

/** CultForge guild responses often wrap payloads as `{ status, manifest|data }`. */
function unwrapPayload(data: unknown, keys: string[]): unknown {
  const obj = asRecord(data);
  if (!obj) return data;
  for (const key of keys) {
    if (obj[key] !== undefined) return obj[key];
  }
  return data;
}

export type GuildManifestCard = {
  id: string;
  name: string;
  icon_url?: string | null;
  banner_url?: string | null;
  member_count?: number;
  is_owner?: boolean;
  can_manage?: boolean;
};

export type GuildUiViewer = {
  user_id: string;
  member_id: string;
  nickname?: string | null;
  is_owner?: boolean;
  permissions?: string[];
  roles?: string[];
};

export type GuildUiModule = {
  id: string;
  enabled?: boolean;
  label?: string | null;
  requires?: string[];
};

export type GuildUiManifest = {
  schema_version?: number;
  guild: {
    id: string;
    name: string;
    description?: string | null;
    branding?: {
      icon_url?: string | null;
      banner_url?: string | null;
    };
    owner_id: string;
    created_at?: string;
    member_count?: number;
  };
  viewer: GuildUiViewer;
  modules?: GuildUiModule[];
  news?: unknown[];
  events?: unknown[];
  discord?: { source?: string } | null;
};

const ACCENTS = [
  "from-primary-dvivd to-primary-muted",
  "from-primary-muted to-primary-base",
  "from-primary-dvivd to-primary-soft",
];

function tagFromName(name: string): string {
  const letters = name.replace(/[^a-zA-Z0-9]/g, "");
  return (letters.slice(0, 2) || "CF").toUpperCase();
}

export function guildFromCard(
  card: GuildManifestCard,
  index = 0,
): Guild {
  const existing = getGuild(card.id);
  return {
    id: card.id,
    name: card.name,
    tag: tagFromName(card.name),
    level: 1,
    xp: 0,
    xpMax: 100,
    memberCount: card.member_count ?? 0,
    motto: card.is_owner
      ? "You own this guild"
      : card.can_manage
        ? "You help manage this guild"
        : "",
    accent: ACCENTS[index % ACCENTS.length],
    icon: card.icon_url ?? null,
    banner:
      card.banner_url ||
      "linear-gradient(135deg,#1a1528_0%,#2d3a5c_35%,#1e2838_70%,#0f141c_100%)",
    joined: true,
    // Cards don't include owner id; keep any previously known value.
    ownerId: existing?.ownerId,
  };
}

export function guildFromManifest(
  manifest: GuildUiManifest,
  index = 0,
): Guild {
  const g = manifest.guild;
  return {
    id: g.id,
    name: g.name,
    tag: tagFromName(g.name),
    level: 1,
    xp: 0,
    xpMax: 100,
    memberCount: g.member_count ?? 0,
    motto: g.description?.trim() || "",
    accent: ACCENTS[index % ACCENTS.length],
    icon: g.branding?.icon_url ?? null,
    banner:
      g.branding?.banner_url ||
      "linear-gradient(135deg,#1a1528_0%,#2d3a5c_35%,#1e2838_70%,#0f141c_100%)",
    joined: true,
    ownerId: g.owner_id,
    discordSource:
      typeof manifest.discord?.source === "string"
        ? manifest.discord.source
        : undefined,
  };
}

export function moduleManageEnabled(manifest: GuildUiManifest): boolean {
  const mod = (manifest.modules ?? []).find((m) => m.id === "manage");
  if (typeof mod?.enabled === "boolean") return mod.enabled;
  const perms = manifest.viewer.permissions ?? [];
  return Boolean(manifest.viewer.is_owner || perms.includes("guild.edit"));
}

export function membershipFromViewer(
  manifest: GuildUiManifest,
  displayName: string,
): GuildMember {
  const viewer = manifest.viewer;
  const role: GuildRole = roleFromViewer({
    isOwner: Boolean(viewer.is_owner),
    permissions: viewer.permissions ?? [],
    roles: viewer.roles ?? [],
    manageEnabled: moduleManageEnabled(manifest),
  });
  return {
    id: viewer.member_id,
    userId: viewer.user_id,
    guildId: manifest.guild.id,
    name: viewer.nickname?.trim() || displayName || "You",
    role,
    status: "online",
    contribution: 0,
  };
}

function asCardList(data: unknown): GuildManifestCard[] {
  const unwrapped = unwrapPayload(data, [
    "data",
    "items",
    "guilds",
    "manifests",
    "cards",
  ]);
  if (Array.isArray(unwrapped)) return unwrapped as GuildManifestCard[];
  if (Array.isArray(data)) return data as GuildManifestCard[];
  return [];
}

export type GuildMemberApiRecord = {
  id: string;
  user_id: string;
  guild_id: string;
  nickname?: string | null;
  computed_permissions?: string[];
  roles?: string[];
  joined_at?: string;
  user?: {
    user_id?: string;
    username?: string;
    handle_name?: string;
    avatar_url?: string | null;
  } | null;
};

function asMemberList(data: unknown): GuildMemberApiRecord[] {
  const unwrapped = unwrapPayload(data, ["data", "items", "members"]);
  if (Array.isArray(unwrapped)) return unwrapped as GuildMemberApiRecord[];
  if (Array.isArray(data)) return data as GuildMemberApiRecord[];
  return [];
}

export function membershipFromApiRecord(
  record: GuildMemberApiRecord,
  ownerId: string | null | undefined,
): GuildMember {
  const perms = record.computed_permissions ?? [];
  const roleNames = Array.isArray(record.roles)
    ? record.roles.map(String)
    : [];
  const isOwner = Boolean(ownerId && record.user_id === ownerId);
  const role: GuildRole = roleFromViewer({
    isOwner,
    permissions: perms,
    roles:
      roleNames.length > 0
        ? roleNames
        : perms.includes("guild.edit")
          ? ["GuildMaster"]
          : [],
    manageEnabled:
      isOwner || perms.includes("guild.edit"),
  });
  const name =
    record.nickname?.trim() ||
    record.user?.handle_name?.trim() ||
    record.user?.username?.trim() ||
    record.user_id;
  return {
    id: record.id,
    userId: record.user_id,
    guildId: record.guild_id,
    name,
    role,
    status: "online",
    contribution: 0,
  };
}

/** GET /v1/guilds/me/manifest — switcher cards for the signed-in user. */
export async function fetchMyGuildManifestCards(): Promise<GuildManifestCard[]> {
  try {
    const { data } = await cachedRead({
      key: CacheKeys.guildCards,
      fetcher: async () => {
        const raw = await send<unknown>("guilds", "list_my_guild_manifests");
        return asCardList(raw);
      },
    });
    return data;
  } catch (err) {
    throw wrap("Could not list your guilds", err);
  }
}

/** GET /v1/guilds/{guild_id}/manifest — viewer permissions + modules. */
export async function fetchGuildManifest(
  guildId: string,
): Promise<GuildUiManifest> {
  try {
    const { data } = await cachedRead({
      key: CacheKeys.guildManifest(guildId),
      fetcher: async () => {
        const raw = await send<unknown>("guilds", "get_guild_manifest", {
          guild_id: guildId,
        });
        const payload = unwrapPayload(raw, ["manifest", "data"]);
        const obj = asRecord(payload);
        if (!obj || !asRecord(obj.guild) || !asRecord(obj.viewer)) {
          throw new GuildApiError("Guild manifest response was malformed", 502);
        }
        return payload as GuildUiManifest;
      },
    });
    return data;
  } catch (err) {
    throw wrap("Could not load guild manifest", err);
  }
}

/** GET /v1/guilds/{guild_id}/members — full roster for the Members panel. */
export async function fetchGuildMembers(
  guildId: string,
): Promise<GuildMemberApiRecord[]> {
  try {
    const { data } = await cachedRead({
      key: CacheKeys.guildMembers(guildId),
      fetcher: async () => {
        const raw = await send<unknown>("guilds", "list_guild_members", {
          guild_id: guildId,
        });
        return asMemberList(raw);
      },
    });
    return data;
  } catch (err) {
    throw wrap("Could not list guild members", err);
  }
}

/** PATCH /v1/guilds/{guild_id} — persist Discord widget source on the guild. */
export async function updateGuildDiscordSource(
  guildId: string,
  source: string,
): Promise<void> {
  const trimmed = source.trim();
  if (trimmed) {
    const parsed = parseDiscordGuildSource(trimmed);
    if (!parsed.ok) {
      throw new GuildApiError(parsed.error, 400);
    }
  }
  try {
    await sendMutate(
      "guilds",
      "update_guild",
      {
        guild_id: guildId,
        discord_widget_source: trimmed,
      },
      "PATCH",
    );
    await invalidateGuildCaches(guildId);
  } catch (err) {
    throw wrap("Could not save Discord widget source", err);
  }
}

/** POST /v1/guilds/{guild_id}/leave — live leave (never cached). */
export async function leaveGuildRemote(guildId: string): Promise<void> {
  try {
    await sendMutate(
      "guilds",
      "leave_guild",
      { guild_id: guildId },
      "POST",
    );
    await invalidateGuildCaches(guildId);
  } catch (err) {
    throw wrap("Could not leave guild", err);
  }
}

export type GuildCreateEligibility = {
  canCreate: boolean;
  hasGithub: boolean;
  alreadyOwnsGuild: boolean;
  message: string;
};

/** GET /v1/guilds/create — GitHub linked + not already a guild admin. */
export async function checkGuildCreateEligibility(): Promise<GuildCreateEligibility> {
  try {
    const raw = await send<unknown>("guilds", "check_guild_create_eligibility");
    const obj = asRecord(raw) ?? {};
    const canCreate = Boolean(obj.can_create);
    const hasGithub = Boolean(obj.has_github);
    const alreadyOwnsGuild = Boolean(obj.already_owns_guild);
    const message =
      typeof obj.message === "string" && obj.message.trim()
        ? obj.message.trim()
        : canCreate
          ? "You can create a guild."
          : "Cannot create guild: GitHub required and you must not already own a guild.";
    return { canCreate, hasGithub, alreadyOwnsGuild, message };
  } catch (err) {
    throw wrap("Could not check guild create eligibility", err);
  }
}

export type CreatedGuild = {
  id: string;
  name: string;
  description?: string | null;
};

/** POST /v1/guilds — create a guild (caller must pass eligibility). */
export async function createGuild(input: {
  name: string;
  description?: string;
  iconUrl?: string;
  bannerUrl?: string;
}): Promise<CreatedGuild> {
  const name = input.name.trim();
  if (name.length < 3) {
    throw new GuildApiError("Guild name must be at least 3 characters.", 400);
  }
  if (name.length > 100) {
    throw new GuildApiError("Guild name must be at most 100 characters.", 400);
  }
  try {
    const raw = await sendMutate(
      "guilds",
      "create_guild",
      {
        name,
        description: input.description?.trim() || null,
        icon_url: input.iconUrl?.trim() || null,
        banner_url: input.bannerUrl?.trim() || null,
      },
      "POST",
    );
    await invalidateGuildCaches();
    const payload = unwrapPayload(raw, ["data", "guild"]);
    const obj = asRecord(payload);
    const id = String(obj?.id ?? "").trim();
    const createdName = String(obj?.name ?? name).trim() || name;
    if (!id) {
      throw new GuildApiError("Create guild response was malformed", 502);
    }
    return {
      id,
      name: createdName,
      description:
        typeof obj?.description === "string" ? obj.description : null,
    };
  } catch (err) {
    throw wrap("Could not create guild", err);
  }
}

export type CreatedGuildInvite = {
  code: string;
  guild_id: string;
  invite_url: string;
  is_global: boolean;
  max_uses?: number | null;
  expires_at?: string | null;
};

/** POST /v1/guilds/{guild_id}/invites via invite.cultforge.com. */
export async function createGuildInvite(
  guildId: string,
  opts?: {
    isGlobal?: boolean;
    allowedUserIds?: string[];
    expiresInHours?: number;
    maxUses?: number;
  },
): Promise<CreatedGuildInvite> {
  const isGlobal = opts?.isGlobal ?? !opts?.allowedUserIds?.length;
  const body: Record<string, unknown> = {
    guild_id: guildId,
    is_global: isGlobal,
  };
  if (!isGlobal && opts?.allowedUserIds?.length) {
    body.allowed_user_ids = opts.allowedUserIds;
  }
  if (typeof opts?.expiresInHours === "number") {
    body.expires_in_hours = opts.expiresInHours;
  }
  if (isGlobal && typeof opts?.maxUses === "number") {
    body.max_uses = opts.maxUses;
  }
  try {
    const data = await sendMutate<unknown>(
      "invite",
      "create_guild_invite",
      body,
      "POST",
    );
    await invalidateGuildCaches(guildId);
    const payload = unwrapPayload(data, ["data"]);
    const obj = asRecord(payload);
    if (!obj || typeof obj.code !== "string") {
      throw new GuildApiError("Invite create response was malformed", 502);
    }
    const code = obj.code;
    return {
      code,
      guild_id: String(obj.guild_id ?? guildId),
      invite_url:
        typeof obj.invite_url === "string" && obj.invite_url
          ? obj.invite_url
          : `https://invite.cultforge.com/${code}`,
      is_global: Boolean(obj.is_global ?? isGlobal),
      max_uses:
        typeof obj.max_uses === "number" ? obj.max_uses : null,
      expires_at:
        typeof obj.expires_at === "string" ? obj.expires_at : null,
    };
  } catch (err) {
    throw wrap("Could not create guild invite", err);
  }
}

export type GuildRoleRecord = {
  id: string;
  guild_id: string;
  name: string;
  color_hex?: string | null;
  rank: number;
  permissions: string[];
};

function asRoleRecord(data: unknown): GuildRoleRecord | null {
  const obj = asRecord(unwrapPayload(data, ["data", "role"])) ?? asRecord(data);
  if (!obj || typeof obj.id !== "string" || typeof obj.name !== "string") {
    return null;
  }
  return {
    id: obj.id,
    guild_id: String(obj.guild_id ?? ""),
    name: obj.name,
    color_hex: typeof obj.color_hex === "string" ? obj.color_hex : null,
    rank: typeof obj.rank === "number" ? obj.rank : 0,
    permissions: Array.isArray(obj.permissions)
      ? obj.permissions.map(String)
      : [],
  };
}

function asRoleList(data: unknown): GuildRoleRecord[] {
  const unwrapped = unwrapPayload(data, ["data", "items", "roles"]);
  const rows = Array.isArray(unwrapped)
    ? unwrapped
    : Array.isArray(data)
      ? data
      : [];
  return rows
    .map((row) => asRoleRecord(row))
    .filter((row): row is GuildRoleRecord => Boolean(row));
}

function normalizeRoleName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export function isOfficerRoleName(name: string): boolean {
  const n = normalizeRoleName(name);
  return (
    n === "officer" ||
    n === "warden" ||
    n === "moderator" ||
    n === "mod" ||
    n === "sentinel"
  );
}

export async function fetchGuildRoles(
  guildId: string,
): Promise<GuildRoleRecord[]> {
  try {
    const { data } = await cachedRead({
      key: CacheKeys.guildRoles(guildId),
      fetcher: async () => {
        const raw = await send<unknown>("guilds", "list_guild_roles", {
          guild_id: guildId,
        });
        return asRoleList(raw);
      },
    });
    return data;
  } catch (err) {
    throw wrap("Could not list guild roles", err);
  }
}

export async function createGuildRole(
  guildId: string,
  input: {
    name: string;
    colorHex?: string;
    permissions?: string[];
    rank?: number;
  },
): Promise<GuildRoleRecord> {
  try {
    const data = await sendMutate(
      "guilds",
      "create_guild_role",
      {
        guild_id: guildId,
        name: input.name,
        color_hex: input.colorHex,
        permissions: input.permissions ?? [],
        rank: input.rank ?? 50,
      },
      "POST",
    );
    await invalidateApiCache(CacheKeys.guildRoles(guildId));
    const created = asRoleRecord(data);
    if (!created) {
      throw new GuildApiError("Create role response was malformed", 502);
    }
    return created;
  } catch (err) {
    throw wrap("Could not create guild role", err);
  }
}

export async function assignGuildRole(
  guildId: string,
  targetUserId: string,
  roleId: string,
): Promise<void> {
  try {
    await sendMutate(
      "guilds",
      "assign_role_to_member",
      {
        guild_id: guildId,
        target_user_id: targetUserId,
        role_id: roleId,
      },
      "POST",
    );
    await invalidateApiCache(CacheKeys.guildMembers(guildId));
  } catch (err) {
    throw wrap("Could not assign role", err);
  }
}

export async function revokeGuildRole(
  guildId: string,
  targetUserId: string,
  roleId: string,
): Promise<void> {
  try {
    await sendMutate(
      "guilds",
      "revoke_role_from_member",
      {
        guild_id: guildId,
        target_user_id: targetUserId,
        role_id: roleId,
      },
      "DELETE",
    );
    await invalidateApiCache(CacheKeys.guildMembers(guildId));
  } catch (err) {
    throw wrap("Could not revoke role", err);
  }
}

async function ensureOfficerRole(
  guildId: string,
  roles: GuildRoleRecord[],
): Promise<GuildRoleRecord> {
  const existing = roles.find((role) => isOfficerRoleName(role.name));
  if (existing) return existing;
  return createGuildRole(guildId, {
    name: "Officer",
    colorHex: "#3D8BFF",
    rank: 50,
    permissions: ["invites.create", "members.manage", "messages.send"],
  });
}

/** Map launcher Officer/Member onto CultForge role assign/revoke. */
export async function setGuildMemberLauncherRole(
  guildId: string,
  targetUserId: string,
  role: Exclude<GuildRole, "Leader">,
): Promise<void> {
  const catalog = await fetchGuildRoles(guildId);
  if (role === "Officer") {
    const officer = await ensureOfficerRole(guildId, catalog);
    await assignGuildRole(guildId, targetUserId, officer.id);
    return;
  }
  const officerRoles = catalog.filter((item) => isOfficerRoleName(item.name));
  for (const item of officerRoles) {
    await revokeGuildRole(guildId, targetUserId, item.id);
  }
}

export async function refreshGuildMembers(
  guildId: string,
  ownerId?: string | null,
): Promise<GuildMember[]> {
  await invalidateApiCache(CacheKeys.guildMembers(guildId));
  const remote = await fetchGuildMembers(guildId);
  return remote.map((row) => membershipFromApiRecord(row, ownerId));
}

/** DELETE /v1/guilds/{guild_id}/members/{target_user_id} — may 404 if live API omits kick. */
export async function kickGuildMember(
  guildId: string,
  targetUserId: string,
): Promise<void> {
  try {
    await sendMutate(
      "guilds",
      "kick_guild_member",
      {
        guild_id: guildId,
        target_user_id: targetUserId,
      },
      "DELETE",
    );
    await invalidateApiCache(CacheKeys.guildMembers(guildId));
    await invalidateGuildCaches(guildId);
  } catch (err) {
    const status = err instanceof ClientHttpError ? err.status : 0;
    const message = err instanceof Error ? err.message : String(err);
    const missing =
      status === 404 ||
      status === 405 ||
      /not found|method not allowed|command .* not found/i.test(message);
    if (missing) {
      throw new GuildApiError(
        "CultForge does not expose member kick yet. Role changes still persist.",
        status || 404,
      );
    }
    throw wrap("Could not remove member", err);
  }
}
