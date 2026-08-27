import { Chip } from "@heroui/react";
import { useNow } from "../../../lib/clock";
import {
  compareTimedEvents,
  getEventPhase,
} from "../../../lib/timedEvents";
import { useGuildStore } from "../../../stores/guilds";
import { EventCountdown } from "../../events/EventCountdown";
import { useGuildModalsStore } from "../../../stores/guildModals";
import { useAppStore } from "../../../userstore";
import {
  capabilitiesForRole,
  membershipForUser,
} from "../../../lib/guildPermissions";
import { eventTypeLabel } from "../../../data/guilds";
import { CoverImage } from "../../CoverImage";
import { ContentLinks, RichMarkdown } from "../../RichMarkdown";
import { CopyButton, ShareDeepLinkButton } from "../../CopyButton";

export function EventsPanel() {
  const guildId = useGuildStore((state) => state.activeGuildId);
  const events = useGuildStore((state) => state.events);
  const members = useGuildStore((state) => state.members);
  const rsvps = useGuildStore((state) => state.rsvps);
  const toggleRsvp = useGuildStore((state) => state.toggleRsvp);
  const focusEventId = useGuildStore((state) => state.focusEventId);
  const focusEvent = useGuildStore((state) => state.focusEvent);
  const clearContentFocus = useGuildStore((state) => state.clearContentFocus);
  const userId = useAppStore((state) => state.currentUser?.id ?? "");
  const openModal = useGuildModalsStore((state) => state.open);
  const capabilities = capabilitiesForRole(
    membershipForUser(members, guildId, userId)?.role,
  );
  const now = useNow();
  const all = events
    .filter((event) => event.guildId === guildId)
    .sort(compareTimedEvents);
  const focused = focusEventId
    ? all.find((event) => event.id === focusEventId)
    : null;
  const live = all.filter((event) => getEventPhase(event, now) === "live");
  const upcoming = all.filter(
    (event) => getEventPhase(event, now) === "upcoming",
  );
  const ended = all
    .filter((event) => getEventPhase(event, now) === "ended")
    .reverse();
  const invalid = all.filter(
    (event) => getEventPhase(event, now) === "invalid",
  );
  const active = [...live, ...upcoming].filter(
    (event) => event.id !== focused?.id,
  );

  if (focused) {
    const phase = getEventPhase(focused, now);
    return (
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => clearContentFocus()}
          className="self-start text-[11px] text-text-muted hover:text-text-primary cursor-pointer"
        >
          ← All events
        </button>
        <article className="cf-panel overflow-hidden rounded-xl">
          {focused.coverUrl ? (
            <CoverImage
              src={focused.coverUrl}
              alt=""
              className="max-h-56 border-b border-white/8"
            />
          ) : null}
          <div className="flex flex-col gap-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Chip
                size="sm"
                variant="soft"
                color={phase === "live" ? "success" : "default"}
              >
                <Chip.Label className="text-[9px] capitalize">
                  {eventTypeLabel(focused)}
                </Chip.Label>
              </Chip>
              {phase === "live" && (
                <span className="text-[8px] font-bold uppercase tracking-wider text-primary-base">
                  Live
                </span>
              )}
              {capabilities.manageEvents && (
                <button
                  type="button"
                  onClick={() => openModal("event", focused.id)}
                  className="ml-auto text-[10px] text-text-muted hover:text-text-primary cursor-pointer"
                >
                  Edit
                </button>
              )}
            </div>
            <h2 className="font-sora text-[20px] font-bold text-text-primary">
              {focused.title}
            </h2>
            {focused.tagline ? (
              <p className="text-[13px] text-text-muted">{focused.tagline}</p>
            ) : null}
            <EventCountdown event={focused} title={focused.title} />
            {focused.location ? (
              <p className="text-[12px] text-text-secondary">
                {focused.location}
              </p>
            ) : null}
            {focused.body ? (
              <RichMarkdown
                source={focused.body}
                format={focused.bodyFormat ?? "markdown"}
              />
            ) : null}
            <ContentLinks links={focused.links} />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void toggleRsvp(guildId, focused.id)}
                className="cf-btn-primary w-fit rounded-lg px-3 py-2 text-[11px] cursor-pointer"
              >
                {phase === "live"
                  ? "Join now"
                  : rsvps[focused.id]
                    ? "Going"
                    : "RSVP"}
              </button>
              {focused.deepLink ? (
                <CopyButton
                  text={focused.deepLink}
                  label="Copy deep link"
                  successMessage="Deep link copied"
                />
              ) : guildId ? (
                <ShareDeepLinkButton
                  link={{
                    kind: "guild-events",
                    guildId,
                    eventId: focused.id,
                  }}
                />
              ) : null}
            </div>
          </div>
        </article>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {capabilities.manageEvents && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => openModal("event")}
            className="cf-btn-primary rounded-lg px-3 py-2 text-[10px] font-semibold cursor-pointer"
          >
            Create event
          </button>
        </div>
      )}
      {live.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-primary-base/25 bg-primary-base/7 px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-primary-base" />
          <span className="text-[10px] font-semibold text-primary-base">
            {live.length} event{live.length === 1 ? "" : "s"} live now
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {active.length === 0 ? (
          <div className="cf-panel rounded-xl px-4 py-10 text-center text-[13px] text-text-muted sm:col-span-2 xl:col-span-3">
            No upcoming events
          </div>
        ) : (
          active.map((event) => {
            const phase = getEventPhase(event, now);
            return (
              <article
                key={event.id}
                className="cf-panel flex min-h-44 flex-col overflow-hidden rounded-xl"
              >
                {event.coverUrl ? (
                  <CoverImage
                    src={event.coverUrl}
                    alt=""
                    className="h-28 border-b border-white/8"
                  />
                ) : null}
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Chip
                      size="sm"
                      variant="soft"
                      color={phase === "live" ? "success" : "default"}
                    >
                      <Chip.Label className="text-[9px] capitalize">
                        {eventTypeLabel(event)}
                      </Chip.Label>
                    </Chip>
                    {phase === "live" && (
                      <span className="text-[8px] font-bold uppercase tracking-wider text-primary-base">
                        Live
                      </span>
                    )}
                    {capabilities.manageEvents && (
                      <button
                        type="button"
                        onClick={() => openModal("event", event.id)}
                        className="text-[8px] font-semibold text-text-muted hover:text-text-primary cursor-pointer"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => focusEvent(event.id)}
                    className="text-left cursor-pointer"
                  >
                    <h3 className="font-sora text-[15px] font-bold text-text-primary">
                      {event.title}
                    </h3>
                    {event.tagline ? (
                      <p className="mt-0.5 text-[11px] text-text-muted line-clamp-2">
                        {event.tagline}
                      </p>
                    ) : null}
                  </button>
                  <EventCountdown event={event} title={event.title} />
                  <button
                    type="button"
                    onClick={() => void toggleRsvp(guildId, event.id)}
                    className="cf-btn-primary mt-auto w-fit rounded-lg px-3 py-2 text-[11px] cursor-pointer"
                  >
                    {phase === "live"
                      ? "Join now"
                      : rsvps[event.id]
                        ? "Going"
                        : "RSVP"}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>

      {(ended.length > 0 || invalid.length > 0) && (
        <section className="flex flex-col gap-1.5">
          <h3 className="px-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            Past
          </h3>
          <div className="cf-panel flex flex-col gap-0.5 rounded-xl p-1.5">
            {[...ended, ...invalid].map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => focusEvent(event.id)}
                className="flex justify-between gap-2 rounded-lg px-3 py-2.5 text-[12px] text-text-muted hover:bg-white/4 text-left cursor-pointer"
              >
                <span>{event.title}</span>
                <EventCountdown
                  event={event}
                  title={event.title}
                  variant="compact"
                  className="shrink-0"
                />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
