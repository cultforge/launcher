import { useCallback, useEffect, useState } from "react";
import {
  listGuildAgentEvents,
  type CultAgentGameEvent,
} from "../../lib/cultAgentApi";
import { useGuildStore } from "../../stores/guilds";
import { logger } from "../../lib/logger";
import { Icon } from "../ico";
import { AppIcons } from "../icons";
import { cn } from "../../lib/cn";

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

function payloadStr(
  payload: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string {
  if (!payload) return "";
  for (const key of keys) {
    const v = payload[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function playerName(event: CultAgentGameEvent): string {
  const payload = event.payload ?? {};
  return (
    event.minecraftName?.trim() ||
    payloadStr(payload, "player", "player_name", "name", "username") ||
    ""
  );
}

function normalizeTypeKey(rawType: string): string {
  return rawType
    .trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, "_")
    .replace(/_+/g, "_");
}

/** Short human label for badges (join / left / died / …). */
function eventKindLabel(event: CultAgentGameEvent): string {
  const key = normalizeTypeKey(event.eventType || "");
  if (key.includes("advancement") || key.includes("achievement"))
    return "advancement";
  if (key.includes("death") || key.includes("died") || key === "player_died")
    return "death";
  if (key.includes("join")) return "join";
  if (key.includes("leave") || key.includes("left") || key.includes("quit"))
    return "leave";
  if (key.includes("chat") || key.includes("message")) return "chat";
  if (key.includes("start")) return "start";
  if (key.includes("stop")) return "stop";
  if (key.includes("crash")) return "crash";
  if (key.includes("restart")) return "restart";
  return event.eventType || "event";
}

function advancementTitle(payload: Record<string, unknown> | null | undefined): string {
  const nested =
    payload && typeof payload.advancement === "object" && payload.advancement
      ? (payload.advancement as Record<string, unknown>)
      : null;
  return (
    payloadStr(
      payload,
      "advancement_title",
      "achievement_title",
      "title",
      "display_name",
      "advancement_name",
      "achievement",
      "advancement",
      "id",
    ) ||
    payloadStr(nested ?? undefined, "title", "display", "name", "id") ||
    ""
  );
}

function deathDetail(payload: Record<string, unknown> | null | undefined): string {
  return payloadStr(
    payload,
    "death_message",
    "message",
    "cause",
    "reason",
    "summary",
    "text",
  );
}

function chatDetail(payload: Record<string, unknown> | null | undefined): string {
  return payloadStr(payload, "message", "text", "content", "chat");
}

export function eventText(event: CultAgentGameEvent): string {
  const payload = event.payload ?? {};
  const who = playerName(event);
  const key = normalizeTypeKey(event.eventType || "");
  const detail =
    payloadStr(payload, "summary", "text") ||
    (key.includes("death") ? deathDetail(payload) : "") ||
    (key.includes("chat") ? chatDetail(payload) : "");

  // Advancements / achievements — prefer “has made X”
  if (key.includes("advancement") || key.includes("achievement")) {
    const title = advancementTitle(payload);
    if (who && title) return `${who} has made ${title}`;
    if (who) return `${who} earned an advancement`;
    if (title) return `Someone made ${title}`;
    return "Someone earned an advancement";
  }

  if (key.includes("death") || key.includes("died") || key === "player_died") {
    if (detail) {
      if (who && !detail.toLowerCase().includes(who.toLowerCase())) {
        return `${who} died — ${detail}`;
      }
      return detail;
    }
    return who ? `${who} died` : "A player died";
  }

  if (key.includes("join")) {
    return who ? `${who} joined the world` : "Someone joined the world";
  }
  if (key.includes("leave") || key.includes("left") || key.includes("quit")) {
    return who ? `${who} left the world` : "Someone left the world";
  }
  if (key.includes("chat") || key.includes("message")) {
    const msg = chatDetail(payload) || detail;
    if (who && msg) return `${who}: ${msg}`;
    if (msg) return msg;
    return who ? `${who} said something` : "Someone said something";
  }

  const serverLabels: Record<string, string> = {
    server_start: "Server started",
    server_started: "Server started",
    server_stop: "Server stopped",
    server_stopped: "Server stopped",
    server_restart: "Server restarted",
    server_crash: "Server crashed",
  };
  if (serverLabels[key]) return serverLabels[key];

  if (detail) {
    if (who && !detail.toLowerCase().includes(who.toLowerCase())) {
      return `${who} — ${detail}`;
    }
    return detail;
  }

  const base = (event.eventType || "event")
    .replace(/[._-]+/g, " ")
    .replace(/\bplayer\b/gi, "")
    .trim();
  if (who && base) return `${who} · ${base}`;
  if (who) return who;
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "Agent event";
}

/** Extra lines for hover / title tooltip. */
export function eventHoverDetails(event: CultAgentGameEvent): string {
  const lines: string[] = [];
  const payload = event.payload ?? {};
  const who = playerName(event);
  if (who) lines.push(`Player: ${who}`);
  if (event.minecraftUuid) lines.push(`UUID: ${event.minecraftUuid}`);
  if (event.eventType) lines.push(`Type: ${event.eventType}`);
  if (event.guildServerId) lines.push(`Server: ${event.guildServerId}`);
  if (event.workloadId) lines.push(`Workload: ${event.workloadId}`);
  if (event.occurredAt) {
    const t = Date.parse(event.occurredAt);
    if (Number.isFinite(t)) lines.push(`When: ${new Date(t).toLocaleString()}`);
  }
  const title = advancementTitle(payload);
  if (title) lines.push(`Advancement: ${title}`);
  const death = deathDetail(payload);
  if (death && !title) lines.push(`Detail: ${death}`);
  const chat = chatDetail(payload);
  if (chat && !death) lines.push(`Message: ${chat}`);
  // Surface a few extra payload keys without dumping everything.
  for (const key of ["dimension", "world", "x", "y", "z", "level"]) {
    const v = payload[key];
    if (v != null && String(v).trim()) lines.push(`${key}: ${String(v)}`);
  }
  return lines.join("\n");
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
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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
              Agent buzz
            </h2>
            <p className="text-[12px] text-text-muted mt-1 max-w-lg">
              Live play signals from guild worlds — joins, advancements, deaths,
              and more. Visible to every guild member.
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
            No agent activity yet. Events appear when someone plays on a linked
            guild world.
          </div>
        ) : (
          events.map((event, i) => {
            const rowKey =
              event.id || `${event.eventType}-${event.occurredAt}-${i}`;
            const details = eventHoverDetails(event);
            const showTip = hoveredId === rowKey && details.length > 0;
            return (
              <div
                key={rowKey}
                className={cn(
                  "relative flex items-start gap-3 px-3 py-3 rounded-xl transition-colors",
                  showTip ? "bg-bg-elevated" : "hover:bg-bg-elevated",
                )}
                title={details}
                onMouseEnter={() => setHoveredId(rowKey)}
                onMouseLeave={() => setHoveredId(null)}
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
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-[10px] font-mono text-primary-base px-1.5 py-0.5 rounded border border-primary-base/25 bg-primary-base/8">
                      {eventKindLabel(event)}
                    </span>
                    <span className="text-[10px] text-text-disabled">
                      {formatWhen(event.occurredAt)}
                    </span>
                  </div>
                  {showTip ? (
                    <div className="mt-2 rounded-lg border border-white/10 bg-black/50 px-2.5 py-2 text-[10px] text-text-muted whitespace-pre-wrap leading-relaxed">
                      {details}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
