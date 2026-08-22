import { getGuild } from "../../data/guilds";
import {
  capabilitiesForRole,
  membershipForUser,
} from "../../lib/guildPermissions";
import { useGuildModalsStore } from "../../stores/guildModals";
import { useGuildStore } from "../../stores/guilds";
import { useAppStore } from "../../userstore";
import { GuildIcon } from "../GuildIcon";

export function GuildIdentityBar() {
  const guildId = useGuildStore((state) => state.activeGuildId);
  const setHubTab = useGuildStore((state) => state.setHubTab);
  const members = useGuildStore((state) => state.members);
  const userId = useAppStore((state) => state.currentUser?.id ?? "");
  const open = useGuildModalsStore((state) => state.open);
  const guild = getGuild(guildId);
  const membership = membershipForUser(members, guildId, userId);
  const capabilities = capabilitiesForRole(membership?.role);

  if (!guild) return null;

  return (
    <div className="cf-guild-identity">
      <GuildIcon
        src={guild.icon}
        name={guild.name}
        className={`h-10 w-10 shrink-0 rounded-xl bg-linear-to-br text-bg-app text-[11px] ring-1 ring-white/15 ${guild.accent}`}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate font-sora text-[15px] font-bold text-text-primary">
          {guild.name}
          <span className="ml-1.5 font-normal text-text-muted">[{guild.tag}]</span>
        </div>
        <p className="text-[11px] text-text-muted">
          {membership?.role ?? "Member"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {capabilities.inviteMembers && (
          <button
            type="button"
            onClick={() => open("invite")}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-medium text-text-secondary cursor-pointer hover:bg-white/4"
          >
            Invite
          </button>
        )}
        {capabilities.openManagement && (
          <button
            type="button"
            onClick={() => setHubTab("Manage")}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-medium text-text-secondary cursor-pointer hover:bg-white/4"
          >
            Settings
          </button>
        )}
      </div>
    </div>
  );
}
