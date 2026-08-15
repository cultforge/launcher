import { useEffect, useMemo, useRef, useState } from "react";
import { useNow } from "../../lib/clock";
import { cn } from "../../lib/cn";
import {
  formatCountdown,
  formatEventDate,
  getEventDeadline,
  getEventPhase,
  type EventPhase,
  type TimedEventSchedule,
} from "../../lib/timedEvents";

function phaseText(
  phase: EventPhase,
  deadline: number | null,
  now: number,
) {
  if (phase === "upcoming" && deadline !== null) {
    return `Starts in ${formatCountdown(deadline - now)}`;
  }
  if (phase === "live" && deadline !== null) {
    return `Live · Ends in ${formatCountdown(deadline - now)}`;
  }
  if (phase === "live") return "Live";
  if (phase === "ended") return "Ended";
  return "Schedule unavailable";
}

export function EventCountdown({
  event,
  title,
  variant = "full",
  className,
}: {
  event: TimedEventSchedule;
  title: string;
  variant?: "compact" | "full";
  className?: string;
}) {
  const now = useNow();
  const phase = getEventPhase(event, now);
  const deadline = getEventDeadline(event, now);
  const label = phaseText(phase, deadline, now);
  const scheduleLabel = useMemo(
    () => formatEventDate(event),
    [event.endsAt, event.startsAt, event.timeZone],
  );
  const previousPhase = useRef(phase);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (previousPhase.current !== phase) {
      if (phase === "live") setAnnouncement(`${title} is now live.`);
      else if (phase === "ended") setAnnouncement(`${title} has ended.`);
      previousPhase.current = phase;
    }
  }, [phase, title]);

  return (
    <div className={cn("min-w-0", className)}>
      <div
        aria-hidden="true"
        className={cn(
          "font-semibold tabular-nums",
          variant === "compact" ? "text-[9px]" : "text-[12px]",
          phase === "live"
            ? "text-primary-base"
            : phase === "ended" || phase === "invalid"
              ? "text-text-disabled"
              : "text-text-secondary",
        )}
      >
        {label}
      </div>
      {variant === "full" && (
        <div className="mt-1 text-[9px] text-text-muted">{scheduleLabel}</div>
      )}
      <span className="sr-only">
        {label}. {scheduleLabel}
      </span>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
