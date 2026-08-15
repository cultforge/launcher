import { useEffect, useState } from "react";
import { joinedGuilds } from "../../data/guilds";
import {
  fetchDiscoverableGuilds,
  type DiscoverGuildCard,
} from "../../lib/cultApi";
import { useGuildStore } from "../../stores/guilds";
import { useGuildModalsStore } from "../../stores/guildModals";
import { cn } from "../../lib/cn";
import { useAppStore } from "../../userstore";
import { logger } from "../../lib/logger";
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

  const [discoverable, setDiscoverable] = useState<DiscoverGuildCard[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);

  useEffect(() => {
    if (!discoverOpen) return;
    let cancelled = false;
    setDiscoverLoading(true);
    void fetchDiscoverableGuilds()
      .then((list) => {
        if (cancelled) return;
        setDiscoverable(list.filter((g) => !joinedIds.has(g.id)));
      })
      .catch((err) => {
        if (cancelled) return;
        logger.warn(
          `Guild discover failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        setDiscoverable([]);
      })
      .finally(() => {
        if (!cancelled) setDiscoverLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [discoverOpen, catalogRevision, userId]);

  return (
    <div className={cn("flex flex-col gap-2", embedded && "gap-0")}>
      <div className="flex items-center gap-1.5 overflow-x-auto scroll-hidden">
        {joined.map((g) => {
          const active = g.id === activeGuildId;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                setActiveGuild(g.id);
                setDiscoverOpen(false);
              }}
              className={cn(
                "shrink-0 flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-lg border cursor-pointer transition-colors",
                active
                  ? "border-primary-base/50 bg-primary-base/15 text-primary-base"
                  : embedded
                    ? "border-white/10 text-white/55 hover:text-white hover:bg-white/6"
                    : "border-white/10 text-text-muted hover:text-text-primary hover:bg-white/3",
              )}
            >
              <GuildIcon
                src={g.icon}
                name={g.name}
                className={cn(
                  "h-6 w-6 rounded-md text-[8px] bg-linear-to-br text-bg-app",
                  g.accent,
                )}
              />
              <span className="text-[12px] font-semibold whitespace-nowrap">
                {g.name}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => openGuildModal("create")}
          className={cn(
            "shrink-0 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer",
            embedded
              ? "border-primary-base/40 text-primary-base/90 hover:bg-primary-base/15"
              : "border-primary-base/35 text-primary-base hover:bg-primary-base/10",
          )}
        >
          + Create
        </button>
        <button
          type="button"
          onClick={() => setDiscoverOpen(!discoverOpen)}
          className={cn(
            "shrink-0 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer",
            discoverOpen
              ? "border-primary-base/50 bg-primary-base/15 text-primary-base"
              : embedded
                ? "border-dashed border-white/20 text-white/45 hover:text-white"
                : "border-dashed border-white/15 text-text-muted hover:text-text-primary",
          )}
        >
          + Discover
        </button>
      </div>

      {discoverOpen && (
        <div
          className={cn(
            "rounded-xl p-2 flex flex-col gap-0.5 mt-2",
            embedded
              ? "bg-black/70 border border-white/10"
              : "cf-panel",
          )}
        >
          <div className="px-2.5 py-1.5 text-[9px] uppercase tracking-[0.14em] text-text-muted font-semibold">
            Public guilds
          </div>
          {discoverLoading ? (
            <div className="px-2.5 py-4 text-[12px] text-text-muted">
              Loading…
            </div>
          ) : discoverable.length === 0 ? (
            <div className="px-2.5 py-4 text-[12px] text-text-muted">
              No publicly listed guilds yet.
            </div>
          ) : (
            discoverable.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between gap-3 px-2.5 py-2.5 rounded-lg hover:bg-white/4"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <GuildIcon
                    src={g.icon_url}
                    name={g.name}
                    className="h-8 w-8 rounded-lg text-[9px] bg-primary-base/20 text-primary-base"
                  />
                  <div className="min-w-0">
                    <div className="text-[13px] text-text-primary font-medium truncate">
                      {g.name}
                    </div>
                    <div className="text-[10px] text-text-muted truncate">
                      {g.member_count ?? 0} members
                      {g.description ? ` · ${g.description}` : ""}
                    </div>
                  </div>
                </div>
                <span className="shrink-0 px-2 py-1 text-[9px] text-text-disabled">
                  Invite only
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
