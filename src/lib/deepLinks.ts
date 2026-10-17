import {
  useNavigationStore,
  type PrimaryTab,
} from "../typlibs";
import { useGuildStore } from "../stores/guilds";
import { useProfileRouteStore } from "../stores/profileRoute";
import { parseAgentLinkCode } from "./agentLink";
import { HOME_BUILDS_SIDE } from "./homeNav";

export type CultforgeDeepLink =
  | { kind: "guild"; guildId: string }
  | { kind: "guild-news"; guildId: string; newsId: string }
  | { kind: "guild-events"; guildId: string; eventId: string }
  | { kind: "guild-channel"; guildId: string; channelId: string }
  | { kind: "guild-rankings"; guildId: string }
  | { kind: "dm"; userId: string }
  | { kind: "profile"; userId: string }
  | { kind: "rankings-players" }
  | { kind: "rankings-guilds" }
  | { kind: "lobby"; lobbyId: string; inviteCode?: string }
  | { kind: "launcher"; target: string; section?: string }
  | { kind: "agent-link"; code: string };

/** Parse cultforge://nav/... URIs used in rich news/events markdown. */
export function parseCultforgeDeepLink(
  href: string | null | undefined,
): CultforgeDeepLink | null {
  if (!href) return null;
  const raw = href.trim();

  const agentCode = parseAgentLinkCode(raw);
  if (
    agentCode &&
    (/agent\/link/i.test(raw) ||
      raw.toLowerCase().startsWith("cultforge://agent"))
  ) {
    return { kind: "agent-link", code: agentCode };
  }

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
      "feed",
      "updates",
      "agents",
    ].includes(launcherTarget)
  ) {
    return {
      kind: "launcher",
      target: launcherTarget === "feed" ? "discover" : launcherTarget,
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
    if (parts[2] === "rankings") {
      return { kind: "guild-rankings", guildId };
    }
    return { kind: "guild", guildId };
  }
  if (parts[0] === "dm" && parts[1]) {
    return { kind: "dm", userId: parts[1] };
  }
  if (parts[0] === "profile" && parts[1]) {
    return { kind: "profile", userId: parts[1] };
  }
  if (parts[0] === "rankings" && parts[1] === "players") {
    return { kind: "rankings-players" };
  }
  if (parts[0] === "rankings" && parts[1] === "guilds") {
    return { kind: "rankings-guilds" };
  }
  if (parts[0] === "lobby" && parts[1]) {
    return { kind: "lobby", lobbyId: parts[1] };
  }
  return null;
}

export function isCultforgeDeepLink(href: string | null | undefined): boolean {
  return Boolean(parseCultforgeDeepLink(href));
}

function enc(part: string): string {
  return encodeURIComponent(part.trim());
}

/** Build a cultforge:// deep link for Share / copy flows. */
export function buildCultforgeDeepLink(link: CultforgeDeepLink): string {
  switch (link.kind) {
    case "guild":
      return `cultforge://guild/${enc(link.guildId)}`;
    case "guild-news":
      return `cultforge://guild/${enc(link.guildId)}/news/${enc(link.newsId)}`;
    case "guild-events":
      return `cultforge://guild/${enc(link.guildId)}/events/${enc(link.eventId)}`;
    case "guild-channel":
      return `cultforge://guild/${enc(link.guildId)}/channel/${enc(link.channelId)}`;
    case "dm":
      return `cultforge://dm/${enc(link.userId)}`;
    case "profile":
      return `cultforge://nav/profile/${enc(link.userId)}`;
    case "guild-rankings":
      return `cultforge://nav/guild/${enc(link.guildId)}/rankings`;
    case "rankings-players":
      return `cultforge://nav/rankings/players`;
    case "rankings-guilds":
      return `cultforge://nav/rankings/guilds`;
    case "lobby":
      return `cultforge://nav/lobby/${enc(link.lobbyId)}`;
    case "agent-link":
      return `cultforge://agent/link/${enc(link.code)}`;
    case "launcher": {
      const base = `cultforge://${enc(link.target)}`;
      return link.section ? `${base}/${enc(link.section)}` : base;
    }
    default:
      return "";
  }
}

/**
 * Public https link for the same target (browser / Discord).
 * Guild surfaces → guilds.cultforge.com; invites/agent codes → invite.cultforge.com.
 * Returns null when there is no public web equivalent (e.g. DM, launcher path).
 */
export function buildCultforgeWebLink(link: CultforgeDeepLink): string | null {
  switch (link.kind) {
    case "guild":
      return `https://guilds.cultforge.com/${enc(link.guildId)}`;
    case "guild-news":
      return `https://guilds.cultforge.com/${enc(link.guildId)}/news/${enc(link.newsId)}`;
    case "guild-events":
      return `https://guilds.cultforge.com/${enc(link.guildId)}/events/${enc(link.eventId)}`;
    case "guild-channel":
      return `https://guilds.cultforge.com/${enc(link.guildId)}/channels/${enc(link.channelId)}`;
    case "profile":
      return `https://api.cultforge.com/u/${enc(link.userId)}`;
    case "guild-rankings":
      return `https://guilds.cultforge.com/${enc(link.guildId)}/rankings`;
    case "rankings-players":
      return `https://api.cultforge.com/rankings/players`;
    case "rankings-guilds":
      return `https://api.cultforge.com/rankings/guilds`;
    case "lobby":
      return `https://api.cultforge.com/lobby/${enc(link.inviteCode || link.lobbyId)}`;
    case "agent-link":
      return `https://invite.cultforge.com/agent/${enc(link.code)}`;
    case "dm":
    case "launcher":
      return null;
    default:
      return null;
  }
}

/** Build + copy helper for Share buttons. */
export async function shareCultforgeDeepLink(
  link: CultforgeDeepLink,
  successMessage = "Deep link copied",
): Promise<boolean> {
  const { copyText } = await import("./copyText");
  const href = buildCultforgeDeepLink(link);
  if (!href) return false;
  return copyText(href, successMessage);
}

export async function shareCultforgeWebLink(
  link: CultforgeDeepLink,
  successMessage = "Web link copied",
): Promise<boolean> {
  const { copyText } = await import("./copyText");
  const href = buildCultforgeWebLink(link);
  if (!href) return false;
  return copyText(href, successMessage);
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
      guilds.setDiscoverOpen(false);
      guilds.clearContentFocus();
      nav.setPrimaryTab("Guilds" as PrimaryTab);
      nav.setSideItem("Guilds");
      return true;
    case "guild-news":
      guilds.setActiveGuild(link.guildId);
      guilds.setHubTab("News");
      guilds.setDiscoverOpen(false);
      guilds.focusNews(link.newsId);
      nav.setPrimaryTab("Guilds" as PrimaryTab);
      nav.setSideItem("Guilds");
      return true;
    case "guild-events":
      guilds.setActiveGuild(link.guildId);
      guilds.setHubTab("Events");
      guilds.setDiscoverOpen(false);
      guilds.focusEvent(link.eventId);
      nav.setPrimaryTab("Guilds" as PrimaryTab);
      nav.setSideItem("Guilds");
      return true;
    case "guild-channel":
      guilds.setActiveGuild(link.guildId);
      guilds.setActiveChannel(link.guildId, link.channelId);
      guilds.setHubTab("Chat");
      guilds.setDiscoverOpen(false);
      guilds.clearContentFocus();
      nav.setPrimaryTab("Guilds" as PrimaryTab);
      nav.setSideItem("Guilds");
      return true;
    case "agent-link":
      void import("../stores/agentControl").then(({ useAgentControlStore }) => {
        useAgentControlStore.getState().openAgentLinkHelp(link.code);
      });
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
    case "guild-rankings":
      guilds.setActiveGuild(link.guildId);
      guilds.setHubTab("Rankings");
      guilds.setDiscoverOpen(false);
      guilds.clearContentFocus();
      nav.setPrimaryTab("Guilds" as PrimaryTab);
      nav.setSideItem("Guilds");
      return true;
    case "rankings-players":
    case "rankings-guilds":
      guilds.setHubTab("Rankings");
      nav.setPrimaryTab("Guilds" as PrimaryTab);
      nav.setSideItem("Guilds");
      return true;
    case "lobby":
      void import("../stores/partyLobby").then(({ usePartyLobbyStore }) => {
        void usePartyLobbyStore.getState().openLobby(link.lobbyId);
      });
      nav.setPrimaryTab("Home" as PrimaryTab);
      nav.setSideItem("Friends");
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
      if (target === "discord" || target === "downloads" || target === "friends" || target === "discover" || target === "feed" || target === "updates" || target === "home") {
        nav.setPrimaryTab("Home" as PrimaryTab);
        nav.setSideItem(
          target === "home"
            ? HOME_BUILDS_SIDE
            : target === "discover" || target === "feed"
              ? "Feed"
              : target.charAt(0).toUpperCase() + target.slice(1),
        );
        return true;
      }
      if (target === "agents") {
        nav.setPrimaryTab("Servers" as PrimaryTab);
        nav.setSideItem("My PCs");
        return true;
      }
      if (target === "store") {
        nav.setPrimaryTab("Store" as PrimaryTab);
        return true;
      }
      if (target === "library") {
        nav.setPrimaryTab("Mods" as PrimaryTab);
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
  const agentCode = parseAgentLinkCode(href);
  if (agentCode && /agent\/link|cultforge:\/\/agent/i.test(href)) {
    void import("../stores/agentControl").then(({ useAgentControlStore }) => {
      useAgentControlStore.getState().openAgentLinkHelp(agentCode);
    });
    return true;
  }
  if (isCultforgeDeepLink(href)) {
    return navigateCultforgeDeepLink(href);
  }
  return false;
}
