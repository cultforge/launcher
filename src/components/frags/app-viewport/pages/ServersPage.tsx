import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useGuildStore } from "../../../../stores/guilds";
import { usePersonalServersStore } from "../../../../stores/personalServers";
import { useGuildModalsStore } from "../../../../stores/guildModals";
import { useNavigationStore } from "../../../../typlibs";
import {
  guildServerJoinAddress,
  type GuildServer,
} from "../../../../data/guilds";
import { personalServerJoinAddress } from "../../../../lib/personalServersApi";
import {
  capabilitiesForRole,
  membershipForUser,
} from "../../../../lib/guildPermissions";
import { useAppStore } from "../../../../userstore";
import { useMpingWatchList } from "../../../../hooks/useMpingWatchList";
import {
  listGuildAgentRuntime,
  type CultAgentRuntimeSnapshot,
} from "../../../../lib/cultAgentApi";
import { useGuildAgentPresenceStore } from "../../../../stores/guildAgentPresence";
import type { UserPersonalServerRecord } from "../../../../types/catalog";
import { EntityImage } from "../../../EntityImage";
import { Icon } from "../../../ico";
import { AppIcons } from "../../../icons";
import MyServersPage, { ServerEditor } from "./MyServersPage";
import MyPcsPage from "./MyPcsPage";
import { useServerNavPrefsStore } from "../../../../stores/serverNavPrefs";

const SERVER_VIEWS = ["All", "My PCs", "My Servers"] as const;
const RUNTIME_POLL_MS = 3000;

function runtimeLooksOnline(state: string | null | undefined): boolean {
  const s = (state ?? "").toLowerCase();
  return s.includes("run") || s.includes("online") || s === "started";
}

function ServersTabStrip() {
  const sideItem = useNavigationStore((s) => s.sideItem);
  const setSideItem = useNavigationStore((s) => s.setSideItem);
  const active = SERVER_VIEWS.includes(sideItem as (typeof SERVER_VIEWS)[number])
    ? sideItem
    : "All";

  return (
    <div className="flex flex-wrap gap-1.5 px-4 pt-3 pb-0">
      {SERVER_VIEWS.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => setSideItem(tab)}
          className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold cursor-pointer transition-colors ${
            active === tab
              ? "bg-primary-base/15 text-primary-base border border-primary-base/35"
              : "border border-white/10 text-text-muted hover:text-text-primary hover:bg-white/4"
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

function ServersPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-full flex flex-col min-h-0">
      <ServersTabStrip />
      <div className="flex-1 min-h-0 overflow-y-auto scroll-hidden">{children}</div>
    </div>
  );
}

type ServersViewMode = "all" | "favorites" | "recent";

function FavoriteToggle({
  serverId,
  className,
}: {
  serverId: string;
  className?: string;
}) {
  const fav = useServerNavPrefsStore((s) => s.isFavorite(serverId));
  const toggle = useServerNavPrefsStore((s) => s.toggleFavorite);
  return (
    <button
      type="button"
      aria-label={fav ? "Remove favorite" : "Add favorite"}
      onClick={(e) => {
        e.stopPropagation();
        toggle(serverId);
        toast.success(fav ? "Removed from favorites" : "Added to favorites");
      }}
      className={`rounded-md border px-2 py-1 text-[12px] cursor-pointer ${
        fav
          ? "border-primary-base/40 bg-primary-base/12 text-primary-base"
          : "border-white/10 text-text-muted hover:text-text-primary"
      } ${className ?? ""}`}
    >
      {fav ? "★" : "☆"}
    </button>
  );
}

function liveStatsFor(
  server: GuildServer,
  mping: ReturnType<typeof useMpingWatchList>,
  runtime?: CultAgentRuntimeSnapshot | null,
  presence?: { names: string[]; count: number } | null,
) {
  const addr = guildServerJoinAddress(server);
  const entry = mping[addr];
  const live = entry?.stats;
  const mpingOnline = entry?.online;
  const fromRuntime = runtimeLooksOnline(runtime?.state);
  const fromCatalog = server.status === "online";
  const rosterCount = presence?.names.length ?? 0;
  const presenceOnline = rosterCount || presence?.count || 0;

  // Prefer live mping; if broker is unsure/offline but agent runtime says
  // the world is running, trust runtime (common with tunnels).
  let online: boolean | null = mpingOnline ?? null;
  if (online !== true && (fromRuntime || presenceOnline > 0)) online = true;
  else if (online == null && fromCatalog) online = true;

  const playersOnline =
    (rosterCount > 0 ? rosterCount : null) ??
    live?.playersOnline ??
    (fromRuntime ? runtime!.playerCount : undefined) ??
    (presenceOnline > 0 ? presenceOnline : undefined) ??
    (online === true ? server.playersOnline : 0);
  const playersMax =
    live?.playersMax ?? (online === true ? server.playersMax : 0);
  const pingMs =
    live?.pingMs ??
    (online === true && server.pingMs > 0 ? server.pingMs : 0);

  let label = entry?.label ?? "…";
  if (online === true && (mpingOnline !== true || label === "Offline" || label === "…")) {
    label =
      playersMax > 0
        ? `Online · ${playersOnline}/${playersMax}`
        : "Online";
  } else if (online === false) {
    label = "Offline";
  } else if (online == null) {
    label = label === "Offline" ? "…" : label;
  }

  return {
    playersOnline,
    playersMax,
    pingMs,
    label,
    online,
    joinAddress: addr || server.address,
    playerNames: presence?.names ?? [],
  };
}

function statusDotClass(online: boolean | null | undefined) {
  if (online === true) return "bg-state-success";
  if (online === false) return "bg-state-error";
  return "bg-state-warning";
}

function AddServerMenu({
  canAddGuild,
  onPersonal,
  onGuild,
}: {
  canAddGuild: boolean;
  onPersonal: () => void;
  onGuild: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="cf-btn-primary rounded-lg px-4 py-2 text-[11px] font-semibold cursor-pointer"
      >
        Add server
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-white/10 bg-bg-app p-1 shadow-lg">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onPersonal();
            }}
            className="w-full rounded-md px-3 py-2 text-left text-[11px] text-text-primary hover:bg-white/6 cursor-pointer"
          >
            Personal server
          </button>
          <button
            type="button"
            disabled={!canAddGuild}
            onClick={() => {
              setOpen(false);
              onGuild();
            }}
            className="w-full rounded-md px-3 py-2 text-left text-[11px] text-text-primary hover:bg-white/6 cursor-pointer disabled:opacity-40"
          >
            Guild server
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PersonalRow({
  server,
  live,
  onOpen,
}: {
  server: UserPersonalServerRecord;
  live?: ReturnType<typeof useMpingWatchList>[string];
  onOpen: () => void;
}) {
  const join = personalServerJoinAddress(server);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="cf-panel group overflow-hidden rounded-xl text-left cursor-pointer"
    >
      <div className="flex items-center justify-between gap-3 p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDotClass(live?.online)}`}
            />
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: server.themeColor }}
            />
            <span className="truncate text-sm font-medium text-text-primary">
              {server.name}
            </span>
            <span className="rounded-full bg-state-info/12 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-state-info">
              Personal
            </span>
            {server.addressSource === "tunnel" ? (
              <span className="rounded-full bg-primary-base/12 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-primary-base">
                Tunnel
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 text-[10px] text-text-muted">
            {join.address}:{join.port}
            {live?.label ? ` · ${live.label}` : ""}
          </div>
        </div>
        <FavoriteToggle serverId={server.id} />
      </div>
    </button>
  );
}

function CombinedServersView({ mode = "all" }: { mode?: ServersViewMode }) {
  const servers = useGuildStore((s) => s.servers);
  const activeGuildId = useGuildStore((s) => s.activeGuildId);
  const hydrateGuildServers = useGuildStore((s) => s.hydrateGuildServers);
  const members = useGuildStore((s) => s.members);
  const userId = useAppStore((s) => s.currentUser?.id ?? "");
  const touchRecent = useServerNavPrefsStore((s) => s.touchRecent);
  const favorites = useServerNavPrefsStore((s) => s.favorites);
  const recents = useServerNavPrefsStore((s) => s.recents);
  const recentIds = useMemo(
    () => recents.slice(0, 20).map((r) => r.id),
    [recents],
  );
  const openGuildModal = useGuildModalsStore((s) => s.open);
  const personal = usePersonalServersStore((s) => s.servers);
  const refreshPersonal = usePersonalServersStore((s) => s.refresh);
  const createPersonal = usePersonalServersStore((s) => s.create);
  const selectPersonal = usePersonalServersStore((s) => s.select);
  const setSideItem = useNavigationStore((s) => s.setSideItem);
  const [creatingPersonal, setCreatingPersonal] = useState(false);
  const presenceByServer = useGuildAgentPresenceStore((s) => s.byServerId);
  const ensurePresence = useGuildAgentPresenceStore((s) => s.ensurePolling);

  const canAddGuild = capabilitiesForRole(
    membershipForUser(members, activeGuildId, userId)?.role,
  ).manageServers;

  useEffect(() => {
    if (activeGuildId) void hydrateGuildServers(activeGuildId);
    void refreshPersonal();
  }, [activeGuildId, hydrateGuildServers, refreshPersonal]);

  useEffect(() => {
    ensurePresence(activeGuildId || null);
  }, [activeGuildId, ensurePresence]);

  const guildAddresses = useMemo(
    () => servers.map((s) => guildServerJoinAddress(s)).filter(Boolean),
    [servers],
  );
  const personalAddresses = useMemo(
    () =>
      personal.map((s) => {
        const j = personalServerJoinAddress(s);
        return `${j.address}:${j.port}`;
      }),
    [personal],
  );
  const mping = useMpingWatchList(
    [...guildAddresses, ...personalAddresses],
    3000,
  );

  const [runtimeByServer, setRuntimeByServer] = useState<
    Record<string, CultAgentRuntimeSnapshot>
  >({});

  useEffect(() => {
    if (!activeGuildId) {
      setRuntimeByServer({});
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const snaps = await listGuildAgentRuntime(activeGuildId);
        if (cancelled) return;
        const map: Record<string, CultAgentRuntimeSnapshot> = {};
        for (const snap of snaps) {
          const sid = snap.guildServerId?.trim();
          if (sid) map[sid] = snap;
        }
        setRuntimeByServer(map);
      } catch {
        /* runtime optional */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), RUNTIME_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [activeGuildId]);

  const markRecent = (serverId: string) => {
    touchRecent(serverId);
  };

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const recentOrder = useMemo(() => new Map(recentIds.map((id, i) => [id, i])), [recentIds]);

  const filterGuild = (list: GuildServer[]) => {
    if (mode === "favorites") {
      return list.filter((s) => favoriteSet.has(s.id));
    }
    if (mode === "recent") {
      return list
        .filter((s) => recentOrder.has(s.id))
        .sort(
          (a, b) =>
            (recentOrder.get(a.id) ?? 99) - (recentOrder.get(b.id) ?? 99),
        );
    }
    return list;
  };

  const filterPersonal = (list: UserPersonalServerRecord[]) => {
    if (mode === "favorites") {
      return list.filter((s) => favoriteSet.has(s.id));
    }
    if (mode === "recent") {
      return list
        .filter((s) => recentOrder.has(s.id))
        .sort(
          (a, b) =>
            (recentOrder.get(a.id) ?? 99) - (recentOrder.get(b.id) ?? 99),
        );
    }
    return list;
  };

  const guildList = filterGuild(servers);
  const personalList = filterPersonal(personal);

  const featured = mode === "all" ? guildList[0] : null;
  const rest = mode === "all" ? guildList.slice(1) : guildList;
  const featuredLive = featured
    ? liveStatsFor(
        featured,
        mping,
        runtimeByServer[featured.id],
        presenceByServer[featured.id],
      )
    : null;

  const onAddGuild = () => {
    if (!canAddGuild) {
      toast.error("Only guild officers can add a guild server.");
      return;
    }
    openGuildModal("server");
  };

  const empty =
    guildList.length === 0 &&
    personalList.length === 0 &&
    !creatingPersonal;

  const modeLabel =
    mode === "favorites"
      ? "Favorites"
      : mode === "recent"
        ? "Recent"
        : "All";

  return (
    <div className="h-full overflow-y-auto scroll-hidden p-4 pb-24 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-sora text-xl font-bold text-text-primary">
            Servers {mode !== "all" ? `· ${modeLabel}` : ""}
          </h1>
          <p className="text-[11px] text-text-muted mt-1 max-w-xl">
            {mode === "favorites"
              ? "Servers you starred for quick access."
              : mode === "recent"
                ? "Servers you opened recently in the launcher."
                : "Guild worlds and your personal servers. Join from a guild card or manage your own worlds."}
          </p>
        </div>
        {mode === "all" ? (
          <AddServerMenu
            canAddGuild={canAddGuild}
            onPersonal={() => setCreatingPersonal(true)}
            onGuild={onAddGuild}
          />
        ) : null}
      </div>

      {creatingPersonal && (
        <ServerEditor
          server={null}
          onSave={async (data) => {
            try {
              await createPersonal(data);
              setCreatingPersonal(false);
              toast.success("Personal server added");
              setSideItem("My Servers");
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Could not add server",
              );
            }
          }}
          onCancel={() => setCreatingPersonal(false)}
        />
      )}

      {empty ? (
        <div className="cf-panel rounded-xl flex flex-col items-center justify-center min-h-50 gap-2 text-center px-4">
          <Icon icon={AppIcons.Servers} size={28} className="text-text-disabled" />
          <p className="text-[13px] text-text-muted">
            {mode === "favorites"
              ? "No favorite servers yet."
              : mode === "recent"
                ? "No recent servers yet."
                : "No servers listed yet."}
          </p>
          <p className="text-[10px] text-text-disabled max-w-md">
            {mode === "favorites"
              ? "Star a server from All servers to pin it here."
              : mode === "recent"
                ? "Join a server from the list and it will appear here."
                : "Add a personal bookmark, or a guild server if you can manage this guild. Minecraft's in-game multiplayer list is not imported."}
          </p>
        </div>
      ) : null}

      {featured && featuredLive ? (
        <button
          type="button"
          onClick={() => markRecent(featured.id)}
          className="relative min-h-65 overflow-hidden rounded-xl border border-border-subtle text-left cursor-pointer group"
        >
          <EntityImage
            kind="server"
            entityId={featured.id}
            source={featured.coverUrl || featured.thumbnail}
            alt={`${featured.name} server landscape`}
            className="absolute inset-0 h-full w-full"
            fit="cover"
          />
          <div className="absolute inset-0 bg-linear-to-r from-bg-app via-bg-app/82 to-bg-app/25" />
          <div className="relative z-10 p-6">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[10px] uppercase tracking-widest text-primary-base font-semibold">
                Featured guild server
              </span>
              <FavoriteToggle serverId={featured.id} />
            </div>
            <h2 className="font-sora text-2xl font-bold text-text-primary mt-1">
              {featured.name}
            </h2>
            <p className="text-sm text-text-secondary mt-2 max-w-lg">
              {featured.description}
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-text-muted">
              <span className="flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 rounded-full ${statusDotClass(featuredLive.online)}`}
                />
                {featuredLive.online === true
                  ? `${featuredLive.playersOnline} / ${featuredLive.playersMax} online`
                  : featuredLive.online === false
                    ? "Offline"
                    : "Checking…"}
                <span className="text-text-disabled">· {featuredLive.label}</span>
              </span>
              <span>{featuredLive.joinAddress}</span>
              {featuredLive.online === true && featuredLive.pingMs > 0 ? (
                <span>~{Math.round(featuredLive.pingMs)} ms</span>
              ) : null}
              <span>{featured.loader}</span>
            </div>
            {featuredLive.playerNames.length > 0 ? (
              <p className="mt-2 max-w-lg truncate text-[11px] text-text-secondary">
                Playing: {featuredLive.playerNames.join(", ")}
              </p>
            ) : null}
            <span className="cf-btn-primary mt-5 inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-bold">
              <Icon icon={AppIcons.Servers} size={16} />
              Join / overview
            </span>
          </div>
        </button>
      ) : null}

      {(rest.length > 0 || personalList.length > 0) && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {rest.map((server) => {
            const live = liveStatsFor(
              server,
              mping,
              runtimeByServer[server.id],
              presenceByServer[server.id],
            );
            return (
              <button
                key={server.id}
                type="button"
                onClick={() => markRecent(server.id)}
                className="cf-panel group overflow-hidden rounded-xl text-left cursor-pointer"
              >
                <EntityImage
                  kind="server"
                  entityId={server.id}
                  source={server.coverUrl || server.thumbnail}
                  alt={`${server.name} server thumbnail`}
                  className="aspect-16/7 w-full border-b border-border-subtle transition-transform duration-300 group-hover:scale-[1.015]"
                  fit="cover"
                />
                <div className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDotClass(live.online)}`}
                      />
                      <span className="truncate text-sm font-medium text-text-primary">
                        {server.name}
                      </span>
                      <span className="rounded-full bg-primary-base/12 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-primary-base">
                        Guild
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-text-muted">
                      {live.playersOnline}/{live.playersMax}
                      {live.pingMs > 0 ? ` · ${Math.round(live.pingMs)} ms` : ""}
                      {" · "}
                      {live.label}
                      {live.playerNames.length
                        ? ` · ${live.playerNames.slice(0, 3).join(", ")}${live.playerNames.length > 3 ? "…" : ""}`
                        : ` · ${server.version}`}
                    </div>
                  </div>
                  <FavoriteToggle serverId={server.id} />
                </div>
              </button>
            );
          })}
          {personalList.map((server) => {
            const join = personalServerJoinAddress(server);
            const addr = `${join.address}:${join.port}`;
            return (
              <PersonalRow
                key={server.id}
                server={server}
                live={mping[addr]}
                onOpen={() => {
                  touchRecent(server.id);
                  selectPersonal(server.id);
                  setSideItem("My Servers");
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function ServersPage() {
  const sideItem = useNavigationStore((s) => s.sideItem);
  let body: ReactNode;
  if (sideItem === "My PCs") body = <MyPcsPage />;
  else if (sideItem === "My Servers") body = <MyServersPage />;
  else if (sideItem === "Favorites")
    body = <CombinedServersView mode="favorites" />;
  else if (sideItem === "Recent") body = <CombinedServersView mode="recent" />;
  else body = <CombinedServersView mode="all" />;
  return <ServersPageShell>{body}</ServersPageShell>;
}

export default ServersPage;
