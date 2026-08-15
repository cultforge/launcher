export type TimedEventSchedule = {
  startsAt: string;
  endsAt?: string;
  timeZone?: string;
};

export type EventPhase = "upcoming" | "live" | "ended" | "invalid";

export type ParsedEventSchedule = {
  startsAtMs: number;
  endsAtMs: number | null;
};

const OFFSET_SUFFIX = /(?:Z|[+-]\d{2}:\d{2})$/i;

export function parseEventSchedule(
  event: TimedEventSchedule,
): ParsedEventSchedule | null {
  if (!OFFSET_SUFFIX.test(event.startsAt)) {
    return null;
  }

  const startsAtMs = Date.parse(event.startsAt);
  if (!Number.isFinite(startsAtMs)) return null;

  if (!event.endsAt) {
    return { startsAtMs, endsAtMs: null };
  }
  if (!OFFSET_SUFFIX.test(event.endsAt)) return null;
  const endsAtMs = Date.parse(event.endsAt);
  if (!Number.isFinite(endsAtMs) || endsAtMs <= startsAtMs) return null;
  return { startsAtMs, endsAtMs };
}

export function getEventPhase(
  event: TimedEventSchedule,
  now: number,
): EventPhase {
  const schedule = parseEventSchedule(event);
  if (!schedule) return "invalid";
  if (now < schedule.startsAtMs) return "upcoming";
  if (schedule.endsAtMs == null || now < schedule.endsAtMs) return "live";
  return "ended";
}

export function getEventDeadline(
  event: TimedEventSchedule,
  now: number,
): number | null {
  const schedule = parseEventSchedule(event);
  if (!schedule) return null;
  if (now < schedule.startsAtMs) return schedule.startsAtMs;
  if (schedule.endsAtMs != null && now < schedule.endsAtMs) {
    return schedule.endsAtMs;
  }
  return null;
}

export function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const time = [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
  return days > 0 ? `${days}d ${time}` : time;
}

export function formatEventDate(event: TimedEventSchedule): string {
  const schedule = parseEventSchedule(event);
  if (!schedule) return "Schedule unavailable";
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: event.timeZone,
      timeZoneName: "short",
    }).format(schedule.startsAtMs);
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(schedule.startsAtMs);
  }
}

export function compareTimedEvents(
  left: TimedEventSchedule,
  right: TimedEventSchedule,
): number {
  const leftSchedule = parseEventSchedule(left);
  const rightSchedule = parseEventSchedule(right);
  if (!leftSchedule && !rightSchedule) return 0;
  if (!leftSchedule) return 1;
  if (!rightSchedule) return -1;
  return leftSchedule.startsAtMs - rightSchedule.startsAtMs;
}
