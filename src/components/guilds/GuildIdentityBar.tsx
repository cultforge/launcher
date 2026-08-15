import { getGuild } from "../../data/guilds";
import {
  capabilitiesForRole,
  membershipForUser,
} from "../../lib/guildPermissions";
import { useGuildModalsStore } from "../../stores/guildModals";
import { useGuildStore } from "../../stores/guilds";
import { useAppStore } from "../../userstore";
import { GuildSwitcher } from "./GuildSwitcher";

export function GuildIdentityBar() {
  const guildId = useGuildStore((state) => state.activeGuildId);
  const setHubTab = useGuildStore((state) => state.setHubTab);
  const members = useGuildStore((state) => state.members);
  const userId = useAppStore((state) => state.currentUser?.id ?? "");
  const open = useGuildModalsStore((state) => state.open);
  const guild = getGuild(guildId);
  const membership = membershipForUser(members, guildId, userId);
  const capabilities = capabilitiesForRole(membership?.role);

  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-white/8 bg-black/35 px-1">
      <div className="min-w-0 flex-1">
        <GuildSwitcher embedded />
      </div>
      <div className="hidden min-w-0 shrink sm:block">
        <div className="truncate font-sora text-[13px] font-bold text-text-primary">
          {guild ? (
            <>
              {guild.name}{" "}
              <span className="font-normal text-text-muted">[{guild.tag}]</span>
            </>
          ) : (
            "No guild selected"
          )}
        </div>
        <div className="text-[9px] uppercase tracking-wider text-text-muted">
          {membership?.role ?? "Guest"}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {capabilities.inviteMembers && (
          <button
            type="button"
            onClick={() => open("invite")}
            className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[10px] text-text-secondary cursor-pointer"
          >
            Invite
          </button>
        )}
        {capabilities.openManagement && (
          <button
            type="button"
            onClick={() => setHubTab("Manage")}
            className="cf-btn-primary rounded-lg px-2.5 py-1.5 text-[10px] font-semibold cursor-pointer"
          >
            Manage
          </button>
        )}
      </div>
    </div>
  );
}
