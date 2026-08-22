import { useEffect } from "react";
import { useGuildStore } from "../../../stores/guilds";
import { useGuildAgentPresenceStore } from "../../../stores/guildAgentPresence";
import { useNow } from "../../../lib/clock";
import {
  compareTimedEvents,
  getEventPhase,
} from "../../../lib/timedEvents";
import { EventCountdown } from "../../events/EventCountdown";
import { useGuildUiPreferences } from "../../../lib/guildUi";
import { cn } from "../../../lib/cn";

function SectionLabel({ children }: { children: string }) {
  return <h3 className="cf-guild-section-title">{children}</h3>;
}

function CompactEmpty({
  message,
  action,
  onAction,
}: {
  message: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-1">
      <p className="text-[13px] text-text-muted">{message}</p>
      {action && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="cursor-pointer text-[12px] font-semibold text-primary-base hover:underline"
        >
          {action}
        </button>
      )}
    </div>
  );
}

export function OverviewPanel() {
  const guildId = useGuildStore((s) => s.activeGuildId);
  const setHubTab = useGuildStore((s) => s.setHubTab);
  const events = useGuildStore((s) => s.events);
  const news = useGuildStore((s) => s.news);
  const members = useGuildStore((s) => s.members);
  const allServers = useGuildStore((s) => s.servers);
  const presenceByServer = useGuildAgentPresenceStore((s) => s.byServerId);
  const ensurePresence = useGuildAgentPresenceStore((s) => s.ensurePolling);
  const { compactCards } = useGuildUiPreferences();
  const now = useNow();

  useEffect(() => {
    ensurePresence(guildId || null);
  }, [guildId, ensurePresence]);

  const scheduledEvents = events
    .filter((event) => event.guildId === guildId)
    .sort(compareTimedEvents);
  const nextEvent =
    scheduledEvents.find((event) => getEventPhase(event, now) === "live") ??
    scheduledEvents.find((event) => getEventPhase(event, now) === "upcoming");
  const pinned = news.find((item) => item.guildId === guildId && item.pinned);
  const online = members.filter(
    (member) => member.guildId === guildId && member.status === "online",
  );
  const servers = allServers.filter((server) => server.guildId === guildId);
  const cardPad = compactCards ? "p-3" : "p-4";

  return (
    <div className="flex flex-col gap-6 pt-1">
      <section className="flex flex-col gap-3">
        <SectionLabel>What&apos;s happening</SectionLabel>
        <div className="flex flex-col gap-3 border-b border-white/6 pb-4">
          {nextEvent ? (
            <div className={cn("cf-guild-card", cardPad)}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-primary-base">
                Next event
              </div>
              <div className="mt-2 font-sora text-[18px] font-bold text-text-primary">
                {nextEvent.title}
              </div>
              <EventCountdown
                event={nextEvent}
                title={nextEvent.title}
                variant="compact"
                className="mt-1"
              />
              <button
                type="button"
                onClick={() => setHubTab("Events")}
                className="mt-3 cursor-pointer text-[12px] font-semibold text-primary-base hover:underline"
              >
                View all events
              </button>
            </div>
          ) : (
            <CompactEmpty
              message="No upcoming events"
              action="Browse events →"
              onAction={() => setHubTab("Events")}
            />
          )}

          {pinned ? (
            <div className={cn("cf-guild-card", cardPad)}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Pinned announcement
              </div>
              <div className="mt-2 font-sora text-[16px] font-bold text-text-primary">
                {pinned.title}
              </div>
              {pinned.tagline ? (
                <p className="mt-1 text-[12px] text-text-muted">{pinned.tagline}</p>
              ) : null}
              <button
                type="button"
                onClick={() => setHubTab("News")}
                className="mt-3 cursor-pointer text-[12px] font-semibold text-primary-base hover:underline"
              >
                Read in News
              </button>
            </div>
          ) : (
            <CompactEmpty
              message="No announcements"
              action="View news →"
              onAction={() => setHubTab("News")}
            />
          )}
        </div>
      </section>

      {(online.length > 0 || servers.length > 0) && (
        <section className="flex flex-col gap-3">
          <SectionLabel>Your guild</SectionLabel>
          <div className="flex flex-col gap-4">
            {online.length > 0 && (
              <div>
                <p className="mb-2 text-[12px] text-text-secondary">
                  {online.length} member{online.length === 1 ? "" : "s"} online
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {online.slice(0, 12).map((m) => (
                    <span
                      key={m.id}
                      className="inline-flex items-center gap-1.5 rounded-md border border-white/8 bg-white/2 px-2 py-1 text-[11px] text-text-secondary"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-primary-base" />
                      {m.name}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setHubTab("Members")}
                  className="mt-2 cursor-pointer text-[12px] font-semibold text-primary-base hover:underline"
                >
                  View roster →
                </button>
              </div>
            )}

            {servers.length > 0 && (
              <div>
                <p className="mb-2 text-[12px] text-text-secondary">
                  Linked server{servers.length === 1 ? "" : "s"}
                </p>
                <div className="flex flex-col gap-1.5">
                  {servers.slice(0, 3).map((s) => {
                    const presence = presenceByServer[s.id];
                    const count =
                      presence?.names.length ||
                      presence?.count ||
                      s.playersOnline;
                    const names = presence?.names ?? [];
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setHubTab("Servers")}
                        className="cursor-pointer rounded-lg border border-white/8 px-3 py-2.5 text-left transition-colors hover:bg-white/3"
                      >
                        <div className="truncate text-[13px] font-medium text-text-primary">
                          {s.name}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-text-muted">
                          <span>
                            {count}/{s.playersMax || "—"}
                          </span>
                          <span className="text-text-disabled">{s.region}</span>
                        </div>
                        {names.length > 0 ? (
                          <div className="mt-1 truncate text-[10px] text-text-secondary">
                            {names.slice(0, 4).join(", ")}
                            {names.length > 4 ? "…" : ""}
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
