import { useCallback, useEffect, useState } from "react";
import { listGuildAgentEvents, type CultAgentGameEvent } from "../../lib/cultAgentApi";
import { useGuildStore } from "../../stores/guilds";
import { logger } from "../../lib/logger";
import { Icon } from "../ico";
import { AppIcons } from "../icons";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "recently";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "recently";
  const delta = Date.now() - ms;
  const mins = Math.floor(delta / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return new Date(ms).toLocaleDateString();
}

function eventText(event: CultAgentGameEvent): string {
  const payload = event.payload ?? {};
  const detail =
    (typeof payload.message === "string" && payload.message) ||
    (typeof payload.summary === "string" && payload.summary) ||
    (typeof payload.text === "string" && payload.text) ||
    "";
  const who = event.minecraftName?.trim();
  const base = event.eventType.replace(/_/g, " ").trim() || "agent event";
  if (detail) return detail;
  if (who) return `${who}: ${base}`;
  return base;
}

type Props = {
  guildId?: string;
  compact?: boolean;
  max?: number;
};

export function ActivityFeedPanel({
  guildId: guildIdProp,
  compact = false,
  max = compact ? 6 : 40,
}: Props) {
  const activeGuildId = useGuildStore((s) => s.activeGuildId);
  const guildId = (guildIdProp || activeGuildId || "").trim();
  const [events, setEvents] = useState<CultAgentGameEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    if (!guildId) {
      setEvents([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await listGuildAgentEvents(guildId, max);
      setEvents(rows);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`Guild activity feed: ${message}`);
      setError(message);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [guildId, max]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <div className="flex flex-col gap-4">
      {!compact ? (
        <header className="cf-panel rounded-xl px-4 py-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h2 className="font-sora text-[18px] font-bold text-text-primary">
              Activity Feed
            </h2>
            <p className="text-[12px] text-text-muted mt-1 max-w-lg">
              Live CultAgent events from guild servers — joins, restarts, and
              gameplay signals.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              title="Refresh activity"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="cf-btn-ghost h-9 w-9 rounded-lg flex items-center justify-center cursor-pointer"
            >
              <Icon icon={AppIcons.Swap} className="h-4 w-4" />
            </button>
            <div className="text-right">
              <div className="text-2xl font-sora font-bold text-primary-base tabular-nums">
                {events.length}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted">
                recent
              </div>
            </div>
          </div>
        </header>
      ) : null}

      <div className="cf-panel rounded-xl p-2 flex flex-col gap-1">
        {compact ? (
          <div className="flex justify-end px-1 pt-1">
            <button
              type="button"
              title="Refresh activity"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="cf-btn-ghost h-7 w-7 rounded-md flex items-center justify-center cursor-pointer"
            >
              <Icon icon={AppIcons.Swap} className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
        {loading && events.length === 0 ? (
          <div className="px-3 py-8 text-center text-[13px] text-text-muted">
            Loading activity…
          </div>
        ) : error ? (
          <div className="px-3 py-6 text-center text-[13px] text-amber-200/90">
            {error}
          </div>
        ) : events.length === 0 ? (
          <div className="px-3 py-10 text-center text-[13px] text-text-muted">
            No agent activity yet. Events appear when a CultAgent reports from a
            linked server.
          </div>
        ) : (
          events.map((event, i) => (
            <div
              key={event.id || `${event.eventType}-${event.occurredAt}-${i}`}
              className="flex items-start gap-3 px-3 py-3 rounded-xl hover:bg-bg-elevated transition-colors"
            >
              <div className="flex flex-col items-center pt-1.5">
                <span className="h-2 w-2 rounded-full bg-primary-base shrink-0" />
                {i < events.length - 1 && (
                  <span className="w-px flex-1 min-h-5 bg-white/6 mt-1" />
                )}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <p className="text-[13px] text-text-primary leading-snug">
                  {eventText(event)}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] font-mono text-primary-base px-1.5 py-0.5 rounded border border-primary-base/25 bg-primary-base/8">
                    {event.eventType}
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    {formatWhen(event.occurredAt)}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
