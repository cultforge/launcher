import { joinedGuilds } from "../../data/guilds";
import { useGuildStore } from "../../stores/guilds";
import { useGuildModalsStore } from "../../stores/guildModals";
import { cn } from "../../lib/cn";
import { useAppStore } from "../../userstore";
import { GuildIcon } from "../GuildIcon";

export function GuildSwitcher({ embedded = false }: { embedded?: boolean }) {
  const activeGuildId = useGuildStore((s) => s.activeGuildId);
  const setActiveGuild = useGuildStore((s) => s.setActiveGuild);
  const discoverOpen = useGuildStore((s) => s.discoverOpen);
  const setDiscoverOpen = useGuildStore((s) => s.setDiscoverOpen);
  const openGuildModal = useGuildModalsStore((s) => s.open);
  const members = useGuildStore((s) => s.members);
  const catalogRevision = useGuildStore((s) => s.guildCatalogRevision);
  const userId = useAppStore((s) => s.currentUser?.id ?? "");
  void catalogRevision;
  const joinedIds = new Set(
    members
      .filter((member) => member.userId === userId)
      .map((member) => member.guildId),
  );
  const catalog = joinedGuilds();
  const joined = catalog.filter((guild) => joinedIds.has(guild.id));

  const pillClass = (active: boolean) =>
    cn(
      "shrink-0 flex items-center gap-2 rounded-lg border cursor-pointer transition-colors",
      embedded ? "pl-1 pr-2.5 py-1" : "pl-1 pr-3 py-1.5",
      active
        ? "border-primary-base/45 bg-primary-base/12 text-primary-base"
        : "border-white/8 bg-white/[0.02] text-text-muted hover:border-white/14 hover:bg-white/[0.04] hover:text-text-secondary",
    );

  return (
    <div
      className={cn(
        "flex items-center gap-2",
        embedded ? "overflow-x-auto scroll-hidden" : "guild-switcher",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto scroll-hidden">
        {joined.map((g) => {
          const active = g.id === activeGuildId && !discoverOpen;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                setActiveGuild(g.id);
                setDiscoverOpen(false);
              }}
              className={pillClass(active)}
            >
              <GuildIcon
                src={g.icon}
                name={g.name}
                className={cn(
                  "rounded-md bg-linear-to-br text-bg-app",
                  embedded ? "h-6 w-6 text-[8px]" : "h-7 w-7 text-[9px]",
                  g.accent,
                )}
              />
              <span
                className={cn(
                  "font-semibold whitespace-nowrap",
                  embedded ? "text-[12px]" : "text-[13px]",
                )}
              >
                {g.name}
              </span>
            </button>
          );
        })}
      </div>

      <span className="h-5 w-px shrink-0 bg-white/10" aria-hidden />

      <button
        type="button"
        onClick={() => setDiscoverOpen(true)}
        className={cn(
          "shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-semibold cursor-pointer transition-colors",
          discoverOpen
            ? "border-primary-base/40 bg-primary-base/10 text-primary-base"
            : "border-white/10 text-text-muted hover:border-white/16 hover:text-text-secondary",
        )}
      >
        Discover
      </button>
      <button
        type="button"
        onClick={() => openGuildModal("create")}
        className="cf-btn-primary shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold cursor-pointer"
      >
        Create
      </button>
    </div>
  );
}
