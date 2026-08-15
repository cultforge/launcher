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
import { GuildSwitcher } from "../GuildSwitcher";
import { ManageBuilds } from "../manage/ManageBuilds";
import { ManageDiscord } from "../manage/ManageDiscord";
import { ManageEvents } from "../manage/ManageEvents";
import { ManageNews } from "../manage/ManageNews";
import { ManageOverview } from "../manage/ManageOverview";
import { ManageRankings } from "../manage/ManageRankings";
import { ManageRoster } from "../manage/ManageRoster";
import { ManageServers } from "../manage/ManageServers";
import { ManageForms } from "../manage/ManageForms";
import { ManageHotfixes } from "../manage/ManageHotfixes";

const SECTIONS: { id: ManageSectionId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "events", label: "Events" },
  { id: "news", label: "News" },
  { id: "rankings", label: "Rankings" },
  { id: "servers", label: "Servers" },
  { id: "builds", label: "Builds" },
  { id: "forms", label: "Forms" },
  { id: "hotfixes", label: "Hotfixes" },
  { id: "discord", label: "Discord" },
  { id: "roster", label: "Roster & audit" },
];

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

  if (!guild) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <div className="cf-panel max-w-md rounded-xl p-8 text-center text-[13px] text-text-muted">
          No guild selected.
        </div>
      </div>
    );
  }

  if (!capabilities.openManagement) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <div className="cf-panel max-w-md rounded-xl p-8 text-center">
          <h3 className="text-[14px] font-semibold text-text-primary">
            Member access
          </h3>
          <p className="mt-2 text-[10px] text-text-muted">
            Your {membership?.role ?? "guest"} role can browse, chat, RSVP, and
            join servers. Management tools require Officer or Leader authority.
          </p>
          <button
            type="button"
            onClick={() => setHubTab("Overview")}
            className="cf-btn-primary mt-4 rounded-lg px-3 py-2 text-[10px] font-semibold cursor-pointer"
          >
            Back to Overview
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/10 bg-black/40 px-1 py-2.5">
        <div className="min-w-0 flex-1 basis-50">
          <GuildSwitcher embedded />
        </div>
        <div className="min-w-0 shrink">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-primary-base">
            {membership?.role} · Console
          </div>
          <div className="truncate font-sora text-[15px] font-bold text-text-primary">
            {guild.name}{" "}
            <span className="font-normal text-text-muted">[{guild.tag}]</span>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setHubTab("Overview")}
            className="rounded-lg border border-border-subtle px-3 py-1.5 text-[10px] text-text-secondary cursor-pointer"
          >
            Back to Overview
          </button>
          {capabilities.inviteMembers && (
            <button
              type="button"
              onClick={() => open("invite")}
              className="cf-btn-primary rounded-lg px-3 py-1.5 text-[10px] font-semibold cursor-pointer"
            >
              Invite
            </button>
          )}
          {capabilities.transferLeadership && (
            <button
              type="button"
              onClick={() => open("transfer")}
              className="rounded-lg border border-border-subtle px-3 py-1.5 text-[10px] text-text-secondary cursor-pointer"
            >
              Transfer
            </button>
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav className="flex shrink-0 flex-row gap-1 overflow-x-auto border-b border-white/8 py-2 lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r lg:border-white/8 lg:py-3 lg:pr-2">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={`shrink-0 rounded-lg px-3 py-2.5 text-left text-[11px] font-medium cursor-pointer ${
                section === item.id
                  ? "bg-primary-base/14 text-primary-base"
                  : "text-text-muted hover:bg-white/4 hover:text-text-secondary"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <main className="min-h-0 min-w-0 overflow-y-auto scroll-hidden py-3 lg:pl-4">
          {section === "overview" && (
            <ManageOverview onJump={setSection} />
          )}
          {section === "events" && <ManageEvents />}
          {section === "news" && <ManageNews />}
          {section === "rankings" && <ManageRankings />}
          {section === "servers" && <ManageServers />}
          {section === "builds" && <ManageBuilds />}
          {section === "forms" && <ManageForms />}
          {section === "hotfixes" && <ManageHotfixes />}
          {section === "discord" && <ManageDiscord />}
          {section === "roster" && <ManageRoster />}
        </main>
      </div>
    </div>
  );
}
