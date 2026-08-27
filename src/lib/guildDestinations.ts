import type { GuildHubTab } from "../data/guilds";
import { AppIcons } from "../components/icons";

export type GuildDestination = {
  tab: GuildHubTab;
  title: string;
  description: string;
  icon: keyof typeof AppIcons;
  /** Shown in the primary welcome row (Discord-style, max ~5). */
  primary?: boolean;
};

/** Welcome-screen destinations — inspired by Discord Community Welcome Screen channel picks. */
export const GUILD_DESTINATIONS: GuildDestination[] = [
  {
    tab: "Chat",
    title: "Chat",
    description: "Say hello",
    icon: "Global",
    primary: true,
  },
  {
    tab: "Events",
    title: "Events",
    description: "What's on the calendar",
    icon: "Notifications",
    primary: true,
  },
  {
    tab: "Servers",
    title: "Servers",
    description: "Jump into a world",
    icon: "Servers",
    primary: true,
  },
  {
    tab: "Members",
    title: "Members",
    description: "Meet everyone",
    icon: "Users",
    primary: true,
  },
  {
    tab: "Builds",
    title: "Builds",
    description: "Get the modpack",
    icon: "Builds",
    primary: true,
  },
  {
    tab: "News",
    title: "News",
    description: "Announcements from officers",
    icon: "Newspaper",
  },
  {
    tab: "Activity",
    title: "Buzz",
    description: "Live agent play signals for the whole guild",
    icon: "Activity",
  },
  {
    tab: "Players",
    title: "Find players",
    description: "Look someone up on CultForge",
    icon: "Users",
  },
  {
    tab: "Forums",
    title: "Forums",
    description: "Long-form community threads",
    icon: "Forums",
  },
  {
    tab: "Rankings",
    title: "Rankings",
    description: "Leaderboards and stats",
    icon: "Star",
  },
  {
    tab: "Discord",
    title: "Discord",
    description: "Open the linked Discord server",
    icon: "Discord",
  },
  {
    tab: "Manage",
    title: "Guild settings",
    description: "For officers and leaders",
    icon: "Settings",
  },
];

export function destinationForTab(tab: GuildHubTab): GuildDestination | undefined {
  return GUILD_DESTINATIONS.find((d) => d.tab === tab);
}

export function visibleDestinations(
  tabs: readonly GuildHubTab[],
): GuildDestination[] {
  const allowed = new Set(tabs);
  return GUILD_DESTINATIONS.filter((d) => allowed.has(d.tab));
}
