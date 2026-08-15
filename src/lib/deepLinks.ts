import {
  useNavigationStore,
  type PrimaryTab,
} from "../typlibs";
import { useGuildStore } from "../stores/guilds";
import { useProfileRouteStore } from "../stores/profileRoute";

export type CultforgeDeepLink =
  | { kind: "guild"; guildId: string }
  | { kind: "guild-news"; guildId: string; newsId: string }
  | { kind: "guild-events"; guildId: string; eventId: string }
  | { kind: "guild-channel"; guildId: string; channelId: string }
  | { kind: "dm"; userId: string }
  | { kind: "profile"; userId: string }
  | { kind: "launcher"; target: string; section?: string };

/** Parse cultforge://nav/... URIs used in rich news/events markdown. */
export function parseCultforgeDeepLink(
  href: string | null | undefined,
): CultforgeDeepLink | null {
  if (!href) return null;
  const raw = href.trim();
  if (!raw.toLowerCase().startsWith("cultforge://")) return null;

  let path = raw.slice("cultforge://".length);
  if (path.toLowerCase().startsWith("nav/")) path = path.slice(4);
  path = path.replace(/^\/+/, "").replace(/\/+$/, "");
  const parts = path.split("/").filter(Boolean).map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });

  const launcherTarget = (parts[0] || "").toLowerCase();
  if (
    launcherTarget &&
    [
      "home",
      "settings",
      "discord",
      "store",
      "builds",
      "library",
      "guilds",
      "mods",
      "downloads",
      "friends",
      "discover",
      "updates",
    ].includes(launcherTarget)
  ) {
    return {
      kind: "launcher",
      target: launcherTarget,
      section: parts[1]?.toLowerCase(),
    };
  }

  if (parts[0] === "guild" && parts[1]) {
    const guildId = parts[1];
    if (parts[2] === "news" && parts[3]) {
      return { kind: "guild-news", guildId, newsId: parts[3] };
    }
    if (parts[2] === "events" && parts[3]) {
      return { kind: "guild-events", guildId, eventId: parts[3] };
    }
    if (parts[2] === "channel" && parts[3]) {
      return { kind: "guild-channel", guildId, channelId: parts[3] };
    }
    return { kind: "guild", guildId };
  }
  if (parts[0] === "dm" && parts[1]) {
    return { kind: "dm", userId: parts[1] };
  }
  if (parts[0] === "profile" && parts[1]) {
    return { kind: "profile", userId: parts[1] };
  }
  return null;
}

export function isCultforgeDeepLink(href: string | null | undefined): boolean {
  return Boolean(parseCultforgeDeepLink(href));
}

/** Navigate the launcher shell for a cultforge:// deep link. */
export function navigateCultforgeDeepLink(href: string): boolean {
  const link = parseCultforgeDeepLink(href);
  if (!link) return false;

  const nav = useNavigationStore.getState();
  const guilds = useGuildStore.getState();

  switch (link.kind) {
    case "guild":
      guilds.setActiveGuild(link.guildId);
      guilds.setHubTab("Overview");
      guilds.clearContentFocus();
      nav.setPrimaryTab("Guilds" as PrimaryTab);
      nav.setSideItem("Guilds");
      return true;
    case "guild-news":
      guilds.setActiveGuild(link.guildId);
      guilds.setHubTab("News");
      guilds.focusNews(link.newsId);
      nav.setPrimaryTab("Guilds" as PrimaryTab);
      nav.setSideItem("Guilds");
      return true;
    case "guild-events":
      guilds.setActiveGuild(link.guildId);
      guilds.setHubTab("Events");
      guilds.focusEvent(link.eventId);
      nav.setPrimaryTab("Guilds" as PrimaryTab);
      nav.setSideItem("Guilds");
      return true;
    case "guild-channel":
      guilds.setActiveGuild(link.guildId);
      guilds.setActiveChannel(link.guildId, link.channelId);
      guilds.setHubTab("Chat");
      guilds.clearContentFocus();
      nav.setPrimaryTab("Guilds" as PrimaryTab);
      nav.setSideItem("Guilds");
      return true;
    case "dm":
      void import("../stores/dm").then(({ useDmStore }) => {
        void useDmStore.getState().openPeer(link.userId);
      });
      nav.setPrimaryTab("Home" as PrimaryTab);
      nav.setSideItem("Friends");
      return true;
    case "profile":
      useProfileRouteStore.getState().openFriend(link.userId);
      return true;
    case "launcher": {
      const target = link.target;
      if (target === "settings") {
        nav.setPrimaryTab("Home" as PrimaryTab);
        nav.setSideItem("Settings");
        if (link.section) {
          void import("../stores/settingsUi").then(({ useSettingsUiStore }) => {
            const allowed = [
              "appearance",
              "general",
              "audio",
              "notifications",
              "paths",
            ] as const;
            if ((allowed as readonly string[]).includes(link.section || "")) {
              useSettingsUiStore
                .getState()
                .setCategory(link.section as (typeof allowed)[number]);
            }
          });
        }
        return true;
      }
      if (target === "discord" || target === "downloads" || target === "friends" || target === "discover" || target === "updates" || target === "home") {
        nav.setPrimaryTab("Home" as PrimaryTab);
        nav.setSideItem(
          target === "home"
            ? "Home"
            : target.charAt(0).toUpperCase() + target.slice(1),
        );
        return true;
      }
      if (target === "store") {
        nav.setPrimaryTab("Store" as PrimaryTab);
        return true;
      }
      if (target === "builds" || target === "library") {
        nav.setPrimaryTab("Builds" as PrimaryTab);
        nav.setSideItem("Library");
        return true;
      }
      if (target === "guilds") {
        nav.setPrimaryTab("Guilds" as PrimaryTab);
        nav.setSideItem("Guilds");
        return true;
      }
      if (target === "mods") {
        nav.setPrimaryTab("Mods" as PrimaryTab);
        return true;
      }
      return false;
    }
    default:
      return false;
  }
}

export function handleContentHref(href: string | null | undefined): boolean {
  if (!href) return false;
  if (isCultforgeDeepLink(href)) {
    return navigateCultforgeDeepLink(href);
  }
  return false;
}
