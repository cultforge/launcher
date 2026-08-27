import { useEffect, useRef, useState } from "react";
import { Icon } from "../ico";
import { AppIcons } from "../icons";
import type { Guild } from "../../data/guilds";
import { discordSourceForGuild } from "../../data/guilds";
import { hasDiscordSource } from "../../lib/discordWidget";
import { cn } from "../../lib/cn";
import { EntityImage } from "../EntityImage";
import { GuildIcon } from "../GuildIcon";
import { useGuildStore } from "../../stores/guilds";
import { useAppStore } from "../../userstore";
import {
  capabilitiesForRole,
  membershipForUser,
} from "../../lib/guildPermissions";
import { useGuildModalsStore } from "../../stores/guildModals";
import { useNow } from "../../lib/clock";
import { hallPeriodCopy } from "../../lib/hallCopy";
import { ShareDeepLinkButton } from "../CopyButton";

function HeroQuickAction({
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
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/14 bg-black/25 px-3 py-1.5 text-[12px] font-semibold text-white/85 backdrop-blur-sm transition-colors hover:border-white/22 hover:bg-black/40 hover:text-white"
    >
      <Icon icon={AppIcons[icon]} size={14} />
      {label}
    </button>
  );
}

export function GuildHero({ guild }: { guild: Guild }) {
  const members = useGuildStore((state) => state.members);
  const servers = useGuildStore((state) => state.servers);
  const discordOverrides = useGuildStore((state) => state.discordOverrides);
  const setHubTab = useGuildStore((state) => state.setHubTab);
  const userId = useAppStore((state) => state.currentUser?.id ?? "");
  const openModal = useGuildModalsStore((state) => state.open);
  const membership = membershipForUser(members, guild.id, userId);
  const capabilities = capabilitiesForRole(membership?.role);
  const online = members.filter(
    (member) => member.guildId === guild.id && member.status === "online",
  ).length;
  const hasServers = servers.some((server) => server.guildId === guild.id);
  const discordSource = discordSourceForGuild(guild.id, discordOverrides);
  const hasDiscord = hasDiscordSource(discordSource);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [menuOpen]);

  const now = useNow();
  const hallCopy = hallPeriodCopy(now);
  const onlineHint =
    online > 0
      ? `${online} here ${hallCopy.hangingOut}`
      : "The hall is open";

  return (
    <section className="guild-hero relative rounded-xl border border-white/8">
      <div className="absolute inset-0 overflow-hidden rounded-xl">
        <EntityImage
          kind="guild"
          entityId={guild.id}
          source={guild.banner}
          alt={`${guild.name} guild artwork`}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-linear-to-t from-black/92 via-black/58 to-black/28" />
      </div>

      <div className="relative z-10 flex min-h-36 flex-col justify-end gap-4 p-4 sm:min-h-40 sm:p-5">
        <div className="flex items-end gap-4">
          <GuildIcon
            src={guild.icon}
            name={guild.name}
            className={cn(
              "h-14 w-14 shrink-0 rounded-xl border border-white/15 bg-linear-to-br text-bg-app text-[14px] sm:h-16 sm:w-16",
              guild.accent,
            )}
          />

          <div className="min-w-0 flex-1 pb-0.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="truncate font-sora text-[1.375rem] font-bold leading-tight text-white sm:text-[1.5rem]">
                {guild.name}
              </h2>
              <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/70">
                {guild.tag}
              </span>
            </div>
            {guild.motto ? (
              <p className="mt-1 max-w-2xl text-[13px] leading-snug text-white/70">
                {guild.motto}
              </p>
            ) : (
              <p className="mt-1 max-w-2xl text-[13px] leading-snug text-white/55">
                Your crew&apos;s hall — meet up, play, and hang out.
              </p>
            )}
            <p className="mt-2 text-[12px] text-white/45">{onlineHint}</p>
          </div>

          <div className="relative z-20 shrink-0 self-end pb-0.5" ref={menuRef}>
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label="More guild options"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-white/12 bg-black/30 text-white/70 transition-colors hover:bg-black/45 hover:text-white"
            >
              <Icon icon={AppIcons.MoreHorizontal} size={16} />
            </button>
            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-1.5 min-w-44 overflow-hidden rounded-xl border border-white/12 bg-bg-card py-1 shadow-xl"
              >
                {capabilities.inviteMembers ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      openModal("invite");
                    }}
                    className="flex w-full cursor-pointer px-3.5 py-2.5 text-left text-[12px] text-text-secondary hover:bg-white/5 hover:text-text-primary"
                  >
                    Invite friends
                  </button>
                ) : null}
                {capabilities.openManagement ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setHubTab("Manage");
                    }}
                    className="flex w-full cursor-pointer px-3.5 py-2.5 text-left text-[12px] text-text-secondary hover:bg-white/5 hover:text-text-primary"
                  >
                    Guild settings
                  </button>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    openModal("leave");
                  }}
                  className="flex w-full cursor-pointer px-3.5 py-2.5 text-left text-[12px] text-state-warning hover:bg-white/5"
                >
                  Leave guild
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <HeroQuickAction
            label="Talk"
            icon="Global"
            onClick={() => setHubTab("Chat")}
          />
          <HeroQuickAction
            label={hasServers ? "Play" : "Worlds"}
            icon="Servers"
            onClick={() => setHubTab("Servers")}
          />
          <HeroQuickAction
            label="Plans"
            icon="Notifications"
            onClick={() => setHubTab("Events")}
          />
          {hasDiscord ? (
            <HeroQuickAction
              label="Discord"
              icon="Discord"
              onClick={() => setHubTab("Discord")}
            />
          ) : null}
          <ShareDeepLinkButton
            link={{ kind: "guild", guildId: guild.id }}
            label="Share"
            className="border-white/14 bg-black/25 px-3 py-1.5 text-[12px] font-semibold text-white/85 hover:border-white/22 hover:bg-black/40 hover:text-white"
          />
        </div>
      </div>
    </section>
  );
}
