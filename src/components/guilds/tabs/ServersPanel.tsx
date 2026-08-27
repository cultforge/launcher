import { useEffect, useMemo, useState } from "react";
import { ResponsiveLine } from "@nivo/line";
import {
  pingSeries,
  serverCompatibility,
  guildServerJoinAddress,
  guildServerConfiguredAddress,
  type GuildServer,
  type ServerCompatibility,
} from "../../../data/guilds";
import { friendByName } from "../../../data/friends";
import { cn } from "../../../lib/cn";
import {
  listGuildAgentRuntime,
  type CultAgentRuntimeSnapshot,
} from "../../../lib/cultAgentApi";
import { useBuildStore } from "../../../stores/build";
import { useProfileRouteStore } from "../../../stores/profileRoute";
import { useGuildStore } from "../../../stores/guilds";
import { useGuildAgentPresenceStore } from "../../../stores/guildAgentPresence";
import { goHomeBuilds } from "../../../lib/homeNav";
import { EntityImage } from "../../EntityImage";
import { eventText } from "../ActivityFeedPanel";

function presenceEventLabel(
  event: {
    eventType: string;
    minecraftName?: string | null;
    payload?: Record<string, unknown> | null;
  },
): string {
  return eventText({
    id: "",
    eventType: event.eventType,
    minecraftName: event.minecraftName,
    payload: event.payload ?? null,
    raw: {},
  });
}

function runtimeLooksOnline(state: string | null | undefined): boolean {
  const s = (state ?? "").toLowerCase();
  return s.includes("run") || s.includes("online") || s === "started";
}

const chartTheme = {
  text: { fill: "var(--color-text-secondary)", fontSize: 10 },
  axis: {
    ticks: { text: { fill: "var(--color-text-muted)", fontSize: 9 } },
    domain: { line: { stroke: "var(--color-border-subtle)" } },
  },
  grid: { line: { stroke: "var(--color-border-subtle)" } },
  tooltip: {
    container: {
      background: "var(--color-bg-card)",
      border: "1px solid var(--color-border-strong)",
      borderRadius: 8,
      fontSize: 11,
      color: "var(--color-text-primary)",
    },
  },
};

function pingColor(ms: number) {
  if (ms < 50) return "text-primary-base";
  if (ms < 80) return "text-text-secondary";
  return "text-state-warning";
}

function compatibilityLabel(value: ServerCompatibility) {
  if (value.state === "ready") {
    return value.build ? "Build ready" : "Open to join";
  }
  if (value.state === "update-required") return "Update required";
  return "Build missing";
}

function ServerCard({
  server,
  selected,
  compatibility,
  liveStatus,
  liveOnline,
  livePlayers,
  livePing,
  onSelect,
}: {
  server: GuildServer;
  selected: boolean;
  compatibility: ServerCompatibility;
  liveStatus?: string;
  liveOnline?: boolean | null;
  livePlayers?: { online: number; max: number } | null;
  livePing?: number | null;
  onSelect: () => void;
}) {
  const playersOnline = livePlayers?.online ?? server.playersOnline;
  const playersMax = livePlayers?.max ?? server.playersMax;
  const pingMs = livePing ?? (server.pingMs > 0 ? server.pingMs : 0);
  const fullness = Math.round(
    (playersOnline / Math.max(1, playersMax || playersOnline || 1)) * 100,
  );
  const badgeOnline =
    liveOnline === true
      ? true
      : liveOnline === false
        ? false
        : server.status === "online"
          ? true
          : server.status === "maintenance"
            ? false
            : null;
  const badgeLabel =
    liveStatus && liveStatus !== "…"
      ? liveStatus
      : badgeOnline === true
        ? "Online"
        : badgeOnline === false
          ? "Offline"
          : server.status === "maintenance"
            ? "Maintenance"
            : "Checking…";
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "group overflow-hidden rounded-xl border text-left cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70",
        selected
          ? "border-primary-base/50 bg-primary-base/6 shadow-[0_0_24px_var(--color-glow-secondary)]"
          : "border-border-subtle bg-bg-card hover:border-border-strong hover:-translate-y-0.5 motion-reduce:hover:translate-y-0",
      )}
    >
      <div className="relative aspect-16/7 overflow-hidden">
        <EntityImage
          kind="server"
          entityId={server.id}
          source={server.coverUrl || server.thumbnail}
          alt={`${server.name} server artwork`}
          className="absolute inset-0 h-full w-full"
        />
        <div className="absolute inset-0 bg-linear-to-t from-bg-app via-transparent to-black/10" />
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/55 px-2 py-1 backdrop-blur">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              badgeOnline === true
                ? "bg-primary-base"
                : badgeOnline === false
                  ? "bg-text-disabled"
                  : server.status === "maintenance"
                    ? "bg-state-warning"
                    : "bg-text-disabled animate-pulse",
            )}
          />
          <span className="text-[9px] font-semibold capitalize text-text-primary">
            {badgeLabel}
          </span>
        </div>
        <div className="absolute bottom-2.5 left-3 right-3 flex items-end gap-2.5">
          {server.iconUrl ? (
            <EntityImage
              kind="server"
              entityId={`${server.id}-icon`}
              source={server.iconUrl}
              alt=""
              className="h-10 w-10 shrink-0 rounded-lg border border-white/20 shadow-lg"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="font-sora text-[15px] font-bold text-white">
              {server.name}
            </div>
            <div className="mt-0.5 text-[9px] font-mono text-white/60">
              {guildServerJoinAddress(server)}
              {server.addressSource === "tunnel" ? (
                <span className="ml-1.5 rounded bg-primary-base/25 px-1 py-px text-[8px] font-sans font-semibold uppercase tracking-wide text-primary-base">
                  Tunnel
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="p-3">
        <p className="line-clamp-2 min-h-8 text-[10px] leading-relaxed text-text-muted">
          {server.description}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {server.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md border border-border-subtle bg-bg-surface px-1.5 py-0.5 text-[8px] text-text-secondary"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border-subtle pt-2.5">
          <div>
            <div className="text-[8px] uppercase tracking-wider text-text-disabled">
              Players
            </div>
            <div className="mt-0.5 text-[10px] font-semibold text-text-primary">
              {badgeOnline === true
                ? `${playersOnline}/${playersMax || "—"}`
                : badgeOnline === false
                  ? "0/—"
                  : "—"}
            </div>
          </div>
          <div>
            <div className="text-[8px] uppercase tracking-wider text-text-disabled">
              Ping
            </div>
            <div className={cn("mt-0.5 text-[10px] font-semibold", pingColor(pingMs))}>
              {badgeOnline === true && pingMs > 0 ? `${pingMs} ms` : "—"}
            </div>
          </div>
          <div>
            <div className="text-[8px] uppercase tracking-wider text-text-disabled">
              Access
            </div>
            <div
              className={cn(
                "mt-0.5 truncate text-[9px] font-semibold",
                compatibility.state === "ready"
                  ? "text-primary-base"
                  : "text-state-warning",
              )}
            >
              {compatibilityLabel(compatibility)}
            </div>
          </div>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-bg-overlay">
          <div
            className="h-full rounded-full bg-primary-base/70"
            style={{
              width: `${badgeOnline === true ? fullness : 0}%`,
            }}
          />
        </div>
      </div>
    </button>
  );
}

function CompatibilityPanel({
  server,
  compatibility,
  onUseBuild,
  onOpenBuilds,
}: {
  server: GuildServer;
  compatibility: ServerCompatibility;
  onUseBuild: () => void;
  onOpenBuilds: () => void;
}) {
  const build = compatibility.build;
  const ready = compatibility.state === "ready";
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        ready
          ? "border-primary-base/35 bg-primary-base/7"
          : "border-state-warning/25 bg-state-warning/5",
      )}
      role="status"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div
            className={cn(
              "text-[11px] font-bold",
              ready ? "text-primary-base" : "text-state-warning",
            )}
          >
            {compatibilityLabel(compatibility)}
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-text-muted">
            Requires {server.loader} · Minecraft {server.version} · pack{" "}
            {server.requiredBuildVersion}+
          </p>
          <p className="mt-0.5 text-[10px] text-text-secondary">
            {build
              ? `Installed: ${build.name} ${build.version} · ${build.status}`
              : "The required build is not installed on this device."}
          </p>
        </div>
        <button
          type="button"
          onClick={ready ? onUseBuild : onOpenBuilds}
          className="cf-btn-primary rounded-lg px-3.5 py-2 text-[10px] font-semibold cursor-pointer"
        >
          {ready ? `Use ${build!.name}` : "Open Builds"}
        </button>
      </div>
      <p className="mt-2 border-t border-border-subtle pt-2 text-[9px] text-text-disabled">
        Direct server launch is not connected yet. CultForge will prepare the
        correct build and keep the address ready.
      </p>
    </div>
  );
}

export function ServersPanel() {
  const [joinOpenId, setJoinOpenId] = useState<string | null>(null);
  const [preparedId, setPreparedId] = useState<string | null>(null);
  const [joinMessage, setJoinMessage] = useState<string | null>(null);
  const [mpingByAddress, setMpingByAddress] = useState<
    Record<string, string>
  >({});
  const [liveOnlineByAddress, setLiveOnlineByAddress] = useState<
    Record<string, boolean | null>
  >({});
  const [liveStatsByAddress, setLiveStatsByAddress] = useState<
    Record<
      string,
      { playersOnline: number; playersMax: number; pingMs: number }
    >
  >({});
  const [runtimeByServer, setRuntimeByServer] = useState<
    Record<string, CultAgentRuntimeSnapshot>
  >({});
  const guildId = useGuildStore((s) => s.activeGuildId);
  const joinServer = useGuildStore((s) => s.joinServer);
  const selectedId = useGuildStore((s) => s.selectedServerId);
  const setSelected = useGuildStore((s) => s.setSelectedServerId);
  const builds = useBuildStore((s) => s.builds);
  const setActiveBuild = useBuildStore((s) => s.setActive);
  const openProfile = useProfileRouteStore((s) => s.openFriend);
  const allServers = useGuildStore((s) => s.servers);
  const servers = allServers.filter((server) => server.guildId === guildId);
  const presenceByServer = useGuildAgentPresenceStore((s) => s.byServerId);
  const ensurePresence = useGuildAgentPresenceStore((s) => s.ensurePolling);
  const refreshPresence = useGuildAgentPresenceStore((s) => s.refresh);

  useEffect(() => {
    ensurePresence(guildId || null);
  }, [guildId, ensurePresence]);

  useEffect(() => {
    if (!servers.length) {
      setSelected(null);
      return;
    }
    if (!selectedId || !servers.some((server) => server.id === selectedId)) {
      setSelected(servers[0].id);
    }
  }, [guildId, servers, selectedId, setSelected]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const {
        queryMpingStatus,
        formatMpingLabel,
        liveOnlineFromMping,
        applyMpingToServerStats,
        syncMpingWatchList,
      } = await import("../../../lib/mping");
      await syncMpingWatchList(servers.map((s) => guildServerJoinAddress(s)));

      let runtimeMap: Record<string, CultAgentRuntimeSnapshot> = {};
      if (guildId) {
        try {
          const snaps = await listGuildAgentRuntime(guildId);
          for (const snap of snaps) {
            const sid = snap.guildServerId?.trim();
            if (sid) runtimeMap[sid] = snap;
          }
        } catch {
          /* optional */
        }
      }

      const nextLabels: Record<string, string> = {};
      const nextOnline: Record<string, boolean | null> = {};
      const nextStats: Record<
        string,
        { playersOnline: number; playersMax: number; pingMs: number }
      > = {};
      await Promise.all(
        servers.map(async (server) => {
          const addr = guildServerJoinAddress(server);
          const status = await queryMpingStatus(addr);
          let online = liveOnlineFromMping(status);
          const runtime = runtimeMap[server.id];
          const fromRuntime = runtimeLooksOnline(runtime?.state);
          if (online !== true && fromRuntime) online = true;
          else if (online == null && server.status === "online") online = true;

          let label = formatMpingLabel(status);
          const stats = applyMpingToServerStats(status);
          if (online === true) {
            const playersOnline =
              stats?.playersOnline ?? runtime?.playerCount ?? server.playersOnline;
            const playersMax = stats?.playersMax ?? server.playersMax;
            nextStats[addr] = {
              playersOnline,
              playersMax,
              pingMs: stats?.pingMs ?? (server.pingMs > 0 ? server.pingMs : 0),
            };
            if (label === "Offline" || label === "…" || label === "Checking…") {
              label =
                playersMax > 0
                  ? `Online · ${playersOnline}/${playersMax}`
                  : "Online";
            }
          } else if (online === false) {
            label = "Offline";
          } else if (label === "Offline") {
            label = "…";
          }

          nextLabels[addr] = label;
          nextOnline[addr] = online;
        }),
      );
      if (!cancelled) {
        setMpingByAddress(nextLabels);
        setLiveOnlineByAddress(nextOnline);
        setLiveStatsByAddress(nextStats);
        setRuntimeByServer(runtimeMap);
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [guildId, servers]);

  const selected = servers.find((server) => server.id === selectedId) ?? servers[0];
  const compatibilityById = useMemo(
    () =>
      Object.fromEntries(
        servers.map((server) => [
          server.id,
          serverCompatibility(server, builds),
        ]),
      ),
    [servers, builds],
  );
  const series = useMemo(
    () =>
      selected
        ? [
            {
              id: "Ping",
              data: pingSeries(
                selected.id,
                24,
                liveStatsByAddress[guildServerJoinAddress(selected)]?.pingMs ||
                  (liveOnlineByAddress[guildServerJoinAddress(selected)] === true
                    ? Math.max(1, selected.pingMs)
                    : 0),
              ),
            },
          ]
        : [],
    [selected, liveStatsByAddress, liveOnlineByAddress],
  );
  const selectedJoin = selected ? guildServerJoinAddress(selected) : "";
  const selectedLive = selected ? liveStatsByAddress[selectedJoin] : null;
  const selectedOnline = selected
    ? liveOnlineByAddress[selectedJoin]
    : null;
  const presence = selected ? presenceByServer[selected.id] : null;
  const onlinePlayers = presence?.names ?? [];
  const presenceCount = presence?.count ?? 0;
  const selectedPlayersOnline =
    (onlinePlayers.length > 0 ? onlinePlayers.length : null) ??
    selectedLive?.playersOnline ??
    (selected && runtimeLooksOnline(runtimeByServer[selected.id]?.state)
      ? runtimeByServer[selected.id]?.playerCount
      : null) ??
    (presenceCount > 0 ? presenceCount : null) ??
    selected?.playersOnline ??
    0;
  const selectedPlayersMax = selectedLive?.playersMax ?? selected?.playersMax ?? 0;
  const recentPresenceEvents = presence?.events ?? [];

  if (servers.length === 0) {
    return (
      <div className="cf-panel rounded-xl flex items-center justify-center min-h-75 text-[13px] text-text-muted">
        No servers linked to this guild
      </div>
    );
  }

  const selectedCompatibility = compatibilityById[selected.id];
  const openBuilds = () => {
    if (selectedCompatibility.build) {
      setActiveBuild(selectedCompatibility.build.id);
    }
    goHomeBuilds();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="font-sora text-[15px] font-bold text-text-primary">
            Guild servers
          </h3>
          <p className="mt-1 text-[10px] text-text-muted">
            Live worlds, required builds, and connection health.
          </p>
        </div>
        <span className="text-[9px] uppercase tracking-[0.14em] text-text-disabled">
          {
            Object.values(liveOnlineByAddress).filter((v) => v === true).length
          }{" "}
          reachable
        </span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {servers.map((server) => {
          const joinAddr = guildServerJoinAddress(server);
          const live = liveStatsByAddress[joinAddr];
          const cardPresence = presenceByServer[server.id];
          const presenceOnline =
            cardPresence?.names.length || cardPresence?.count || 0;
          const view = live
            ? {
                ...server,
                playersOnline: presenceOnline || live.playersOnline,
                playersMax: live.playersMax,
                pingMs: live.pingMs,
              }
            : server;
          return (
            <ServerCard
              key={server.id}
              server={view}
              selected={selected.id === server.id}
              compatibility={compatibilityById[server.id]}
              liveStatus={mpingByAddress[joinAddr]}
              liveOnline={liveOnlineByAddress[joinAddr]}
              livePlayers={
                liveStatsByAddress[joinAddr]
                  ? {
                      online:
                        presenceOnline ||
                        liveStatsByAddress[joinAddr].playersOnline,
                      max: liveStatsByAddress[joinAddr].playersMax,
                    }
                  : runtimeLooksOnline(runtimeByServer[server.id]?.state) ||
                      presenceOnline > 0
                    ? {
                        online:
                          presenceOnline ||
                          runtimeByServer[server.id]?.playerCount ||
                          0,
                        max: server.playersMax,
                      }
                    : null
              }
              livePing={liveStatsByAddress[joinAddr]?.pingMs ?? null}
              onSelect={() => {
                setSelected(server.id);
                setJoinOpenId(null);
                setPreparedId(null);
              }}
            />
          );
        })}
      </div>

      <section className="cf-panel overflow-hidden rounded-xl">
        <div
          className="relative min-h-32 overflow-hidden border-b border-border-subtle p-4"
        >
          <EntityImage
            kind="server"
            entityId={selected.id}
            source={selected.coverUrl || selected.thumbnail}
            alt={`${selected.name} server artwork`}
            className="absolute inset-0 h-full w-full"
          />
          <div className="absolute inset-0 bg-linear-to-r from-bg-app via-bg-app/85 to-bg-app/25" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-xl">
              <div className="flex items-center gap-2.5">
                {selected.iconUrl ? (
                  <EntityImage
                    kind="server"
                    entityId={`${selected.id}-icon`}
                    source={selected.iconUrl}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-xl border border-white/15"
                  />
                ) : null}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-sora text-[20px] font-bold text-text-primary">
                      {selected.name}
                    </h3>
                    <span className="rounded-md border border-border-strong bg-black/30 px-2 py-0.5 text-[9px] text-text-secondary">
                      {selected.region}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-text-muted">
                    {guildServerJoinAddress(selected)}
                    {selected.addressSource === "tunnel" ? " · tunnel" : ""}
                    {mpingByAddress[guildServerJoinAddress(selected)]
                      ? ` · ${mpingByAddress[guildServerJoinAddress(selected)]}`
                      : ""}
                    {selected.addressSource === "tunnel" &&
                    guildServerConfiguredAddress(selected) !==
                      guildServerJoinAddress(selected) ? (
                      <span className="block text-text-disabled font-sans mt-0.5">
                        Catalog default: {guildServerConfiguredAddress(selected)}
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-text-secondary">
                {selected.description}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setJoinOpenId((current) =>
                  current === selected.id ? null : selected.id,
                );
                setJoinMessage(null);
              }}
              className="cf-btn-primary rounded-lg px-5 py-2.5 text-[12px] font-semibold cursor-pointer"
            >
              {joinOpenId === selected.id ? "Hide requirements" : "Join server"}
            </button>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-3">
          {joinOpenId === selected.id && (
            <CompatibilityPanel
              server={selected}
              compatibility={selectedCompatibility}
              onOpenBuilds={openBuilds}
              onUseBuild={() => {
                if (selectedCompatibility.build) {
                  setActiveBuild(selectedCompatibility.build.id);
                  setPreparedId(selected.id);
                }
                void joinServer(guildId, selected.id).then((result) => {
                  if (result.ok) {
                    const host =
                      result.connect &&
                      typeof result.connect === "object" &&
                      "host" in result.connect
                        ? String(
                            (result.connect as { host?: unknown }).host ?? "",
                          )
                        : "";
                    setJoinMessage(
                      host
                        ? `${result.message} Connect: ${host}`
                        : result.message,
                    );
                    setPreparedId(selected.id);
                  } else {
                    setJoinMessage(result.message);
                  }
                });
              }}
            />
          )}
          {(preparedId === selected.id || joinMessage) && (
            <div className="rounded-lg border border-primary-base/30 bg-primary-base/7 px-3 py-2 text-[10px] text-primary-base">
              {joinMessage ?? (
                <>
                  Build selected. Server address:{" "}
                  <span className="font-mono">
                    {guildServerJoinAddress(selected)}
                  </span>
                </>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
            <div className="xl:col-span-7">
              <div className="flex items-baseline justify-between mb-1.5">
                <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                  Connection history
                </h4>
                <span className={cn("text-[10px]", pingColor(selected.pingMs))}>
                  {selected.pingMs} ms
                </span>
              </div>
              <div className="relative h-42.5 rounded-lg border border-border-subtle bg-black/20">
                <div className="absolute inset-0 p-1">
                  <ResponsiveLine
                    data={series}
                    margin={{ top: 12, right: 12, bottom: 16, left: 36 }}
                    xScale={{ type: "point" }}
                    yScale={{ type: "linear", min: 0, max: "auto", nice: true }}
                    curve="monotoneX"
                    enableGridX={false}
                    enablePoints={false}
                    enableArea
                    areaOpacity={0.12}
                    axisBottom={null}
                    axisLeft={{ tickSize: 0, tickPadding: 6, tickValues: 4 }}
                    colors={["var(--color-primary-base)"]}
                    lineWidth={2}
                    theme={chartTheme}
                    animate={false}
                    useMesh
                  />
                </div>
              </div>
            </div>

            <div className="xl:col-span-5 rounded-lg border border-border-subtle bg-black/15 p-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                  Players online
                </h4>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-text-secondary">
                    {selectedOnline === true
                      ? `${selectedPlayersOnline}/${selectedPlayersMax || "—"}`
                      : selectedOnline === false
                        ? "Offline"
                        : "—"}
                  </span>
                  <button
                    type="button"
                    onClick={() => void refreshPresence(guildId)}
                    className="text-[9px] text-text-disabled hover:text-text-muted cursor-pointer"
                  >
                    Refresh
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-1">
                {selectedOnline !== true ? (
                  <span className="text-[11px] text-text-muted">
                    {selectedOnline === false
                      ? "Server is offline."
                      : "Waiting for live player list…"}
                  </span>
                ) : onlinePlayers.length === 0 && selectedPlayersOnline === 0 ? (
                  <span className="text-[11px] text-text-muted">Server is empty</span>
                ) : onlinePlayers.length === 0 ? (
                  <span className="text-[11px] text-text-muted">
                    {selectedPlayersOnline} player
                    {selectedPlayersOnline === 1 ? "" : "s"} online
                  </span>
                ) : (
                  onlinePlayers.map((name) => {
                    const profile = friendByName(name);
                    return profile ? (
                      <button
                        key={name}
                        type="button"
                        onClick={() => openProfile(profile.id)}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-bg-elevated cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70"
                      >
                        <span className="grid h-7 w-7 place-items-center rounded-md border border-border-subtle bg-bg-card text-[9px] font-bold text-text-secondary">
                          {name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="text-[11px] font-medium text-text-primary">
                          {name}
                        </span>
                        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary-base" />
                      </button>
                    ) : (
                      <div
                        key={name}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                      >
                        <span className="grid h-7 w-7 place-items-center rounded-md border border-border-subtle bg-bg-card text-[9px] font-bold text-text-secondary">
                          {name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="text-[11px] text-text-secondary">{name}</span>
                      </div>
                    );
                  })
                )}
              </div>
              {recentPresenceEvents.length > 0 ? (
                <ul className="mt-3 space-y-1 border-t border-border-subtle pt-2">
                  {recentPresenceEvents.slice(0, 4).map((ev) => (
                    <li
                      key={ev.id}
                      className="truncate text-[10px] text-text-muted"
                    >
                      {presenceEventLabel(ev)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
