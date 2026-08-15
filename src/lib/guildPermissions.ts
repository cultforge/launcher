import type { GuildMember, GuildRole } from "../data/guilds";

export type GuildCapabilities = {
  inviteMembers: boolean;
  manageMembers: boolean;
  changeRoles: boolean;
  manageEvents: boolean;
  manageNews: boolean;
  manageDiscord: boolean;
  manageRankings: boolean;
  manageServers: boolean;
  manageBuilds: boolean;
  leaveGuild: boolean;
  transferLeadership: boolean;
  openManagement: boolean;
};

const NONE: GuildCapabilities = {
  inviteMembers: false,
  manageMembers: false,
  changeRoles: false,
  manageEvents: false,
  manageNews: false,
  manageDiscord: false,
  manageRankings: false,
  manageServers: false,
  manageBuilds: false,
  leaveGuild: false,
  transferLeadership: false,
  openManagement: false,
};

export function capabilitiesForRole(
  role: GuildRole | null | undefined,
): GuildCapabilities {
  if (!role) return NONE;
  if (role === "Leader") {
    return {
      inviteMembers: true,
      manageMembers: true,
      changeRoles: true,
      manageEvents: true,
      manageNews: true,
      manageDiscord: true,
      manageRankings: true,
      manageServers: true,
      manageBuilds: true,
      leaveGuild: false,
      transferLeadership: true,
      openManagement: true,
    };
  }
  if (role === "Officer") {
    return {
      inviteMembers: true,
      manageMembers: true,
      changeRoles: false,
      manageEvents: true,
      manageNews: true,
      manageDiscord: true,
      manageRankings: true,
      manageServers: true,
      manageBuilds: true,
      leaveGuild: true,
      transferLeadership: false,
      openManagement: true,
    };
  }
  return { ...NONE, leaveGuild: true };
}

/**
 * Map CultForge guild viewer authority onto the launcher Leader/Officer/Member
 * ranks. Co-admins (GuildMaster / guild.edit) share Leader powers with the owner.
 */
export function roleFromViewer(opts: {
  isOwner?: boolean;
  permissions?: string[];
  roles?: string[];
  manageEnabled?: boolean;
}): GuildRole {
  if (opts.isOwner) return "Leader";
  const perms = opts.permissions ?? [];
  const roles = (opts.roles ?? []).map((r) => r.toLowerCase());
  const hasEdit = perms.includes("guild.edit");
  const isMaster = roles.some(
    (r) =>
      r === "guildmaster" ||
      r === "guild master" ||
      r === "admin" ||
      r === "co-admin" ||
      r === "coadmin",
  );
  const isOfficer = roles.some((r) => {
    const n = r.replace(/[\s_-]+/g, "");
    return (
      n === "officer" ||
      n === "warden" ||
      n === "moderator" ||
      n === "mod" ||
      n === "sentinel"
    );
  });
  if (isMaster) return "Leader";
  // Named officer beats guild.edit so Set Officer doesn't look like Leader.
  if (isOfficer) return "Officer";
  // Co-admins are peer admins — same Manage surface as the owner.
  if (opts.manageEnabled || hasEdit) return "Leader";
  return "Member";
}

export function membershipForUser(
  members: GuildMember[],
  guildId: string,
  userId: string,
) {
  return members.find(
    (member) => member.guildId === guildId && member.userId === userId,
  );
}

/**
 * Resolve launcher Leader/Officer/Member for a chat author.
 * Matches by CultForge user id or guild member id, and treats guild owner as Leader.
 */
export function resolveGuildChatRole(opts: {
  guildId: string;
  authorId?: string | null;
  members: GuildMember[];
  ownerId?: string | null;
}): GuildRole {
  const authorId = (opts.authorId ?? "").trim();
  if (!authorId) return "Member";

  if (opts.ownerId && opts.ownerId === authorId) return "Leader";

  const byUser = opts.members.find(
    (m) => m.guildId === opts.guildId && m.userId === authorId,
  );
  if (byUser) return byUser.role;

  const byMemberId = opts.members.find(
    (m) => m.guildId === opts.guildId && m.id === authorId,
  );
  if (byMemberId) return byMemberId.role;

  return "Member";
}

export function canManageMember(
  actor: GuildMember | undefined,
  target: GuildMember | undefined,
) {
  if (!actor || !target || actor.guildId !== target.guildId) return false;
  if (actor.userId === target.userId || target.role === "Leader") return false;
  if (actor.role === "Leader") return true;
  return actor.role === "Officer" && target.role === "Member";
}
