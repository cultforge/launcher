import { useNow } from "../../../lib/clock";
import { getEventPhase } from "../../../lib/timedEvents";
import { hasDiscordSource } from "../../../lib/discordWidget";
import { discordSourceForGuild, getGuild } from "../../../data/guilds";
import {
  useGuildStore,
  type ManageSectionId,
} from "../../../stores/guilds";

type Props = {
  onJump: (section: ManageSectionId) => void;
};

export function ManageOverview({ onJump }: Props) {
  const guildId = useGuildStore((state) => state.activeGuildId);
  const members = useGuildStore((state) => state.members);
  const events = useGuildStore((state) => state.events);
  const news = useGuildStore((state) => state.news);
  const servers = useGuildStore((state) => state.servers);
  const builds = useGuildStore((state) => state.buildReleases);
  const audit = useGuildStore((state) => state.audit);
  const discordOverrides = useGuildStore((state) => state.discordOverrides);
  const now = useNow();
  const guild = getGuild(guildId);

  if (!guild) {
    return (
      <div className="cf-panel rounded-xl p-4 text-[12px] text-text-muted">
        No guild selected.
      </div>
    );
  }

  const online = members.filter(
    (member) => member.guildId === guildId && member.status === "online",
  ).length;
  const upcoming = events.filter(
    (event) =>
      event.guildId === guildId && getEventPhase(event, now) === "upcoming",
  ).length;
  const pinned = news.filter(
    (item) => item.guildId === guildId && item.pinned,
  ).length;
  const onlineServers = servers.filter(
    (server) => server.guildId === guildId && server.status === "online",
  ).length;
  const publishedBuilds = builds.filter(
    (release) => release.guildId === guildId,
  ).length;
  const discordOk = hasDiscordSource(
    discordSourceForGuild(guildId, discordOverrides),
  );
  const recentAudit = audit
    .filter((entry) => entry.guildId === guildId)
    .slice(0, 8);

  const kpis: {
    label: string;
    value: string;
    section: ManageSectionId;
  }[] = [
    { label: "Members online", value: String(online), section: "roster" },
    { label: "Upcoming events", value: String(upcoming), section: "events" },
    { label: "Pinned news", value: String(pinned), section: "news" },
    {
      label: "Servers online",
      value: String(onlineServers),
      section: "servers",
    },
    {
      label: "Published builds",
      value: String(publishedBuilds),
      section: "builds",
    },
    {
      label: "Discord",
      value: discordOk ? "Configured" : "Missing",
      section: "discord",
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <section className="cf-panel rounded-xl p-4">
        <h3 className="font-sora text-[14px] font-bold text-text-primary">
          {guild.name} overview
        </h3>
        <p className="mt-1 text-[10px] text-text-muted">
          Session KPIs for [{guild.tag}] — jump into a module to edit.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-3">
          {kpis.map((kpi) => (
            <button
              key={kpi.label}
              type="button"
              onClick={() => onJump(kpi.section)}
              className="rounded-lg border border-border-subtle bg-black/15 px-3 py-3 text-left transition-colors hover:border-primary-base/30 cursor-pointer"
            >
              <div className="text-[8px] uppercase tracking-wider text-text-muted">
                {kpi.label}
              </div>
              <div className="mt-1 text-[15px] font-semibold text-text-primary">
                {kpi.value}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="cf-panel rounded-xl p-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[11px] font-semibold text-text-primary">
            Recent audit
          </h4>
          <button
            type="button"
            onClick={() => onJump("roster")}
            className="text-[9px] text-primary-base cursor-pointer"
          >
            Roster & audit
          </button>
        </div>
        <div className="mt-2 flex flex-col gap-1.5">
          {recentAudit.length === 0 ? (
            <p className="text-[10px] text-text-muted">No management actions yet.</p>
          ) : (
            recentAudit.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle/70 bg-black/10 px-2.5 py-1.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-[10px] text-text-secondary">
                    {entry.action}
                    <span className="text-text-muted"> · {entry.target}</span>
                  </div>
                </div>
                <span className="shrink-0 text-[8px] text-text-muted">
                  {new Date(entry.occurredAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
