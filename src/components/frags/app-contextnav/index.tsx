import { useEffect, useState, type ReactNode } from "react";
import {
  useDownloadStore,
  useNavigationStore,
  type PrimaryTab,
} from "../../../typlibs";
import { AppIcons } from "../../icons";
import { Icon } from "../../ico";
import { friendById } from "../../../data/friends";
import { useProfileRouteStore } from "../../../stores/profileRoute";
import { useFriendsRosterStore } from "../../../stores/friendsRoster";
import {
  UPDATE_FILTERS,
  filterUpdates,
  totalUpdateSizeLabel,
  type UpdateFilter,
} from "../../../data/updates";
import { DISCOVER_FILTERS } from "../../../data/news";
import { useDiscoverStore } from "../../../stores/discover";
import { useUpdatesStore } from "../../../stores/updates";
import { useBuildStore } from "../../../stores/build";
import {
  useSettingsUiStore,
  type SettingsCategory,
} from "../../../stores/settingsUi";
import {
  hasDiscordSource,
  parseDiscordGuildSource,
} from "../../../lib/discordWidget";
import { useDiscordWidget } from "../../../hooks/useDiscordWidget";
import { useSettingsStore } from "../../../stores/settings";
import {
  useBuildUiStore,
  type BuildTabId,
} from "../../../stores/buildUi";
import { useGuildStore } from "../../../stores/guilds";
import {
  backupsForBuild,
  worldsForBuild,
} from "../../../data/buildContent";
import {
  DEMO_ACTIVITY,
  DEMO_FORUMS,
  eventTypeLabel,
  getGuild,
  joinedGuilds,
  serversForGuild,
  type GuildHubTab,
} from "../../../data/guilds";
import { cn } from "../../../lib/cn";
import { useNow } from "../../../lib/clock";
import { isHomeBuildsView } from "../../../lib/homeNav";
import {
  compareTimedEvents,
  getEventPhase,
} from "../../../lib/timedEvents";
import { EventCountdown } from "../../events/EventCountdown";
import { useAppStore } from "../../../userstore";
import {
  capabilitiesForRole,
  membershipForUser,
} from "../../../lib/guildPermissions";
import { GuildIcon } from "../../GuildIcon";
import { acceptGuildInvite } from "../../../lib/cultApi";
import { useGuildModalsStore } from "../../../stores/guildModals";
import { toast } from "sonner";

function Shell({ children }: { children: ReactNode }) {
  return (
    <aside className="app-context-win cf-glass w-70 shrink-0 h-full border-l border-white/8 p-3.5 pb-24 flex flex-col gap-3 overflow-y-auto scroll-hidden">
      {children}
    </aside>
  );
}

function normalizeInviteCode(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (url.hostname.replace(/^www\./, "").endsWith("invite.cultforge.com")) {
      const seg = url.pathname.split("/").filter(Boolean)[0];
      return (seg || "").trim();
    }
  } catch {
    /* not a URL */
  }
  const pathMatch = trimmed.match(
    /(?:invite\.cultforge\.com\/)?([A-Za-z0-9_-]+)\s*$/i,
  );
  return (pathMatch?.[1] || trimmed).trim();
}

function HomeGuildContext() {
  const now = useNow();
  const setPrimaryTab = useNavigationStore((s) => s.setPrimaryTab);
  const setSideItem = useNavigationStore((s) => s.setSideItem);
  const activeGuildId = useGuildStore((s) => s.activeGuildId);
  const setActiveGuild = useGuildStore((s) => s.setActiveGuild);
  const setHubTab = useGuildStore((s) => s.setHubTab);
  const members = useGuildStore((s) => s.members);
  const events = useGuildStore((s) => s.events);
  const catalogRevision = useGuildStore((s) => s.guildCatalogRevision);
  const hydrateMyGuilds = useGuildStore((s) => s.hydrateMyGuilds);
  const openGuildModal = useGuildModalsStore((s) => s.open);
  const userId = useAppStore((s) => s.currentUser?.id ?? "");
  void catalogRevision;

  const [inviteDraft, setInviteDraft] = useState("");
  const [joining, setJoining] = useState(false);

  const joined = joinedGuilds().filter((guild) =>
    members.some((m) => m.guildId === guild.id && m.userId === userId),
  );
  // Prefer catalog membership even if member row hydrate lagged.
  const catalogJoined = joined.length
    ? joined
    : joinedGuilds().filter((g) => g.joined);
  const active =
    catalogJoined.find((g) => g.id === activeGuildId) ??
    catalogJoined[0] ??
    null;
  const membership = active
    ? membershipForUser(members, active.id, userId)
    : null;
  const xpPct = active
    ? Math.min(100, Math.round((active.xp / Math.max(1, active.xpMax)) * 100))
    : 0;

  const guildEvents = [...events]
    .filter((event) => !active || event.guildId === active.id)
    .sort(compareTimedEvents)
    .filter((event) => {
      const phase = getEventPhase(event, now);
      return phase === "live" || phase === "upcoming";
    })
    .slice(0, 4);

  const onlineMembers = active
    ? members.filter(
        (member) =>
          member.guildId === active.id && member.status === "online",
      )
    : [];

  const openGuildHub = (tab: GuildHubTab = "Overview") => {
    if (active) setActiveGuild(active.id);
    setHubTab(tab);
    useGuildStore.getState().setDiscoverOpen(false);
    setPrimaryTab("Guilds" as PrimaryTab);
    setSideItem("Guilds");
  };

  const joinByCode = async () => {
    const code = normalizeInviteCode(inviteDraft);
    if (!code) {
      toast.error("Enter an invite code");
      return;
    }
    setJoining(true);
    try {
      await acceptGuildInvite(code);
      setInviteDraft("");
      toast.success("Joined guild");
      await hydrateMyGuilds();
      openGuildHub();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not join guild");
    } finally {
      setJoining(false);
    }
  };

  return (
    <Shell>
      <section className="cf-panel rounded-xl p-3.5 flex flex-col gap-3 border border-primary-base/20">
        <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          Guilds
        </div>
        {active ? (
          <>
            <div className="flex items-center gap-3">
              <GuildIcon
                src={active.icon}
                name={active.name}
                className={cn(
                  "h-14 w-14 rounded-xl border border-white/10 bg-linear-to-br text-bg-app text-[16px]",
                  active.accent,
                )}
              />
              <div className="flex flex-col min-w-0 gap-0.5">
                <span className="text-[14px] font-sora font-bold text-text-primary truncate">
                  {active.name}
                </span>
                <span className="text-[11px] text-text-muted truncate">
                  [{active.tag}] · {membership?.role ?? "Member"}
                  {catalogJoined.length > 1
                    ? ` · ${catalogJoined.length} guilds`
                    : ""}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[10px] text-text-muted">
                <span>Guild XP</span>
                <span className="text-primary-base tabular-nums">
                  {active.xp.toLocaleString()} / {active.xpMax.toLocaleString()}
                </span>
              </div>
              <div className="w-full h-1.5 cf-panel-inset rounded-full overflow-hidden">
                <div
                  className="h-full bg-linear-to-r from-primary-muted to-primary-base rounded-full"
                  style={{ width: `${xpPct}%` }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => openGuildHub()}
              className="w-full py-2.5 text-[11px] font-semibold uppercase tracking-wide cf-panel-inset hover:bg-white/6 text-text-secondary rounded-lg cursor-pointer active:scale-[0.98] transition-all border border-white/8"
            >
              Open Guild Hub
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 rounded-xl bg-linear-to-br from-primary-muted to-primary-base flex items-center justify-center shrink-0 border border-white/10">
                <Icon icon={AppIcons.Crown} className="text-bg-app" size={22} />
              </div>
              <div className="flex flex-col min-w-0 gap-0.5">
                <span className="text-[14px] font-sora font-bold text-text-primary truncate">
                  No guild yet
                </span>
                <span className="text-[11px] text-text-muted">
                  Join with an invite or create your own
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => openGuildModal("create")}
                className="w-full py-2.5 text-[11px] font-semibold uppercase tracking-wide rounded-lg cursor-pointer active:scale-[0.98] transition-all border border-primary-base/35 text-primary-base hover:bg-primary-base/10"
              >
                Create guild
              </button>
              <button
                type="button"
                onClick={() => openGuildHub()}
                className="w-full py-2.5 text-[11px] font-semibold uppercase tracking-wide cf-panel-inset hover:bg-white/6 text-text-secondary rounded-lg cursor-pointer active:scale-[0.98] transition-all border border-white/8"
              >
                Open hub
              </button>
            </div>
          </>
        )}
      </section>

      <section className="cf-panel rounded-xl p-3.5 flex flex-col gap-2.5">
        <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          Join with invite
        </div>
        <input
          type="text"
          value={inviteDraft}
          onChange={(e) => setInviteDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void joinByCode();
          }}
          placeholder="Code or invite.cultforge.com/…"
          disabled={joining}
          className="w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-[12px] text-text-primary placeholder:text-text-disabled outline-none focus:border-primary-base/40"
        />
        <button
          type="button"
          disabled={joining || !inviteDraft.trim()}
          onClick={() => void joinByCode()}
          className="w-full py-2 text-[11px] font-semibold rounded-lg border border-primary-base/35 text-primary-base hover:bg-primary-base/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {joining ? "Joining…" : "Enter invite code"}
        </button>
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-[9px] uppercase tracking-[0.16em] text-text-muted font-semibold px-0.5">
          Guild Activity
        </label>
        <div className="cf-panel rounded-xl p-1.5 flex flex-col gap-0.5">
          {guildEvents.map((event) => {
            const phase = getEventPhase(event, now);
            return (
              <div
                key={event.id}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/3 transition-colors"
              >
                <div
                  className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 border border-border-subtle ${
                    phase === "live"
                      ? "bg-primary-base/15 text-primary-base"
                      : "bg-white/4 text-text-muted"
                  }`}
                >
                  <Icon icon={AppIcons.Activity} size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-text-primary font-medium truncate">
                    {event.title}
                  </div>
                  <EventCountdown
                    event={event}
                    title={event.title}
                    variant="compact"
                  />
                </div>
                <span
                  className={`text-[9px] font-semibold uppercase tracking-wide shrink-0 ${
                    phase === "live"
                      ? "text-primary-base"
                      : "text-text-disabled"
                  }`}
                >
                  {phase === "live" ? "Live" : eventTypeLabel(event)}
                </span>
              </div>
            );
          })}
          {guildEvents.length === 0 && (
            <div className="px-3 py-3 text-[10px] text-text-muted">
              No scheduled guild events
            </div>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2 flex-1 min-h-0">
        <label className="text-[9px] uppercase tracking-[0.16em] text-text-muted font-semibold px-0.5">
          Online Members · {onlineMembers.length}
        </label>
        <div className="cf-panel rounded-xl p-1.5 flex flex-col gap-0.5 flex-1 min-h-0 overflow-y-auto scroll-hidden">
          {onlineMembers.length === 0 ? (
            <div className="px-3 py-3 text-[10px] text-text-muted">
              {active
                ? "No members online right now"
                : "Join a guild to see members"}
            </div>
          ) : (
            onlineMembers.slice(0, 12).map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/4 transition-colors"
              >
                <div className="relative shrink-0">
                  <div className="w-7 h-7 rounded-md bg-white/8 flex items-center justify-center text-[10px] font-bold text-text-secondary">
                    {(m.name || "?").slice(0, 1).toUpperCase()}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary-base border-[1.5px] border-bg-card" />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[12px] text-text-primary truncate font-medium flex items-center gap-1">
                    {m.name}
                    {m.role === "Leader" && (
                      <Icon
                        icon={AppIcons.Crown}
                        size={10}
                        className="text-primary-base"
                      />
                    )}
                  </span>
                  <span className="text-[10px] text-text-muted truncate">
                    {m.role}
                  </span>
                </div>
              </div>
            ))
          )}
          {active && (
            <button
              type="button"
              onClick={() => openGuildHub("Members")}
              className="mt-1 w-full py-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted hover:text-primary-base cursor-pointer transition-colors"
            >
              View All Members
            </button>
          )}
        </div>
      </section>
    </Shell>
  );
}

function HomeDiscoverContext() {
  const category = useDiscoverStore((s) => s.category);
  const setCategory = useDiscoverStore((s) => s.setCategory);
  const stories = useDiscoverStore((s) => s.stories);
  const refresh = useDiscoverStore((s) => s.refresh);
  const filteredStories = useDiscoverStore((s) => s.filteredStories);
  const reading = filteredStories().slice(0, 3);
  const lead = reading[0];

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Shell>
      <section className="cf-panel rounded-xl overflow-hidden flex flex-col">
        {lead ? (
          <>
            <div
              className="h-24 border-b border-white/6"
              style={{ background: lead.thumb }}
            />
            <div className="p-3.5 flex flex-col gap-1.5">
              <span className="text-[9px] uppercase tracking-wider text-primary-base font-semibold">
                Briefing
              </span>
              <span className="text-[13px] font-semibold text-text-primary">
                {lead.title}
              </span>
              <span className="text-[11px] text-text-muted leading-snug line-clamp-3">
                {lead.dek}
              </span>
            </div>
          </>
        ) : (
          <div className="p-3.5 text-[12px] text-text-muted">
            No Feed stories yet.
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-[9px] uppercase tracking-[0.16em] text-text-muted font-semibold px-0.5">
          Topics
        </label>
        <div className="flex flex-wrap gap-1.5">
          {DISCOVER_FILTERS.map((c) => {
            const active = category === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={
                  active
                    ? "px-2.5 py-1 text-[11px] rounded-full border border-primary-base/40 bg-primary-base/12 text-primary-base cursor-pointer"
                    : "px-2.5 py-1 text-[11px] rounded-full border border-white/10 text-text-muted bg-black/20 hover:text-text-primary cursor-pointer"
                }
              >
                {c}
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-2 flex-1 min-h-0">
        <label className="text-[9px] uppercase tracking-[0.16em] text-text-muted font-semibold px-0.5">
          Reading list
        </label>
        <div className="cf-panel rounded-xl p-1.5 flex flex-col gap-0.5">
          {reading.length === 0 ? (
            <div className="px-2.5 py-3 text-[11px] text-text-muted">
              Nothing in the reading list.
            </div>
          ) : (
            reading.map((n) => (
              <div
                key={n.id}
                className="px-2.5 py-2 rounded-lg hover:bg-white/3"
              >
                <div className="text-[11px] text-text-primary font-medium line-clamp-2">
                  {n.title}
                </div>
                <div className="text-[10px] text-text-disabled mt-0.5">
                  {n.category} · {n.readMin} min
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="cf-panel rounded-xl p-3 flex flex-col gap-1.5">
        <span className="text-[9px] uppercase tracking-[0.16em] text-text-muted font-semibold">
          This week
        </span>
        <div className="flex justify-between text-[12px] text-text-secondary">
          <span>Stories</span>
          <span className="text-text-primary font-semibold">{stories.length}</span>
        </div>
        <div className="flex justify-between text-[12px] text-text-secondary">
          <span>Filter</span>
          <span className="text-primary-base font-semibold">{category}</span>
        </div>
      </section>
    </Shell>
  );
}

function HomeUpdatesContext() {
  const filter = useUpdatesStore((s) => s.filter);
  const setFilter = useUpdatesStore((s) => s.setFilter);
  const lastChecked = useUpdatesStore((s) => s.lastChecked);
  const items = useUpdatesStore((s) => s.items);
  const history = useUpdatesStore((s) => s.history);

  const pending = filterUpdates(items, "All");
  const filtered = filterUpdates(items, filter);
  const builds = pending.filter((u) => u.kind === "build").length;
  const mods = pending.filter((u) => u.kind === "mod").length;
  const launcher = pending.filter((u) => u.kind === "launcher").length;

  const filterLabel = (f: UpdateFilter) => {
    if (f === "All") return "All";
    if (f === "build") return "Builds";
    if (f === "mod") return "Mods";
    return "Launcher";
  };

  return (
    <Shell>
      <section className="cf-panel rounded-xl p-3.5 flex flex-col gap-3">
        <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          Updates
        </div>
        <div className="flex justify-between items-end">
          <div>
            <div className="text-2xl font-sora font-bold text-text-primary">
              {pending.length}
            </div>
            <div className="text-[10px] text-text-muted uppercase tracking-wider">
              Pending · {totalUpdateSizeLabel(pending)}
            </div>
          </div>
          <div className="text-right text-[11px] text-text-secondary space-y-0.5">
            <div>
              <span className="text-primary-base font-semibold">{builds}</span>{" "}
              builds
            </div>
            <div>
              <span className="text-text-primary font-semibold">{mods}</span> mods
            </div>
            <div>
              <span className="text-text-primary font-semibold">{launcher}</span>{" "}
              launcher
            </div>
          </div>
        </div>
        <p className="text-[10px] text-text-disabled">
          Last checked {lastChecked}
        </p>
        <button
          type="button"
          className="cf-btn-primary w-full py-2.5 rounded-lg text-[12px] cursor-pointer"
        >
          Update all
        </button>
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-[9px] uppercase tracking-[0.16em] text-text-muted font-semibold px-0.5">
          Filter
        </label>
        <div className="flex flex-wrap gap-1.5">
          {UPDATE_FILTERS.map((f) => {
            const active = filter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "px-2.5 py-1 text-[11px] rounded-full border cursor-pointer",
                  active
                    ? "border-primary-base/40 bg-primary-base/12 text-primary-base"
                    : "border-white/10 text-text-muted bg-black/20 hover:text-text-primary",
                )}
              >
                {filterLabel(f)}
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-1.5">
        <label className="text-[9px] uppercase tracking-[0.16em] text-text-muted font-semibold px-0.5">
          Queue
        </label>
        <div className="cf-panel rounded-xl p-1.5 flex flex-col gap-0.5">
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-[11px] text-text-muted">
              Nothing in this filter
            </div>
          ) : (
            filtered.map((u) => (
              <div
                key={u.id}
                className="rounded-lg px-3 py-2 flex justify-between gap-2 hover:bg-white/3"
              >
                <span className="text-[12px] text-text-primary truncate">
                  {u.name}
                </span>
                <span className="text-[10px] text-text-muted shrink-0">
                  {u.size}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="flex flex-col gap-1.5 flex-1 min-h-0">
        <label className="text-[9px] uppercase tracking-[0.16em] text-text-muted font-semibold px-0.5">
          Recent
        </label>
        <div className="cf-panel rounded-xl p-1.5 flex flex-col gap-0.5">
          {history.length === 0 ? (
            <div className="px-3 py-3 text-[11px] text-text-muted">
              No recent updates
            </div>
          ) : (
            history.map((h) => (
              <div
                key={h.id}
                className="rounded-lg px-3 py-2 flex flex-col gap-0.5 hover:bg-white/3"
              >
                <span className="text-[12px] text-text-primary truncate">
                  {h.name}
                </span>
                <span className="text-[10px] text-text-disabled">
                  → {h.to} · {h.when}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <p className="text-[10px] text-text-disabled px-0.5">
        Auto-check on launch — on
      </p>
    </Shell>
  );
}

function StubContext({ tab }: { tab: PrimaryTab }) {
  const tabIcon =
    tab === "Admin"
      ? AppIcons.Security
      : (AppIcons[tab as keyof typeof AppIcons] ?? AppIcons.Home);
  return (
    <Shell>
      <section className="cf-panel rounded-xl p-4 flex flex-col gap-2">
        <Icon
          icon={tabIcon}
          size={22}
          className="text-primary-base"
        />
        <p className="text-[13px] font-medium text-text-primary">{tab}</p>
        <p className="text-[11px] text-text-muted leading-relaxed">
          Context for this area lands in a later pass.
        </p>
      </section>
    </Shell>
  );
}

function BuildsContext() {
  const active = useBuildStore((s) => s.active());
  const activeTab = useBuildUiStore((s) => s.activeTab);
  const setActiveTab = useBuildUiStore((s) => s.setActiveTab);
  const worldCount = worldsForBuild(active.id).length;
  const lastBackup = backupsForBuild(active.id)[0];

  const quickLinks: { tab: BuildTabId; label: string }[] = [
    { tab: "Mods", label: "Mods" },
    { tab: "World Management", label: "Worlds" },
    { tab: "Performance", label: "Perf" },
    { tab: "Backups", label: "Backups" },
  ];

  return (
    <Shell>
      <section className="cf-panel rounded-xl p-3.5 flex flex-col gap-3">
        <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          Active build
        </div>
        <div>
          <div className="font-sora text-[15px] font-bold text-text-primary truncate">
            {active.name}
          </div>
          <div className="text-[11px] text-text-muted mt-0.5">
            MC {active.mc} · {active.loader}
          </div>
        </div>
        <div className="text-[11px] text-text-secondary space-y-0.5">
          <div>
            <span className="text-primary-base font-semibold">
              {active.mods}
            </span>{" "}
            mods
          </div>
          <div>
            <span className="text-text-primary font-semibold">
              {worldCount}
            </span>{" "}
            worlds
          </div>
          <div className="text-text-muted">
            Last backup {lastBackup?.when ?? "never"}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-[9px] uppercase tracking-[0.16em] text-text-muted font-semibold px-0.5">
          Jump to
        </label>
        <div className="flex flex-wrap gap-1.5">
          {quickLinks.map(({ tab, label }) => {
            const activeLink = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-2.5 py-1 text-[11px] rounded-full border cursor-pointer",
                  activeLink
                    ? "border-primary-base/40 bg-primary-base/12 text-primary-base"
                    : "border-white/1 text-text-muted bg-black/20 hover:text-text-primary",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="cf-panel rounded-xl p-3 flex flex-col gap-1.5">
        <div className="text-[9px] uppercase tracking-[0.14em] text-text-muted font-semibold">
          Status
        </div>
        <div className="text-[12px] text-text-primary">{active.status}</div>
        <div className="text-[10px] text-text-muted">
          Last played {active.lastPlayed} · {active.size}
        </div>
      </section>
    </Shell>
  );
}

function GuildsContext() {
  const now = useNow();
  const sideItem = useNavigationStore((s) => s.sideItem);
  const guildId = useGuildStore((s) => s.activeGuildId);
  const hubTab = useGuildStore((s) => s.hubTab);
  const setHubTab = useGuildStore((s) => s.setHubTab);
  const selectedServerId = useGuildStore((s) => s.selectedServerId);
  const members = useGuildStore((s) => s.members);
  const events = useGuildStore((s) => s.events);
  const audit = useGuildStore((s) => s.audit);
  const userId = useAppStore((s) => s.currentUser?.id ?? "");
  const guild = getGuild(guildId);
  const joinedCount = new Set(
    members
      .filter((member) => member.userId === userId)
      .map((member) => member.guildId),
  ).size;
  const online = members.filter(
    (member) => member.guildId === guildId && member.status === "online",
  );
  const servers = serversForGuild(guildId);
  const selectedServer =
    servers.find((s) => s.id === selectedServerId) ?? servers[0];
  const xpPct = guild
    ? Math.min(100, Math.round((guild.xp / Math.max(1, guild.xpMax)) * 100))
    : 0;
  const membership = membershipForUser(members, guildId, userId);
  const capabilities = capabilitiesForRole(membership?.role);
  const scheduledEvents = events
    .filter((event) => event.guildId === guildId)
    .sort(compareTimedEvents);
  const nextEvent =
    scheduledEvents.find((event) => getEventPhase(event, now) === "live") ??
    scheduledEvents.find((event) => getEventPhase(event, now) === "upcoming");

  if (!guild) {
    return (
      <Shell>
        <div className="cf-panel rounded-xl p-4 text-[12px] text-text-muted flex flex-col gap-3">
          <p>
            Join or create a guild to see hub details here. Redeem an invite on
            Home, or found a new guild.
          </p>
          <button
            type="button"
            onClick={() => useGuildModalsStore.getState().open("create")}
            className="self-start rounded-lg border border-primary-base/35 px-3 py-1.5 text-[11px] font-semibold text-primary-base hover:bg-primary-base/10 cursor-pointer"
          >
            Create guild
          </button>
        </div>
      </Shell>
    );
  }

  const quickLinks: { tab: GuildHubTab; label: string }[] = [
    { tab: "News", label: "News" },
    { tab: "Events", label: "Events" },
    { tab: "Chat", label: "Chat" },
    { tab: "Servers", label: "Servers" },
    { tab: "Builds", label: "Builds" },
    { tab: "Activity", label: "Buzz" },
    ...(capabilities.openManagement
      ? [{ tab: "Manage" as const, label: "Manage" }]
      : []),
  ];

  if (sideItem === "Activity Feed") {
    return (
      <Shell>
        <section className="cf-panel rounded-xl p-3.5 flex flex-col gap-2">
          <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            Activity
          </div>
          <div className="text-2xl font-sora font-bold text-text-primary">
            {DEMO_ACTIVITY.length}
          </div>
          <p className="text-[11px] text-text-muted">Recent updates</p>
        </section>
        <div className="cf-panel rounded-xl p-1.5 flex flex-col gap-0.5">
          {DEMO_ACTIVITY.length === 0 ? (
            <div className="px-3 py-4 text-[11px] text-text-muted">
              No recent activity.
            </div>
          ) : (
            DEMO_ACTIVITY.slice(0, 4).map((a) => (
              <div
                key={a.id}
                className="px-3 py-2 text-[11px] text-text-secondary"
              >
                {a.text}
              </div>
            ))
          )}
        </div>
      </Shell>
    );
  }

  if (sideItem === "Find Players") {
    return (
      <Shell>
        <section className="cf-panel rounded-xl p-3.5 flex flex-col gap-2">
          <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            Search
          </div>
          <p className="text-[12px] text-text-secondary leading-relaxed">
            Look up players by exact username or user id. Results open their
            CultForge profile.
          </p>
        </section>
      </Shell>
    );
  }

  if (sideItem === "Forums") {
    return (
      <Shell>
        <section className="cf-panel rounded-xl p-3.5 flex flex-col gap-2">
          <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            Forums
          </div>
          <div className="text-2xl font-sora font-bold text-text-primary">
            {DEMO_FORUMS.length}
          </div>
          <p className="text-[11px] text-text-muted">Open threads</p>
        </section>
        <div className="cf-panel rounded-xl p-1.5 flex flex-col gap-0.5">
          {DEMO_FORUMS.length === 0 ? (
            <div className="px-3 py-4 text-[11px] text-text-muted">
              No open threads.
            </div>
          ) : (
            DEMO_FORUMS.slice(0, 3).map((t) => (
              <div key={t.id} className="px-3 py-2">
                <div className="text-[12px] text-text-primary truncate">
                  {t.title}
                </div>
                <div className="text-[10px] text-text-disabled">
                  {t.replies} replies
                </div>
              </div>
            ))
          )}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <section className="cf-panel rounded-xl p-3.5 flex flex-col gap-3 border border-primary-base/20">
        <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          Active guild
        </div>
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "h-12 w-12 rounded-xl bg-linear-to-br flex items-center justify-center shrink-0 border border-white/10",
              guild.accent,
            )}
          >
            <Icon icon={AppIcons.Crown} className="text-bg-app" size={20} />
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-sora font-bold text-text-primary truncate">
              {guild.name}
            </div>
            <div className="text-[11px] text-text-muted">
              Level {guild.level} · {guild.memberCount} members
            </div>
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
          <div
            className="h-full rounded-full bg-linear-to-r from-primary-muted to-primary-base"
            style={{ width: `${xpPct}%` }}
          />
        </div>
        <p className="text-[10px] text-text-disabled">
          {membership?.role ?? "Guest"} · Member of {joinedCount} guilds
        </p>
      </section>

      {nextEvent && (
        <button
          type="button"
          onClick={() => setHubTab("Events")}
          className="cf-panel rounded-xl p-3.5 text-left hover:border-primary-base/30 cursor-pointer"
        >
          <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            {getEventPhase(nextEvent, now) === "live"
              ? "Live event"
              : "Next event"}
          </div>
          <div className="mt-2 truncate text-[12px] font-semibold text-text-primary">
            {nextEvent.title}
          </div>
          <EventCountdown
            event={nextEvent}
            title={nextEvent.title}
            variant="compact"
            className="mt-1"
          />
        </button>
      )}

      {capabilities.openManagement && audit.some((item) => item.guildId === guildId) && (
        <section className="cf-panel rounded-xl p-3.5">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">
            Latest management action
          </div>
          {audit
            .filter((item) => item.guildId === guildId)
            .slice(0, 1)
            .map((item) => (
              <div key={item.id} className="mt-2">
                <div className="text-[10px] font-semibold text-text-primary">
                  {item.action}
                </div>
                <div className="mt-0.5 text-[9px] text-text-muted">
                  {item.target}
                </div>
              </div>
            ))}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <label className="text-[9px] uppercase tracking-[0.16em] text-text-muted font-semibold px-0.5">
          Jump to
        </label>
        <div className="flex flex-wrap gap-1.5">
          {quickLinks.map(({ tab, label }) => {
            const active = hubTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setHubTab(tab)}
                className={cn(
                  "px-2.5 py-1 text-[11px] rounded-full border cursor-pointer",
                  active
                    ? "border-primary-base/40 bg-primary-base/12 text-primary-base"
                    : "border-white/10 text-text-muted bg-black/20 hover:text-text-primary",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      {hubTab === "Servers" && selectedServer ? (
        <section className="cf-panel rounded-xl p-3.5 flex flex-col gap-1.5">
          <div className="text-[9px] uppercase tracking-[0.14em] text-text-muted font-semibold">
            Selected server
          </div>
          <div className="text-[13px] text-text-primary font-medium truncate">
            {selectedServer.name}
          </div>
          <div className="text-[11px] text-text-muted">
            {selectedServer.playersOnline} online · {selectedServer.pingMs} ms
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-1.5 flex-1 min-h-0">
          <label className="text-[9px] uppercase tracking-[0.16em] text-text-muted font-semibold px-0.5">
            Online ({online.length})
          </label>
          <div className="cf-panel rounded-xl p-1.5 flex flex-col gap-0.5">
            {online.slice(0, 6).map((m) => (
              <div
                key={m.id}
                className="rounded-lg px-3 py-2 text-[12px] text-text-primary truncate"
              >
                {m.name}
              </div>
            ))}
            {online.length === 0 && (
              <div className="px-3 py-3 text-[11px] text-text-muted">
                Nobody online
              </div>
            )}
          </div>
        </section>
      )}
    </Shell>
  );
}

function FriendsContext() {
  const openProfile = useProfileRouteStore((s) => s.openFriend);
  const target = useProfileRouteStore((s) => s.target);
  const selectedId = target?.kind === "friend" ? target.id : null;
  const selected = selectedId ? friendById(selectedId) : null;
  const friends = useFriendsRosterStore((s) => s.friends);
  const onlineCount = friends.filter((f) => f.status === "online").length;

  return (
    <Shell>
      <section className="cf-panel rounded-xl p-3.5 flex flex-col gap-2">
        <span className="text-[9px] uppercase tracking-[0.16em] text-text-muted font-semibold">
          Friends
        </span>
        <div className="flex justify-between text-[12px] text-text-secondary">
          <span>Online</span>
          <span className="text-primary-base font-semibold tabular-nums">
            {onlineCount}
          </span>
        </div>
        <div className="flex justify-between text-[12px] text-text-secondary">
          <span>Total</span>
          <span className="text-text-primary font-semibold tabular-nums">
            {friends.length}
          </span>
        </div>
        <p className="text-[11px] text-text-muted leading-relaxed pt-1">
          Live roster, requests, and presence. Open Friends to manage DMs.
        </p>
      </section>

      {selected && (
        <section className="cf-panel rounded-xl p-3.5 flex flex-col gap-2">
          <span className="text-[9px] uppercase tracking-[0.16em] text-text-muted font-semibold">
            Selected
          </span>
          <div className="text-[13px] text-text-primary font-semibold truncate">
            {selected.name}
          </div>
          <button
            type="button"
            onClick={() => openProfile(selected.id)}
            className="text-[11px] text-primary-base cursor-pointer text-left"
          >
            Open profile
          </button>
        </section>
      )}
    </Shell>
  );
}

function SettingsContext() {
  const category = useSettingsUiStore((s) => s.category);
  const setCategory = useSettingsUiStore((s) => s.setCategory);

  const chips = [
    { id: "appearance", label: "Themes" },
    { id: "general", label: "General" },
    { id: "audio", label: "Audio" },
    { id: "notifications", label: "Alerts" },
    { id: "paths", label: "Paths" },
  ] satisfies { id: SettingsCategory; label: string }[];

  return (
    <Shell>
      <section className="cf-panel rounded-xl p-3.5 flex flex-col gap-1.5">
        <span className="text-[9px] uppercase tracking-[0.16em] text-text-muted font-semibold">
          Settings
        </span>
        <p className="text-[12px] text-text-secondary leading-snug">
          Launcher-wide preferences. Instance config lives under Builds.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-[9px] uppercase tracking-[0.16em] text-text-muted font-semibold px-0.5">
          Jump to
        </label>
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={cn(
                "px-2.5 py-1 text-[11px] rounded-full border cursor-pointer",
                category === c.id
                  ? "border-primary-base/40 bg-primary-base/12 text-primary-base"
                  : "border-white/10 text-text-muted bg-black/20 hover:text-text-primary",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </section>
    </Shell>
  );
}

function DownloadsContext() {
  const queue = useDownloadStore((state) => state.queue);
  const active = queue.filter((item) =>
    ["active", "queued", "paused"].includes(item.status),
  );
  const done = queue.filter((item) => item.status === "done").length;
  const failed = queue.filter((item) => item.status === "error").length;

  return (
    <Shell>
      <section className="cf-panel rounded-xl p-3.5">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          Transfer summary
        </h3>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {[
            ["Active", active.length],
            ["Done", done],
            ["Issues", failed],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg border border-border-subtle bg-black/15 px-2 py-2 text-center"
            >
              <div className="text-[13px] font-bold text-text-primary">
                {value}
              </div>
              <div className="text-[8px] uppercase tracking-wider text-text-disabled">
                {label}
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="cf-panel rounded-xl p-3.5">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          Queue behavior
        </h3>
        <p className="mt-2 text-[10px] leading-relaxed text-text-muted">
          Store installs run through Tauri/Rust: cache, SHA-512 verify, then
          copy into the active build folder. Cancel stops the native job.
        </p>
      </section>
    </Shell>
  );
}

function DiscordContext() {
  const source = useSettingsStore((s) => s.settings.personalDiscordSource);
  const setSideItem = useNavigationStore((s) => s.setSideItem);
  const setCategory = useSettingsUiStore((s) => s.setCategory);
  const configured = hasDiscordSource(source);
  const parsed = source?.trim()
    ? parseDiscordGuildSource(source)
    : { ok: false as const, error: "" };
  const { data, loading, error } = useDiscordWidget(source);

  return (
    <Shell>
      <section className="cf-panel rounded-xl p-3.5 flex flex-col gap-2">
        <span className="text-[9px] uppercase tracking-[0.16em] text-text-muted font-semibold">
          Discord
        </span>
        <p className="text-[12px] text-text-secondary leading-snug">
          Live widget data from Discord&apos;s public guild API.
        </p>
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-text-muted">Status</span>
          <span
            className={cn(
              "font-semibold",
              configured ? "text-primary-base" : "text-text-disabled",
            )}
          >
            {configured ? "Configured" : "Not set"}
          </span>
        </div>
        {configured && parsed.ok && (
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-text-muted">Guild ID</span>
            <span className="font-mono text-[10px] text-text-primary">
              {parsed.guildId}
            </span>
          </div>
        )}
        {data && (
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-text-muted">Online now</span>
            <span className="font-semibold tabular-nums text-primary-base">
              {data.presence_count}
            </span>
          </div>
        )}
        {loading && (
          <p className="text-[10px] text-text-disabled">Refreshing widget…</p>
        )}
        {error && (
          <p className="text-[10px] text-state-warning leading-relaxed">
            {error}
          </p>
        )}
      </section>

      {configured ? (
        data?.instant_invite && (
          <section className="cf-panel rounded-xl p-3.5 flex flex-col gap-2">
            <a
              href={data.instant_invite}
              target="_blank"
              rel="noopener noreferrer"
              className="w-fit text-[11px] font-semibold text-primary-base hover:underline"
            >
              Join {data.name}
            </a>
          </section>
        )
      ) : (
        <section className="cf-panel rounded-xl p-3.5 flex flex-col gap-2">
          <p className="text-[11px] text-text-muted leading-relaxed">
            Add a guild ID or Discord widget URL in Settings → General.
          </p>
          <button
            type="button"
            onClick={() => {
              setSideItem("Settings");
              setCategory("general");
            }}
            className="w-fit cf-btn-primary rounded-lg px-3 py-2 text-[10px] font-semibold cursor-pointer"
          >
            Configure in Settings
          </button>
        </section>
      )}
    </Shell>
  );
}

function ContextWindow() {
  const primaryTab = useNavigationStore((s) => s.primaryTab);
  const sideItem = useNavigationStore((s) => s.sideItem);

  if (primaryTab === "Home") {
    if (sideItem === "Feed" || sideItem === "Discover") return <HomeDiscoverContext />;
    if (sideItem === "Updates") return <HomeUpdatesContext />;
    if (sideItem === "Friends") return <FriendsContext />;
    if (sideItem === "Discord") return <DiscordContext />;
    if (sideItem === "Settings") return <SettingsContext />;
    if (sideItem === "Downloads") return <DownloadsContext />;
    if (isHomeBuildsView(primaryTab, sideItem)) return <BuildsContext />;
    return <HomeGuildContext />;
  }

  if (primaryTab === "Builds") {
    return <BuildsContext />;
  }

  if (primaryTab === "Guilds") {
    return <GuildsContext />;
  }

  return <StubContext tab={primaryTab} />;
}

export default ContextWindow;
