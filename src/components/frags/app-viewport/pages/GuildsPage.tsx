import { AnimatePresence, motion } from "framer-motion";
import { Tabs } from "@heroui/react";
import { useNavigationStore } from "../../../../typlibs";
import {
  getGuild,
  GUILD_HUB_TABS,
  type GuildHubTab,
} from "../../../../data/guilds";
import { useGuildStore } from "../../../../stores/guilds";
import { useGuildModalsStore } from "../../../../stores/guildModals";
import { pageSwap } from "../../../../lib/motion";
import { GuildHero } from "../../../guilds/GuildHero";
import { GuildIdentityBar } from "../../../guilds/GuildIdentityBar";
import { GuildSwitcher } from "../../../guilds/GuildSwitcher";
import { OverviewPanel } from "../../../guilds/tabs/OverviewPanel";
import { NewsPanel } from "../../../guilds/tabs/NewsPanel";
import { EventsPanel } from "../../../guilds/tabs/EventsPanel";
import { RankingsPanel } from "../../../guilds/tabs/RankingsPanel";
import { ChatPanel } from "../../../guilds/tabs/ChatPanel";
import { DiscordPanel } from "../../../guilds/tabs/DiscordPanel";
import { ServersPanel } from "../../../guilds/tabs/ServersPanel";
import { BuildsPanel } from "../../../guilds/tabs/BuildsPanel";
import { MembersPanel } from "../../../guilds/tabs/MembersPanel";
import { ActivityFeedPanel } from "../../../guilds/ActivityFeedPanel";
import { FindPlayersPanel } from "../../../guilds/FindPlayersPanel";
import { ForumsPanel } from "../../../guilds/ForumsPanel";
import { ManagementPanel } from "../../../guilds/tabs/ManagementPanel";
import {
  capabilitiesForRole,
  membershipForUser,
} from "../../../../lib/guildPermissions";
import { useAppStore } from "../../../../userstore";

function HubTabBody({ hubTab }: { hubTab: GuildHubTab }) {
  if (hubTab === "Overview") return <OverviewPanel />;
  if (hubTab === "News") return <NewsPanel />;
  if (hubTab === "Events") return <EventsPanel />;
  if (hubTab === "Rankings") return <RankingsPanel />;
  if (hubTab === "Chat") return <ChatPanel />;
  if (hubTab === "Discord") return <DiscordPanel />;
  if (hubTab === "Servers") return <ServersPanel />;
  if (hubTab === "Builds") return <BuildsPanel />;
  if (hubTab === "Members") return <MembersPanel />;
  return null;
}

function GuildHub() {
  const guildId = useGuildStore((s) => s.activeGuildId);
  const hubTab = useGuildStore((s) => s.hubTab);
  const setHubTab = useGuildStore((s) => s.setHubTab);
  const members = useGuildStore((s) => s.members);
  const catalogRevision = useGuildStore((s) => s.guildCatalogRevision);
  const userId = useAppStore((s) => s.currentUser?.id ?? "");
  void catalogRevision;
  const guild = getGuild(guildId);
  const membership = membershipForUser(members, guildId, userId);
  const canManage = capabilitiesForRole(membership?.role).openManagement;
  const tabs = GUILD_HUB_TABS.filter(
    (tab) => tab !== "Manage" || canManage,
  );
  const isManage = hubTab === "Manage";
  const isOverview = hubTab === "Overview";

  if (!guild) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <GuildSwitcher />
        <div className="cf-panel flex flex-1 flex-col items-center justify-center gap-3 rounded-xl px-6 text-center">
          <p className="text-[13px] text-text-muted max-w-sm">
            No guilds yet. Join with an invite from Home, discover a public
            guild, or create your own.
          </p>
          <button
            type="button"
            onClick={() => useGuildModalsStore.getState().open("create")}
            className="cf-btn-primary rounded-lg px-4 py-2 text-[11px] font-semibold cursor-pointer"
          >
            Create guild
          </button>
        </div>
      </div>
    );
  }

  if (isManage) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${guildId}-Manage`}
            className="flex h-full min-h-0 flex-col"
            initial={pageSwap.initial}
            animate={pageSwap.animate}
            exit={pageSwap.exit}
            transition={pageSwap.transition}
          >
            <ManagementPanel />
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {isOverview ? (
        <GuildHero guild={guild} />
      ) : (
        <GuildIdentityBar />
      )}

      <Tabs
        selectedKey={hubTab}
        onSelectionChange={(key) => setHubTab(String(key) as GuildHubTab)}
        className="flex w-full shrink-0 flex-col"
        variant="secondary"
      >
        <Tabs.ListContainer className="overflow-x-auto scroll-hidden border-b border-white/8 cf-panel rounded-t-xl px-1">
          <Tabs.List className="flex min-w-max gap-0.5">
            {tabs.map((id) => (
              <Tabs.Tab
                key={id}
                id={id}
                className="cursor-pointer whitespace-nowrap px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted data-[selected=true]:text-text-primary"
              >
                {id}
                <Tabs.Indicator className="h-0.5 rounded-full bg-primary-base" />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>

      <div className="min-h-0 flex-1 overflow-y-auto scroll-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${guildId}-${hubTab}`}
            className="flex h-full min-h-0 flex-col"
            initial={pageSwap.initial}
            animate={pageSwap.animate}
            exit={pageSwap.exit}
            transition={pageSwap.transition}
          >
            <HubTabBody hubTab={hubTab} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function GuildsPage() {
  const sideItem = useNavigationStore((s) => s.sideItem);
  const isHub =
    sideItem !== "Activity Feed" &&
    sideItem !== "Find Players" &&
    sideItem !== "Forums";

  return (
    <div
      className={
        isHub
          ? "flex h-full min-h-0 flex-col p-4 pb-24"
          : "h-full overflow-y-auto scroll-hidden p-4 pb-24"
      }
    >
      {sideItem === "Activity Feed" ? (
        <ActivityFeedPanel />
      ) : sideItem === "Find Players" ? (
        <FindPlayersPanel />
      ) : sideItem === "Forums" ? (
        <ForumsPanel />
      ) : (
        <GuildHub />
      )}
    </div>
  );
}

export default GuildsPage;
