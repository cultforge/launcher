import type { GuildMember, GuildRole } from "../data/guilds";

/** Guild role permission ids for Minecraft server lifecycle / control. */
export const SERVER_CONTROL_PERMISSION_IDS = [
  "server.start",
  "server.stop",
  "server.restart",
  "server.status",
  "server.console.read",
  "server.console.execute",
  "server.config.read",
  "server.config.update",
  "builds.provision",
  "backup.create",
] as const;

export type ServerControlPermissionId =
  (typeof SERVER_CONTROL_PERMISSION_IDS)[number];

export const SERVER_CONTROL_PERMISSION_CATALOG: {
  id: ServerControlPermissionId;
  group: string;
  description: string;
}[] = [
  {
    id: "server.start",
    group: "servers",
    description: "Start a guild Minecraft server",
  },
  {
    id: "server.stop",
    group: "servers",
    description: "Stop a running guild Minecraft server",
  },
  {
    id: "server.restart",
    group: "servers",
    description: "Restart a guild Minecraft server",
  },
  {
    id: "server.status",
    group: "servers",
    description: "Read server run status from the host PC",
  },
  {
    id: "server.console.read",
    group: "servers",
    description: "Read the live server console / log",
  },
  {
    id: "server.console.execute",
    group: "servers",
    description: "Run console commands on the server",
  },
  {
    id: "server.config.read",
    group: "servers",
    description: "Read server.properties",
  },
  {
    id: "server.config.update",
    group: "servers",
    description: "Edit and save server.properties",
  },
  {
    id: "builds.provision",
    group: "servers",
    description: "Install or provision a build onto a host PC",
  },
  {
    id: "backup.create",
    group: "servers",
    description: "Create a server backup on the host PC",
  },
];

/** True when the viewer may run a specific server control action. */
export function canServerControlAction(
  action: string,
  opts: {
    /** Personal / non-guild host — always allowed for the signed-in owner UI. */
    guildScoped?: boolean;
    permissions?: string[] | null;
    isOwner?: boolean;
    role?: GuildRole | null;
  },
): boolean {
  if (!opts.guildScoped) return true;
  if (opts.isOwner || opts.role === "Leader") return true;
  const perms = opts.permissions ?? [];
  if (perms.includes("guild.edit")) return true;
  return perms.includes(action);
}

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

/** Guild owner, Leader, or explicit `build.publish_public` permission. */
export function canPublishPublicCatalog(opts: {
  role?: GuildRole | null;
  permissions?: string[];
  isOwner?: boolean;
}): boolean {
  if (opts.isOwner || opts.role === "Leader") return true;
  return (opts.permissions ?? []).includes("build.publish_public");
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
