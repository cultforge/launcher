import type { GuildHubTab } from "../data/guilds";
import { useSettingsStore } from "../stores/settings";
import type { PrimaryTab } from "../typlibs";

export type GuildUiPreferences = {
  compactCards: boolean;
  showRankingsTab: boolean;
  showDiscordTab: boolean;
};

export const DEFAULT_GUILD_UI_PREFERENCES: GuildUiPreferences = {
  compactCards: true,
  showRankingsTab: true,
  showDiscordTab: true,
};

export function mergeGuildUiPreferences(raw: unknown): GuildUiPreferences {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_GUILD_UI_PREFERENCES };
  }
  const obj = raw as Record<string, unknown>;
  return {
    compactCards:
      typeof obj.compactCards === "boolean"
        ? obj.compactCards
        : DEFAULT_GUILD_UI_PREFERENCES.compactCards,
    showRankingsTab:
      typeof obj.showRankingsTab === "boolean"
        ? obj.showRankingsTab
        : DEFAULT_GUILD_UI_PREFERENCES.showRankingsTab,
    showDiscordTab:
      typeof obj.showDiscordTab === "boolean"
        ? obj.showDiscordTab
        : DEFAULT_GUILD_UI_PREFERENCES.showDiscordTab,
  };
}

export function useGuildUiPreferences(): GuildUiPreferences {
  return useSettingsStore((s) => s.settings.guildUiPreferences);
}

/** Map Community sidenav label → guild hub tab. */
export function communityLabelToHubTab(label: string): GuildHubTab | null {
  if (label === "Guilds") return "Overview";
  if (label === "Activity Feed") return "Activity";
  if (label === "Find Players") return "Players";
  if (label === "Forums") return "Forums";
  return null;
}

export function isCommunityNavActive(
  label: string,
  primaryTab: PrimaryTab,
  hubTab: GuildHubTab,
  discoverOpen: boolean,
): boolean {
  if (primaryTab !== "Guilds") return false;
  if (label === "Guilds") {
    return !discoverOpen && hubTab === "Overview";
  }
  const mapped = communityLabelToHubTab(label);
  return mapped != null && mapped !== "Overview" && hubTab === mapped;
}

export function filterHubTabsForPreferences(
  tabs: readonly GuildHubTab[],
  prefs: GuildUiPreferences,
  canManage: boolean,
): GuildHubTab[] {
  return tabs.filter((tab) => {
    if (tab === "Manage") return canManage;
    if (tab === "Rankings") return prefs.showRankingsTab;
    if (tab === "Discord") return prefs.showDiscordTab;
    return true;
  });
}
