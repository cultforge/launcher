import { Chip } from "@heroui/react";
import { Icon } from "../ico";
import { AppIcons } from "../icons";
import type { Guild } from "../../data/guilds";
import { discordSourceForGuild, serversForGuild } from "../../data/guilds";
import { hasDiscordSource } from "../../lib/discordWidget";
import { cn } from "../../lib/cn";
import { GuildSwitcher } from "./GuildSwitcher";
import { EntityImage } from "../EntityImage";
import { GuildIcon } from "../GuildIcon";
import { useGuildStore } from "../../stores/guilds";
import { useAppStore } from "../../userstore";
import {
  capabilitiesForRole,
  membershipForUser,
} from "../../lib/guildPermissions";
import { useGuildModalsStore } from "../../stores/guildModals";

export function GuildHero({ guild }: { guild: Guild }) {
  const xpPct = Math.min(100, Math.round((guild.xp / guild.xpMax) * 100));
  const members = useGuildStore((state) => state.members);
  const discordOverrides = useGuildStore((state) => state.discordOverrides);
  const setHubTab = useGuildStore((state) => state.setHubTab);
  const userId = useAppStore((state) => state.currentUser?.id ?? "");
  const openModal = useGuildModalsStore((state) => state.open);
  const membership = membershipForUser(members, guild.id, userId);
  const capabilities = capabilitiesForRole(membership?.role);
  const online = members.filter(
    (member) => member.guildId === guild.id && member.status === "online",
  ).length;
  const serverCount = serversForGuild(guild.id).length;
  const discordSource = discordSourceForGuild(guild.id, discordOverrides);
  const hasDiscord = hasDiscordSource(discordSource);

  return (
    <section className="cf-panel rounded-xl overflow-hidden relative min-h-50">
      <EntityImage
        kind="guild"
        entityId={guild.id}
        source={guild.banner}
        alt={`${guild.name} guild artwork`}
        className="absolute inset-0 h-full w-full"
      />
      <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/50 to-black/25" />
      <div className="absolute inset-0 bg-linear-to-r from-black/70 via-black/20 to-transparent" />

      <div className="relative z-10 flex flex-col min-h-50">
        {/* Toolbar: guild switcher */}
        <div className="flex items-center gap-3 px-3.5 py-2.5 border-b border-white/8 bg-black/45">
          <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-text-disabled shrink-0 hidden sm:block">
            Your guilds
          </span>
          <div className="min-w-0 flex-1">
            <GuildSwitcher embedded />
          </div>
        </div>

        {/* Identity */}
        <div className="flex flex-1 items-end gap-4 p-4 pt-5">
          <GuildIcon
            src={guild.icon}
            name={guild.name}
            className={cn(
              "h-18 w-18 rounded-2xl border border-white/20 bg-linear-to-br text-bg-app text-[18px]",
              guild.accent,
            )}
          />

          <div className="flex-1 min-w-0 pb-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-sora text-[22px] font-bold text-white truncate">
                {guild.name}
              </h2>
              <Chip size="sm" variant="soft" color="success">
                <Chip.Label className="text-[10px] font-mono text-primary-base">
                  [{guild.tag}]
                </Chip.Label>
              </Chip>
              {membership && (
                <Chip size="sm" variant="soft" color="default">
                  <Chip.Label className="text-[9px]">
                    Your role: {membership.role}
                  </Chip.Label>
                </Chip>
              )}
            </div>
            <p className="text-[13px] text-white/65 mt-1 max-w-xl line-clamp-2">
              {guild.motto}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatChip label="Level" value={String(guild.level)} />
              <StatChip label="Members" value={String(guild.memberCount)} />
              <StatChip label="Online" value={String(online)} accent />
              <StatChip label="Servers" value={String(serverCount)} />
            </div>

            <div className="mt-3 max-w-md">
              <div className="flex justify-between text-[10px] text-white/45 mb-1">
                <span>Season XP</span>
                <span className="tabular-nums">
                  {guild.xp.toLocaleString()} / {guild.xpMax.toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-linear-to-r from-primary-muted to-primary-base"
                  style={{ width: `${xpPct}%` }}
                />
              </div>
            </div>
          </div>

          <div className="hidden sm:flex flex-col gap-2 shrink-0 self-end">
            {hasDiscord && (
              <button
                type="button"
                onClick={() => setHubTab("Discord")}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-[12px] font-semibold border border-[#5865F2]/35 bg-[#5865F2]/10 text-white hover:bg-[#5865F2]/20 cursor-pointer"
              >
                <Icon icon={AppIcons.Discord} size={14} />
                Open Discord
              </button>
            )}
            {capabilities.inviteMembers && (
              <button
                type="button"
                onClick={() => openModal("invite")}
                className="cf-btn-primary px-5 py-2.5 rounded-lg text-[12px] font-semibold cursor-pointer"
              >
                Invite
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                capabilities.openManagement
                  ? setHubTab("Manage")
                  : openModal("leave")
              }
              className="px-5 py-2 text-[11px] font-semibold rounded-lg border border-white/15 text-white/60 hover:text-white hover:bg-white/6 cursor-pointer"
            >
              {capabilities.openManagement ? "Manage Guild" : "Leave Guild"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="px-2.5 py-1 rounded-md border border-white/10 bg-black/35 backdrop-blur-sm">
      <span className="text-[9px] uppercase tracking-wider text-white/40 mr-1.5">
        {label}
      </span>
      <span
        className={cn(
          "text-[12px] font-semibold tabular-nums",
          accent ? "text-primary-base" : "text-white/90",
        )}
      >
        {value}
      </span>
    </div>
  );
}
