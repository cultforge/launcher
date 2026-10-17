import { useEffect, useState } from "react";
import {
  fetchGuildLiveShare,
  fetchPersonalLiveShare,
  type LiveSharePlayer,
  type LiveShareSnapshot,
} from "../../lib/liveShareApi";
import {
  joinLiveShareRoom,
  leaveLiveShareRoom,
  subscribeLiveShare,
} from "../../lib/liveShareEvents";
import { cn } from "../../lib/cn";

const POLL_MS = 8_000;

type Props =
  | { kind: "guild"; guildId: string; serverId: string; className?: string }
  | { kind: "personal"; serverId: string; className?: string };

function fmtCoord(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(1);
}

function PlayerRow({ player }: { player: LiveSharePlayer }) {
  const pos = player.position;
  const stats = player.sessionStats;
  return (
    <li className="border-b border-white/6 py-2.5 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-text-primary truncate">
            {player.name}
          </div>
          <div className="mt-0.5 text-[10px] text-text-muted truncate">
            {[
              player.dimension,
              player.gamemode,
              player.health != null ? `♥ ${Math.round(player.health)}` : null,
              player.food != null ? `🍗 ${Math.round(player.food)}` : null,
              player.ping != null ? `${Math.round(player.ping)} ms` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        {pos ? (
          <div className="shrink-0 text-right text-[10px] tabular-nums text-text-secondary">
            <div>
              {fmtCoord(pos.x)}, {fmtCoord(pos.y)}, {fmtCoord(pos.z)}
            </div>
            {pos.yaw != null || pos.pitch != null ? (
              <div className="text-text-muted">
                yaw {fmtCoord(pos.yaw)} · pitch {fmtCoord(pos.pitch)}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {stats &&
      (stats.blocksMined != null ||
        stats.blocksPlaced != null ||
        stats.distanceWalked != null ||
        stats.deaths != null) ? (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] text-text-muted">
          {stats.blocksMined != null ? (
            <span>Mined {Math.round(stats.blocksMined)}</span>
          ) : null}
          {stats.blocksPlaced != null ? (
            <span>Placed {Math.round(stats.blocksPlaced)}</span>
          ) : null}
          {stats.distanceWalked != null ? (
            <span>Walked {Math.round(stats.distanceWalked)}m</span>
          ) : null}
          {stats.deaths != null ? (
            <span>Deaths {Math.round(stats.deaths)}</span>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function LiveSharePanel(props: Props) {
  const [snap, setSnap] = useState<LiveShareSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"ws" | "poll" | null>(null);

  const scopeKey =
    props.kind === "guild"
      ? `guild:${props.guildId}:${props.serverId}`
      : `personal:${props.serverId}`;

  useEffect(() => {
    let cancelled = false;
    let room: string | null = null;

    const apply = (next: LiveShareSnapshot, via: "ws" | "poll") => {
      if (cancelled) return;
      setSnap(next);
      setSource(via);
      setLoading(false);
      setError(null);
      if (next.room && next.room !== room) {
        room = next.room;
        joinLiveShareRoom(next.room);
      }
    };

    const unsub = subscribeLiveShare((incoming) => {
      apply(incoming, "ws");
    });

    const poll = async () => {
      try {
        const next =
          props.kind === "guild"
            ? await fetchGuildLiveShare(props.guildId, props.serverId)
            : await fetchPersonalLiveShare(props.serverId);
        if (cancelled) return;
        apply(next, "poll");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Live share failed");
        setLoading(false);
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      unsub();
      if (room) leaveLiveShareRoom(room);
      else leaveLiveShareRoom();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scopeKey captures props
  }, [scopeKey]);

  if (loading && !snap) {
    return (
      <div
        className={cn(
          "cf-panel rounded-xl border border-white/8 bg-black/25 p-4 text-[12px] text-text-muted",
          props.className,
        )}
      >
        Loading live share…
      </div>
    );
  }

  if (error && !snap) {
    return (
      <div
        className={cn(
          "cf-panel rounded-xl border border-white/8 bg-black/25 p-4 text-[12px] text-state-error",
          props.className,
        )}
      >
        {error}
      </div>
    );
  }

  if (!snap || snap.offline) {
    return (
      <div
        className={cn(
          "cf-panel rounded-xl border border-white/8 bg-black/25 p-4",
          props.className,
        )}
      >
        <h3 className="font-sora text-[15px] font-bold text-text-primary">
          Live share
        </h3>
        <p className="mt-2 text-[12px] text-text-muted leading-relaxed">
          Agent offline or no snapshot yet. When the primary agent posts live
          data, players, coords, and world stats show up here.
        </p>
      </div>
    );
  }

  const { runtime, world, players, events } = snap;

  return (
    <div
      className={cn(
        "cf-panel rounded-xl border border-white/8 bg-black/25 p-4 flex flex-col gap-4 max-w-3xl",
        props.className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-sora text-[15px] font-bold text-text-primary">
            Live share
          </h3>
          <p className="mt-0.5 text-[10px] text-text-muted">
            {[
              runtime.state,
              world.name,
              world.dimension,
              world.weather,
              source === "ws" ? "live push" : "polling",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] tabular-nums">
          <div className="cf-stat-card min-w-[5.5rem] !p-2.5">
            <div className="cf-section-label mb-0.5">TPS</div>
            <div className="text-[16px] font-black text-text-primary">
              {runtime.tps != null ? runtime.tps.toFixed(1) : "—"}
            </div>
          </div>
          <div className="cf-stat-card min-w-[5.5rem] !p-2.5">
            <div className="cf-section-label mb-0.5">MSPT</div>
            <div className="text-[16px] font-black text-text-primary">
              {runtime.mspt != null ? runtime.mspt.toFixed(1) : "—"}
            </div>
          </div>
          {runtime.version ? (
            <div className="cf-stat-card min-w-[5.5rem] !p-2.5">
              <div className="cf-section-label mb-0.5">Version</div>
              <div className="text-[12px] font-semibold text-text-primary truncate">
                {runtime.version}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div>
        <div className="cf-section-label mb-1">
          Online · {players.length}
        </div>
        {players.length === 0 ? (
          <p className="text-[12px] text-text-muted py-2">Nobody online.</p>
        ) : (
          <ul className="flex flex-col">
            {players.map((p) => (
              <PlayerRow key={p.uuid || p.name} player={p} />
            ))}
          </ul>
        )}
      </div>

      {events.length > 0 ? (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">
            Recent events
          </div>
          <ul className="flex flex-col gap-1">
            {events.slice(0, 12).map((ev) => (
              <li
                key={ev.id}
                className="flex items-center justify-between gap-2 text-[11px]"
              >
                <span className="text-text-secondary truncate">
                  {ev.eventType}
                  {ev.minecraftName ? ` · ${ev.minecraftName}` : ""}
                  {ev.summary ? ` — ${ev.summary}` : ""}
                </span>
                <span className="shrink-0 text-[9px] text-text-muted">
                  {ev.occurredAt
                    ? new Date(ev.occurredAt).toLocaleTimeString()
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
