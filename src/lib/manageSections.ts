import type { ManageSectionId } from "../stores/guilds";
import { AppIcons } from "../components/icons";

export type ManageSection = {
  id: ManageSectionId;
  title: string;
  description: string;
  icon: keyof typeof AppIcons;
};

export type ManageSectionGroup = {
  title: string;
  sections: ManageSection[];
};

const SECTION_META: Record<
  Exclude<ManageSectionId, "overview">,
  Omit<ManageSection, "id">
> = {
  branding: {
    title: "Branding",
    description: "Icon, banner, and how your guild looks",
    icon: "Images",
  },
  discord: {
    title: "Discord",
    description: "Link voice and chat for members",
    icon: "Discord",
  },
  events: {
    title: "Events",
    description: "Schedule things for everyone to join",
    icon: "Notifications",
  },
  news: {
    title: "News",
    description: "Post updates and pin announcements",
    icon: "Newspaper",
  },
  rankings: {
    title: "Rankings",
    description: "Leaderboards and guild stats",
    icon: "Star",
  },
  servers: {
    title: "Servers",
    description: "Worlds your guild plays on",
    icon: "Servers",
  },
  builds: {
    title: "Builds",
    description: "Modpacks members can install",
    icon: "Builds",
  },
  hotfixes: {
    title: "Hotfixes",
    description: "Quick patches between releases",
    icon: "Builds",
  },
  forms: {
    title: "Forms",
    description: "Applications and sign-ups",
    icon: "Forums",
  },
  roster: {
    title: "Members",
    description: "Roster, roles, and invites",
    icon: "Users",
  },
};

const GROUPS: { title: string; ids: Exclude<ManageSectionId, "overview">[] }[] =
  [
    { title: "Look & feel", ids: ["branding", "discord"] },
    { title: "Community", ids: ["events", "news", "rankings"] },
    { title: "Play together", ids: ["servers", "builds", "hotfixes"] },
    { title: "People", ids: ["roster", "forms"] },
  ];

export function manageSectionGroups(): ManageSectionGroup[] {
  return GROUPS.map((group) => ({
    title: group.title,
    sections: group.ids.map((id) => ({
      id,
      ...SECTION_META[id],
    })),
  }));
}

export function manageSectionMeta(
  section: ManageSectionId,
): ManageSection | null {
  if (section === "overview") return null;
  return { id: section, ...SECTION_META[section] };
}

export type ManageNudge = {
  message: string;
  action: string;
  section: Exclude<ManageSectionId, "overview">;
};

export function manageNudges(input: {
  discordOk: boolean;
  upcomingEvents: number;
  pinnedNews: number;
}): ManageNudge[] {
  const nudges: ManageNudge[] = [];
  if (!input.discordOk) {
    nudges.push({
      message: "Discord isn't linked yet — members won't find voice chat",
      action: "Connect Discord",
      section: "discord",
    });
  }
  if (input.upcomingEvents === 0) {
    nudges.push({
      message: "Nothing scheduled — plan something for the guild",
      action: "Create event",
      section: "events",
    });
  }
  return nudges.slice(0, 2);
}
