import { Icon } from "../../ico";
import { AppIcons } from "../../icons";
import { hasDiscordSource } from "../../../lib/discordWidget";
import { discordSourceForGuild, getGuild } from "../../../data/guilds";
import { getEventPhase } from "../../../lib/timedEvents";
import { useNow } from "../../../lib/clock";
import {
  manageNudges,
  manageSectionGroups,
  type ManageSection,
} from "../../../lib/manageSections";
import {
  useGuildStore,
  type ManageSectionId,
} from "../../../stores/guilds";

function SectionTile({
  section,
  onSelect,
}: {
  section: ManageSection;
  onSelect: () => void;
}) {
  const IconComp = AppIcons[section.icon];
  if (!IconComp) return null;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="guild-manage-card group flex cursor-pointer items-center gap-3.5 p-4 text-left transition-all"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-base/10 text-primary-base transition-colors group-hover:bg-primary-base/16">
        <Icon icon={IconComp} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-sora text-[14px] font-semibold text-text-primary">
          {section.title}
        </span>
        <span className="mt-0.5 block text-[12px] leading-snug text-text-muted">
          {section.description}
        </span>
      </span>
      <Icon
        icon={AppIcons.ChevronRight}
        size={14}
        className="shrink-0 text-text-disabled transition-transform group-hover:translate-x-0.5 group-hover:text-text-muted"
      />
    </button>
  );
}

type Props = {
  onJump: (section: ManageSectionId) => void;
};

export function ManageOverview({ onJump }: Props) {
  const guildId = useGuildStore((state) => state.activeGuildId);
  const events = useGuildStore((state) => state.events);
  const news = useGuildStore((state) => state.news);
  const audit = useGuildStore((state) => state.audit);
  const discordOverrides = useGuildStore((state) => state.discordOverrides);
  const now = useNow();
  const guild = getGuild(guildId);

  if (!guild) {
    return (
      <p className="text-[13px] text-text-muted">No guild selected.</p>
    );
  }

  const discordOk = hasDiscordSource(
    discordSourceForGuild(guildId, discordOverrides),
  );
  const upcomingEvents = events.filter(
    (event) =>
      event.guildId === guildId && getEventPhase(event, now) === "upcoming",
  ).length;
  const pinnedNews = news.filter(
    (item) => item.guildId === guildId && item.pinned,
  ).length;
  const nudges = manageNudges({ discordOk, upcomingEvents, pinnedNews });
  const recentAudit = audit
    .filter((entry) => entry.guildId === guildId)
    .slice(0, 4);
  const groups = manageSectionGroups();

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div>
        <h3 className="font-sora text-[22px] font-bold text-text-primary">
          Guild settings
        </h3>
        <p className="mt-2 max-w-lg text-[14px] leading-relaxed text-text-secondary">
          Set up how {guild.name} looks, what members see, and where everyone
          plays — pick a topic below.
        </p>
      </div>

      {nudges.length > 0 ? (
        <div className="flex flex-col gap-2">
          {nudges.map((nudge) => (
            <button
              key={nudge.section}
              type="button"
              onClick={() => onJump(nudge.section)}
              className="guild-nudge flex w-full cursor-pointer items-center justify-between gap-4 rounded-xl px-4 py-3.5 text-left transition-colors"
            >
              <span className="text-[13px] text-text-secondary">
                {nudge.message}
              </span>
              <span className="shrink-0 text-[12px] font-semibold text-primary-base">
                {nudge.action}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {groups.map((group) => (
        <section key={group.title} className="flex flex-col gap-3">
          <h4 className="guild-section-label">{group.title}</h4>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {group.sections.map((section) => (
              <SectionTile
                key={section.id}
                section={section}
                onSelect={() => onJump(section.id)}
              />
            ))}
          </div>
        </section>
      ))}

      {recentAudit.length > 0 ? (
        <section className="flex flex-col gap-2 border-t border-white/6 pt-6">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[13px] font-semibold text-text-secondary">
              Recent changes
            </h4>
            <button
              type="button"
              onClick={() => onJump("roster")}
              className="cursor-pointer text-[12px] font-semibold text-primary-base hover:underline"
            >
              View all
            </button>
          </div>
          <ul className="flex flex-col gap-1.5">
            {recentAudit.map((entry) => (
              <li
                key={entry.id}
                className="text-[12px] text-text-muted"
              >
                <span className="text-text-secondary">{entry.action}</span>
                {" · "}
                {entry.target}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
