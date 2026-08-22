import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import {
  getGuild,
  GUILD_HUB_TABS,
  type GuildHubTab,
} from "../../data/guilds";
import { useGuildStore } from "../../stores/guilds";
import { useGuildModalsStore } from "../../stores/guildModals";
import { pageSwap } from "../../lib/motion";
import {
  filterHubTabsForPreferences,
  useGuildUiPreferences,
} from "../../lib/guildUi";
import { GuildHero } from "./GuildHero";
import { GuildSwitcher } from "./GuildSwitcher";
import { GuildWelcome } from "./GuildWelcome";
import { GuildPlaceHeader } from "./GuildPlaceHeader";
import { NewsPanel } from "./tabs/NewsPanel";
import { EventsPanel } from "./tabs/EventsPanel";
import { RankingsPanel } from "./tabs/RankingsPanel";
import { ChatPanel } from "./tabs/ChatPanel";
import { DiscordPanel } from "./tabs/DiscordPanel";
import { ServersPanel } from "./tabs/ServersPanel";
import { BuildsPanel } from "./tabs/BuildsPanel";
import { MembersPanel } from "./tabs/MembersPanel";
import { ActivityFeedPanel } from "./ActivityFeedPanel";
import { FindPlayersPanel } from "./FindPlayersPanel";
import { ForumsPanel } from "./ForumsPanel";
import { ManagementPanel } from "./tabs/ManagementPanel";
import { GuildDiscoverPanel } from "./GuildDiscoverPanel";
import {
  capabilitiesForRole,
  membershipForUser,
} from "../../lib/guildPermissions";
import { useAppStore } from "../../userstore";

function HubTabBody({ hubTab }: { hubTab: GuildHubTab }) {
  if (hubTab === "News") return <NewsPanel />;
  if (hubTab === "Events") return <EventsPanel />;
  if (hubTab === "Rankings") return <RankingsPanel />;
  if (hubTab === "Chat") return <ChatPanel />;
  if (hubTab === "Discord") return <DiscordPanel />;
  if (hubTab === "Servers") return <ServersPanel />;
  if (hubTab === "Builds") return <BuildsPanel />;
  if (hubTab === "Members") return <MembersPanel />;
  if (hubTab === "Activity") return <ActivityFeedPanel />;
  if (hubTab === "Players") return <FindPlayersPanel />;
  if (hubTab === "Forums") return <ForumsPanel />;
  return null;
}

export function GuildShell() {
  const guildUi = useGuildUiPreferences();
  const guildId = useGuildStore((s) => s.activeGuildId);
  const hubTab = useGuildStore((s) => s.hubTab);
  const setHubTab = useGuildStore((s) => s.setHubTab);
  const discoverOpen = useGuildStore((s) => s.discoverOpen);
  const members = useGuildStore((s) => s.members);
  const catalogRevision = useGuildStore((s) => s.guildCatalogRevision);
  const userId = useAppStore((s) => s.currentUser?.id ?? "");
  void catalogRevision;

  const guild = getGuild(guildId);
  const membership = membershipForUser(members, guildId, userId);
  const canManage = capabilitiesForRole(membership?.role).openManagement;
  const tabs = filterHubTabsForPreferences(GUILD_HUB_TABS, guildUi, canManage);
  const isManage = hubTab === "Manage";
  const isOverview = hubTab === "Overview";

  useEffect(() => {
    if (!tabs.includes(hubTab)) {
      setHubTab("Overview");
    }
  }, [hubTab, setHubTab, tabs]);

  if (discoverOpen) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-4">
        <GuildSwitcher />
        <div className="cf-panel min-h-0 flex-1 overflow-y-auto rounded-xl p-5">
          <GuildDiscoverPanel />
        </div>
      </div>
    );
  }

  if (!guild) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-4">
        <GuildSwitcher />
        <div className="cf-panel flex flex-1 flex-col items-center justify-center rounded-xl px-6 text-center">
          <p className="max-w-sm text-[14px] leading-relaxed text-text-muted">
            Join a guild to play together, share builds, and show up on the
            community board.
          </p>
          <button
            type="button"
            onClick={() => useGuildModalsStore.getState().open("create")}
            className="cf-btn-primary mt-5 cursor-pointer rounded-lg px-5 py-2.5 text-[12px] font-semibold"
          >
            Create a guild
          </button>
        </div>
      </div>
    );
  }

  if (isManage) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-4">
        <GuildSwitcher />
        <AnimatePresence mode="wait">
          <motion.div
            key={`${guildId}-Manage`}
            className="flex min-h-0 flex-1 flex-col w-full"
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
    <div className="flex h-full min-h-0 flex-col gap-4">
      <GuildSwitcher />

      <div className="guild-home-scroll min-h-0 flex-1 overflow-y-auto scroll-hidden">
        {isOverview ? (
          <div className="flex flex-col gap-5 pb-4">
            <GuildHero guild={guild} />
            <GuildWelcome guild={guild} />
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-5 pb-4">
            <GuildPlaceHeader hubTab={hubTab} />
            <AnimatePresence mode="wait">
              <motion.div
                key={`${guildId}-${hubTab}`}
                className="min-h-0 flex-1"
                initial={pageSwap.initial}
                animate={pageSwap.animate}
                exit={pageSwap.exit}
                transition={pageSwap.transition}
              >
                <HubTabBody hubTab={hubTab} />
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
