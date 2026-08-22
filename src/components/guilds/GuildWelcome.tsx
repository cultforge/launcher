import { Icon } from "../ico";
import { AppIcons } from "../icons";
import { cn } from "../../lib/cn";
import type { GuildHubTab, GuildMember, Guild } from "../../data/guilds";
import { useGuildStore } from "../../stores/guilds";
import { useNow } from "../../lib/clock";
import { getEventPhase } from "../../lib/timedEvents";
import { EntityImage } from "../EntityImage";
import { UserAvatar } from "../UserAvatar";
import {
  capabilitiesForRole,
  membershipForUser,
} from "../../lib/guildPermissions";
import { hasDiscordSource } from "../../lib/discordWidget";
import { discordSourceForGuild } from "../../data/guilds";
import { canonicalizeHostedAvatarUrl } from "../../lib/authProfile";
import { useAppStore } from "../../userstore";
import type { CurrentUser } from "../../userstore";

function hostedProfileAvatarUrl(userId: string): string {
  const id = userId.trim();
  if (!id) return "";
  return `https://api.cultforge.com/v1/profile/${id}/avatar`;
}

function isViewerMember(
  member: GuildMember,
  currentUser: CurrentUser | null,
): boolean {
  if (!currentUser) return false;
  const uid = member.userId?.trim();
  if (uid && uid === currentUser.id) return true;
  const name = member.name?.trim();
  return Boolean(name && name === currentUser.name?.trim());
}

const CORNER_LINKS: { tab: GuildHubTab; label: string; icon: keyof typeof AppIcons }[] = [
  { tab: "News", label: "Board", icon: "Newspaper" },
  { tab: "Activity", label: "Buzz", icon: "Activity" },
  { tab: "Forums", label: "Threads", icon: "Forums" },
  { tab: "Rankings", label: "Trophy wall", icon: "Star" },
  { tab: "Players", label: "Find someone", icon: "Users" },
  { tab: "Manage", label: "Upkeep", icon: "Settings" },
];

function HallMoment({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  if (!onClick) {
    return (
      <li className="flex items-start gap-2.5 text-[13px] leading-snug text-text-secondary">
        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary-base/70" />
        <span>{children}</span>
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="group flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-white/3"
      >
        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary-base group-hover:scale-125 transition-transform" />
        <span className="text-[13px] leading-snug text-text-secondary group-hover:text-text-primary">
          {children}
        </span>
      </button>
    </li>
  );
}

function resolveMemberAvatar(
  member: GuildMember,
  currentUser: CurrentUser | null,
): string | null {
  const profileId = member.userId?.trim() ?? "";

  if (isViewerMember(member, currentUser) && currentUser?.avatarUrl?.trim()) {
    return canonicalizeHostedAvatarUrl(
      currentUser.id,
      currentUser.avatarUrl.trim(),
    );
  }

  const fromMember = member.avatarUrl?.trim();
  if (fromMember) {
    return canonicalizeHostedAvatarUrl(profileId || currentUser?.id || "", fromMember);
  }

  if (profileId) return hostedProfileAvatarUrl(profileId);
  return null;
}

function HallMemberAvatar({
  member,
  live,
  currentUser,
  zIndex,
}: {
  member: GuildMember;
  live: boolean;
  currentUser: CurrentUser | null;
  zIndex?: number;
}) {
  return (
    <span className="relative" style={zIndex != null ? { zIndex } : undefined}>
      <UserAvatar
        src={resolveMemberAvatar(member, currentUser)}
        name={member.name}
        className={cn(
          "guild-hall-avatar h-12 w-12 rounded-full border-2 border-bg-app text-[11px]",
          live ? "guild-hall-avatar--live" : "guild-hall-avatar--idle",
        )}
        imgClassName="rounded-full"
      />
    </span>
  );
}

function HallDoor({
  title,
  subtitle,
  icon,
  image,
  imageKind,
  imageId,
  onClick,
  wide,
}: {
  title: string;
  subtitle: string;
  icon?: keyof typeof AppIcons;
  image?: string | null;
  imageKind?: "build" | "server";
  imageId?: string;
  onClick: () => void;
  wide?: boolean;
}) {
  const hasArt =
    typeof image === "string" && /^https?:\/\//i.test(image.trim());

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "guild-hall-door group cursor-pointer overflow-hidden rounded-xl text-left",
        wide && "sm:col-span-2",
      )}
    >
      <div className="relative flex min-h-[88px] items-end p-4">
        <div className="guild-hall-door-bg absolute inset-0" />
        {hasArt && imageKind && imageId ? (
          <EntityImage
            kind={imageKind}
            entityId={imageId}
            source={image!}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-30 transition-transform duration-500 group-hover:scale-[1.02]"
          />
        ) : null}
        <div className="absolute inset-0 bg-linear-to-t from-bg-app/95 via-bg-app/50 to-transparent" />
        <div className="relative flex w-full items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-text-primary">{title}</p>
            <p className="mt-0.5 truncate text-[12px] text-text-muted">
              {subtitle}
            </p>
          </div>
          {icon ? (
            <span className="guild-hall-door-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-base/12 text-primary-base">
              <Icon icon={AppIcons[icon]} size={18} />
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function HallCorner({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: keyof typeof AppIcons;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="guild-hall-corner group flex cursor-pointer flex-col items-center gap-2 rounded-xl px-2 py-3 text-center transition-colors"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-text-muted transition-colors group-hover:bg-primary-base/12 group-hover:text-primary-base">
        <Icon icon={AppIcons[icon]} size={18} />
      </span>
      <span className="text-[11px] font-medium text-text-muted group-hover:text-text-secondary">
        {label}
      </span>
    </button>
  );
}

export function GuildWelcome({ guild }: { guild: Guild }) {
  const setHubTab = useGuildStore((s) => s.setHubTab);
  const events = useGuildStore((s) => s.events);
  const news = useGuildStore((s) => s.news);
  const members = useGuildStore((s) => s.members);
  const servers = useGuildStore((s) => s.servers);
  const builds = useGuildStore((s) => s.buildReleases);
  const discordOverrides = useGuildStore((s) => s.discordOverrides);
  const userId = useAppStore((s) => s.currentUser?.id ?? "");
  const currentUser = useAppStore((s) => s.currentUser);
  const now = useNow();
  const canManage = capabilitiesForRole(
    membershipForUser(members, guild.id, userId)?.role,
  ).openManagement;
  const hasDiscord = hasDiscordSource(
    discordSourceForGuild(guild.id, discordOverrides),
  );

  const guildEvents = events.filter((e) => e.guildId === guild.id);
  const nextEvent =
    guildEvents.find((e) => getEventPhase(e, now) === "live") ??
    guildEvents.find((e) => getEventPhase(e, now) === "upcoming");
  const pinned = news.find((n) => n.guildId === guild.id && n.pinned);
  const online = members.filter(
    (m) => m.guildId === guild.id && m.status === "online",
  );
  const roster = members.filter((m) => m.guildId === guild.id);
  const guildServers = servers.filter((s) => s.guildId === guild.id);
  const primaryServer = guildServers[0];
  const featuredBuild =
    builds.find((b) => b.guildId === guild.id && b.isFeatured) ??
    builds.find((b) => b.guildId === guild.id);

  const cornerLinks = CORNER_LINKS.filter(
    (link) => link.tab !== "Manage" || canManage,
  );

  const presenceNames =
    online.length > 0
      ? online.length <= 3
        ? online.map((m) => m.name).join(" and ")
        : `${online
            .slice(0, 2)
            .map((m) => m.name)
            .join(", ")} and ${online.length - 2} more`
      : null;

  const shownAvatars = (online.length > 0 ? online : roster)
    .slice(0, 8)
    .map((member) =>
      member.avatarUrl || !currentUser || !isViewerMember(member, currentUser)
        ? member
        : { ...member, avatarUrl: currentUser.avatarUrl },
    );

  const moments: React.ReactNode[] = [];
  if (nextEvent) {
    const live = getEventPhase(nextEvent, now) === "live";
    moments.push(
      <HallMoment key="event" onClick={() => setHubTab("Events")}>
        {live ? (
          <>
            <strong className="font-medium text-text-primary">
              {nextEvent.title}
            </strong>{" "}
            is happening now — come join in
          </>
        ) : (
          <>
            Coming up:{" "}
            <strong className="font-medium text-text-primary">
              {nextEvent.title}
            </strong>
          </>
        )}
      </HallMoment>,
    );
  }
  if (pinned) {
    moments.push(
      <HallMoment key="news" onClick={() => setHubTab("News")}>
        On the board:{" "}
        <strong className="font-medium text-text-primary">{pinned.title}</strong>
      </HallMoment>,
    );
  }
  if (primaryServer) {
    const playing = primaryServer.playersOnline > 0;
    moments.push(
      <HallMoment key="server" onClick={() => setHubTab("Servers")}>
        {playing ? (
          <>
            Someone&apos;s in{" "}
            <strong className="font-medium text-text-primary">
              {primaryServer.name}
            </strong>{" "}
            ({primaryServer.playersOnline}/{primaryServer.playersMax}) — hop in?
          </>
        ) : (
          <>
            <strong className="font-medium text-text-primary">
              {primaryServer.name}
            </strong>{" "}
            is open if you want to play
          </>
        )}
      </HallMoment>,
    );
  } else {
    moments.push(
      <HallMoment key="server-empty" onClick={() => setHubTab("Servers")}>
        No world linked yet — officers can add a server for everyone
      </HallMoment>,
    );
  }
  if (featuredBuild) {
    moments.push(
      <HallMoment key="build" onClick={() => setHubTab("Builds")}>
        Tonight&apos;s pack:{" "}
        <strong className="font-medium text-text-primary">
          {featuredBuild.name}
        </strong>{" "}
        ({featuredBuild.version})
      </HallMoment>,
    );
  }
  if (moments.length === 0) {
    moments.push(
      <HallMoment key="quiet">
        It&apos;s quiet in the hall — say hello in chat and break the ice
      </HallMoment>,
    );
  }

  return (
    <section className="guild-hall">
      <div className="guild-hall-presence">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="guild-hall-label">The hall</p>
            <h3 className="mt-1 font-sora text-[22px] font-bold text-text-primary">
              {online.length > 0 ? "Friends are here" : "The hall is open"}
            </h3>
            <p className="mt-2 max-w-md text-[14px] leading-relaxed text-text-secondary">
              {presenceNames
                ? `${presenceNames} ${online.length === 1 ? "is" : "are"} hanging out tonight.`
                : roster.length > 0
                  ? `${guild.name} is your crew's place to meet, play, and catch up.`
                  : "Invite people in — guilds are better with company."}
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 sm:items-end">
            <div className="flex items-center pl-1">
              {shownAvatars.map((member, index) => (
                <span
                  key={member.id}
                  className={cn(index > 0 && "-ml-3")}
                >
                  <HallMemberAvatar
                    member={member}
                    live={online.some((m) => m.id === member.id)}
                    currentUser={currentUser}
                    zIndex={shownAvatars.length - index}
                  />
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setHubTab("Chat")}
                className="cf-btn-primary cursor-pointer rounded-full px-4 py-2 text-[12px] font-semibold"
              >
                Say hello
              </button>
              <button
                type="button"
                onClick={() => setHubTab("Members")}
                className="cursor-pointer rounded-full border border-white/10 px-4 py-2 text-[12px] font-medium text-text-secondary transition-colors hover:bg-white/4"
              >
                See everyone
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="guild-hall-divider" />

      <div className="guild-hall-tonight">
        <p className="guild-hall-label">On the table tonight</p>
        <ul className="mt-3 flex flex-col gap-0.5">{moments}</ul>
      </div>

      <div className="guild-hall-divider" />

      <div className="guild-hall-doors">
        <p className="guild-hall-label mb-3">Walk over to</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <HallDoor
            wide
            title="Play together"
            subtitle={primaryServer?.name ?? "Guild worlds"}
            icon="Servers"
            image={primaryServer?.coverUrl ?? primaryServer?.thumbnail}
            imageKind="server"
            imageId={primaryServer?.id}
            onClick={() => setHubTab("Servers")}
          />
          <HallDoor
            title="Guild pack"
            subtitle={featuredBuild?.name ?? "Install & match"}
            icon="Builds"
            image={featuredBuild?.coverUrl ?? featuredBuild?.image}
            imageKind="build"
            imageId={featuredBuild?.buildId}
            onClick={() => setHubTab("Builds")}
          />
          {hasDiscord ? (
            <HallDoor
              title="Voice room"
              subtitle="Discord"
              icon="Voice"
              onClick={() => setHubTab("Discord")}
            />
          ) : (
            <HallDoor
              title="What's on"
              subtitle="Events & plans"
              icon="Notifications"
              onClick={() => setHubTab("Events")}
            />
          )}
        </div>
      </div>

      <div className="guild-hall-corners mt-4 grid grid-cols-3 gap-1 sm:grid-cols-6">
        {cornerLinks.map((link) => (
          <HallCorner
            key={link.tab}
            label={link.label}
            icon={link.icon}
            onClick={() => setHubTab(link.tab)}
          />
        ))}
      </div>
    </section>
  );
}
