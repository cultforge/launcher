import { Icon } from "../../ico";
import { AppIcons } from "../../icons";
import { useGuildStore } from "../../../stores/guilds";
import { Chip } from "@heroui/react";
import { cn } from "../../../lib/cn";
import { useNow } from "../../../lib/clock";
import {
  compareTimedEvents,
  getEventPhase,
} from "../../../lib/timedEvents";
import { EventCountdown } from "../../events/EventCountdown";
import { toast } from "sonner";

function PanelHeader({
  title,
  action,
  onAction,
  icon,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  icon: typeof AppIcons.Activity;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="h-7 w-7 rounded-lg border border-white/8 bg-white/3 flex items-center justify-center text-primary-base shrink-0">
          <Icon icon={icon} size={13} />
        </span>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
          {title}
        </h3>
      </div>
      {action && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="text-[11px] font-semibold text-primary-base cursor-pointer hover:underline shrink-0"
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
  const rankings = useGuildStore((s) => s.rankings);
  const allServers = useGuildStore((s) => s.servers);
  const toggleRsvp = useGuildStore((s) => s.toggleRsvp);
  const now = useNow();
  const scheduledEvents = events
    .filter((event) => event.guildId === guildId)
    .sort(compareTimedEvents);
  const nextEvent =
    scheduledEvents.find((event) => getEventPhase(event, now) === "live") ??
    scheduledEvents.find((event) => getEventPhase(event, now) === "upcoming");
  const pinned = news.find((item) => item.guildId === guildId && item.pinned);
  const top = rankings
    .filter((row) => row.guildId === guildId && row.metric === "xp")
    .slice(0, 5);
  const online = members.filter(
    (member) => member.guildId === guildId && member.status === "online",
  );
  const servers = allServers.filter((server) => server.guildId === guildId);

  return (
    <div className="flex flex-col gap-3">
      {/* Spotlight row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <section className="lg:col-span-5 cf-panel rounded-xl p-4 flex flex-col gap-3 min-h-45">
          <PanelHeader
            title="Next event"
            action="View all"
            onAction={() => setHubTab("Events")}
            icon={AppIcons.Activity}
          />
          {nextEvent ? (
            <div className="flex-1 flex flex-col justify-center gap-2">
              <Chip size="sm" variant="soft" color="success">
                <Chip.Label className="text-[9px] capitalize text-primary-base">
                  {nextEvent.type}
                </Chip.Label>
              </Chip>
              <div className="font-sora text-[20px] font-bold text-text-primary leading-tight">
                {nextEvent.title}
              </div>
              <EventCountdown event={nextEvent} title={nextEvent.title} />
              <button
                type="button"
                onClick={() => {
                  void toggleRsvp(guildId, nextEvent.id).then((result) => {
                    if (result.ok) toast.success(result.message);
                    else toast.error(result.message);
                  });
                }}
                className="mt-2 w-fit cf-btn-primary px-4 py-2 rounded-lg text-[11px] cursor-pointer"
              >
                {getEventPhase(nextEvent, now) === "live" ? "Join now" : "RSVP"}
              </button>
            </div>
          ) : (
            <p className="text-[13px] text-text-muted flex-1 flex items-center">
              No upcoming events
            </p>
          )}
        </section>

        <section className="lg:col-span-7 cf-panel rounded-xl p-4 flex flex-col gap-3 min-h-45">
          <PanelHeader
            title="Pinned announcement"
            action="News"
            onAction={() => setHubTab("News")}
            icon={AppIcons.Newspaper}
          />
          {pinned ? (
            <div className="flex-1 flex flex-col gap-2">
              <h4 className="text-[16px] font-sora font-bold text-text-primary">
                {pinned.title}
              </h4>
              {pinned.tagline ? (
                <p className="text-[12px] text-text-muted">{pinned.tagline}</p>
              ) : null}
              <div className="line-clamp-4 text-[13px] text-text-secondary leading-relaxed">
                {pinned.body}
              </div>
              <span className="text-[11px] text-text-disabled mt-auto">
                {pinned.when}
              </span>
            </div>
          ) : (
            <p className="text-[13px] text-text-muted">No pinned posts</p>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <section className="cf-panel rounded-xl p-4 flex flex-col">
          <PanelHeader
            title="Leaderboard"
            action="Full ranks"
            onAction={() => setHubTab("Rankings")}
            icon={AppIcons.Star}
          />
          <div className="flex flex-col gap-1">
            {top.map((r) => (
              <div
                key={r.rank}
                className={cn(
                  "flex items-center gap-3 px-2.5 py-2 rounded-lg",
                  r.rank === 1 && "bg-primary-base/8 border border-primary-base/20",
                )}
              >
                <span
                  className={cn(
                    "w-7 text-[12px] font-bold tabular-nums",
                    r.rank === 1 ? "text-primary-base" : "text-text-muted",
                  )}
                >
                  #{r.rank}
                </span>
                <span className="flex-1 text-[13px] text-text-primary font-medium truncate">
                  {r.name}
                </span>
                <span className="text-[12px] text-text-secondary tabular-nums">
                  {r.score}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="cf-panel rounded-xl p-4 flex flex-col">
          <PanelHeader
            title="Online members"
            action="Roster"
            onAction={() => setHubTab("Members")}
            icon={AppIcons.Users}
          />
          <div className="flex items-end gap-2 mb-3">
            <span className="text-3xl font-sora font-bold text-primary-base tabular-nums">
              {online.length}
            </span>
            <span className="text-[12px] text-text-muted pb-1">active now</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {online.slice(0, 8).map((m) => (
              <span
                key={m.id}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-white/8 bg-white/2 text-[11px] text-text-secondary"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-primary-base" />
                {m.name}
              </span>
            ))}
          </div>
        </section>

        <section className="cf-panel rounded-xl p-4 flex flex-col md:col-span-2 xl:col-span-1">
          <PanelHeader
            title="Linked servers"
            action="Open"
            onAction={() => setHubTab("Servers")}
            icon={AppIcons.Servers}
          />
          <div className="flex flex-col gap-1.5 flex-1">
            {servers.length === 0 ? (
              <p className="text-[13px] text-text-muted">No servers linked</p>
            ) : (
              servers.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setHubTab("Servers")}
                  className="text-left rounded-lg border border-white/[0.07] px-3 py-2.5 hover:bg-bg-elevated cursor-pointer transition-colors"
                >
                  <div className="text-[13px] text-text-primary font-medium truncate">
                    {s.name}
                  </div>
                  <div className="text-[11px] text-text-muted mt-0.5 flex gap-2">
                    <span>
                      {s.playersOnline}/{s.playersMax}
                    </span>
                    <span className="text-primary-base">{s.pingMs} ms</span>
                    <span className="text-text-disabled">{s.region}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
