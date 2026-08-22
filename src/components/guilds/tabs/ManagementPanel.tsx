import {
  capabilitiesForRole,
  membershipForUser,
} from "../../../lib/guildPermissions";
import { getGuild } from "../../../data/guilds";
import { useGuildModalsStore } from "../../../stores/guildModals";
import {
  useGuildStore,
  type ManageSectionId,
} from "../../../stores/guilds";
import { useAppStore } from "../../../userstore";
import { Icon } from "../../ico";
import { AppIcons } from "../../icons";
import { GuildIcon } from "../../GuildIcon";
import { ManageBuilds } from "../manage/ManageBuilds";
import { ManageBranding } from "../manage/ManageBranding";
import { ManageDiscord } from "../manage/ManageDiscord";
import { ManageEvents } from "../manage/ManageEvents";
import { ManageNews } from "../manage/ManageNews";
import { ManageOverview } from "../manage/ManageOverview";
import { ManagePlaceHeader } from "../manage/ManagePlaceHeader";
import { ManageRankings } from "../manage/ManageRankings";
import { ManageRoster } from "../manage/ManageRoster";
import { ManageServers } from "../manage/ManageServers";
import { ManageForms } from "../manage/ManageForms";
import { ManageHotfixes } from "../manage/ManageHotfixes";

function ManageSectionBody({ section }: { section: ManageSectionId }) {
  if (section === "branding") return <ManageBranding />;
  if (section === "events") return <ManageEvents />;
  if (section === "news") return <ManageNews />;
  if (section === "rankings") return <ManageRankings />;
  if (section === "servers") return <ManageServers />;
  if (section === "builds") return <ManageBuilds />;
  if (section === "forms") return <ManageForms />;
  if (section === "hotfixes") return <ManageHotfixes />;
  if (section === "discord") return <ManageDiscord />;
  if (section === "roster") return <ManageRoster />;
  return null;
}

export function ManagementPanel() {
  const guildId = useGuildStore((state) => state.activeGuildId);
  const members = useGuildStore((state) => state.members);
  const section = useGuildStore((state) => state.manageSection);
  const setSection = useGuildStore((state) => state.setManageSection);
  const setHubTab = useGuildStore((state) => state.setHubTab);
  const userId = useAppStore((state) => state.currentUser?.id ?? "");
  const open = useGuildModalsStore((state) => state.open);
  const membership = membershipForUser(members, guildId, userId);
  const capabilities = capabilitiesForRole(membership?.role);
  const guild = getGuild(guildId);
  const isHome = section === "overview";

  if (!guild) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center p-8">
        <p className="text-[14px] text-text-muted">No guild selected.</p>
      </div>
    );
  }

  if (!capabilities.openManagement) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <h3 className="font-sora text-[18px] font-bold text-text-primary">
            Officers only
          </h3>
          <p className="mt-2 text-[13px] leading-relaxed text-text-muted">
            Guild settings are available to officers and leaders.
          </p>
          <button
            type="button"
            onClick={() => setHubTab("Overview")}
            className="cf-btn-primary mt-5 cursor-pointer rounded-lg px-4 py-2.5 text-[12px] font-semibold"
          >
            Back to guild
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="guild-manage flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl">
      <header className="guild-manage-topbar shrink-0">
        <div className="flex min-w-0 items-center gap-3">
          <GuildIcon
            src={guild.icon}
            name={guild.name}
            className={`h-10 w-10 shrink-0 rounded-xl bg-linear-to-br text-bg-app text-[11px] ${guild.accent}`}
          />
          <div className="min-w-0">
            <p className="truncate font-sora text-[15px] font-bold text-text-primary">
              {guild.name}
            </p>
            <p className="text-[12px] text-text-muted">Guild settings</p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setHubTab("Overview")}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[12px] font-medium text-text-secondary transition-colors hover:bg-white/4"
          >
            <Icon icon={AppIcons.ChevronLeft} size={14} />
            Guild home
          </button>
          {capabilities.inviteMembers ? (
            <button
              type="button"
              onClick={() => open("invite")}
              className="cf-btn-primary cursor-pointer rounded-lg px-4 py-2 text-[12px] font-semibold"
            >
              Invite
            </button>
          ) : null}
          {capabilities.transferLeadership ? (
            <button
              type="button"
              onClick={() => open("transfer")}
              className="rounded-lg border border-white/10 px-3 py-2 text-[12px] text-text-secondary cursor-pointer transition-colors hover:bg-white/4"
            >
              Transfer
            </button>
          ) : null}
        </div>
      </header>

      <main className="guild-manage-body min-h-0 flex-1 overflow-y-auto scroll-hidden">
        {isHome ? (
          <ManageOverview onJump={setSection} />
        ) : (
          <div className="flex max-w-3xl flex-col gap-6">
            <ManagePlaceHeader section={section} />
            <div className="guild-manage-section-content">
              <ManageSectionBody section={section} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
