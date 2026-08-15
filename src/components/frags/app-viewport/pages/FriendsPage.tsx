import { useEffect } from "react";
import { useFriendsStore } from "../../../../stores/friends";
import { useFriendsRosterStore } from "../../../../stores/friendsRoster";
import { useAppStore } from "../../../../userstore";
import { useProfileRouteStore } from "../../../../stores/profileRoute";
import { UserAvatar } from "../../../UserAvatar";
import { cn } from "../../../../lib/cn";
import { toast } from "sonner";

export default function FriendsPage() {
  const search = useFriendsStore((s) => s.query);
  const setSearch = useFriendsStore((s) => s.setQuery);
  const statusFilter = useFriendsStore((s) => s.statusFilter);
  const setStatusFilter = useFriendsStore((s) => s.setStatusFilter);
  const friends = useFriendsRosterStore((s) => s.friends);
  const incoming = useFriendsRosterStore((s) => s.incoming);
  const accept = useFriendsRosterStore((s) => s.accept);
  const reject = useFriendsRosterStore((s) => s.reject);
  const remove = useFriendsRosterStore((s) => s.remove);
  const loading = useFriendsRosterStore((s) => s.loading);
  const error = useFriendsRosterStore((s) => s.error);
  const fromCache = useFriendsRosterStore((s) => s.fromCache);
  const refresh = useFriendsRosterStore((s) => s.refresh);
  const clientReady = useAppStore((s) => s.clientReady);
  const authStatus = useAppStore((s) => s.authStatus);
  const authSource = useAppStore((s) => s.authSource);
  const openFriend = useProfileRouteStore((s) => s.openFriend);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    if (authSource === "cached" || !clientReady) {
      void useFriendsRosterStore.getState().loadCached();
      return;
    }
    void refresh();
  }, [clientReady, authStatus, authSource, refresh]);

  const q = search.trim().toLowerCase();
  const filtered = friends.filter((f) => {
    if (statusFilter !== "all" && f.status !== statusFilter) return false;
    if (!q) return true;
    return (
      f.name.toLowerCase().includes(q) ||
      f.title.toLowerCase().includes(q) ||
      f.id.toLowerCase().includes(q)
    );
  });
  const onlineCount = friends.filter((f) => f.status === "online").length;
  const remotePaused = authSource === "cached" || !clientReady;

  return (
    <div className="h-full overflow-y-auto scroll-hidden p-4 pb-24 flex flex-col gap-4">
      <header className="cf-panel rounded-xl px-4 py-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="font-sora text-[18px] font-bold text-text-primary">
            Friends
          </h2>
          <p className="text-[12px] text-text-muted mt-1">
            {fromCache || remotePaused
              ? "Showing cached roster — presence is offline until CultForge is reachable."
              : "Live roster from CultForge — presence updates over the sidecar bridge."}
          </p>
        </div>
        <div className="flex items-center gap-3 text-[12px] text-text-secondary">
          <span>
            <span className="text-primary-base font-semibold tabular-nums">
              {onlineCount}
            </span>{" "}
            online · {friends.length} total
          </span>
          <button
            type="button"
            onClick={() => {
              if (remotePaused) {
                toast.message("Remote offline", {
                  description:
                    "Friends refresh needs CultForge APIs. Showing cached roster.",
                });
                void useFriendsRosterStore.getState().loadCached();
                return;
              }
              void refresh();
            }}
            disabled={loading}
            className="px-2.5 py-1.5 rounded-lg border border-white/12 text-[11px] font-semibold hover:border-white/25 cursor-pointer disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search friends…"
          className="w-full sm:max-w-sm px-3.5 py-2.5 rounded-xl text-[13px] bg-black/30 border border-white/10 text-text-primary placeholder:text-text-disabled outline-none focus:border-primary-base/40"
        />
        <div className="flex gap-1">
          {(["all", "online", "offline"] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border cursor-pointer capitalize",
                statusFilter === filter
                  ? "border-primary-base/40 bg-primary-base/10 text-primary-base"
                  : "border-white/10 text-text-muted hover:border-white/20",
              )}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="text-sm text-state-error" role="alert">
          {error}
        </p>
      ) : null}

      {incoming.length > 0 && (
        <section className="cf-panel rounded-xl p-3.5 flex flex-col gap-2">
          <h3 className="text-[12px] font-semibold text-text-primary">
            Incoming requests ({incoming.length})
          </h3>
          {incoming.map((row) => (
            <div
              key={row.connectionId}
              className="flex items-center gap-2 justify-between"
            >
              <span className="text-[12px] text-text-secondary truncate">
                {row.username}
              </span>
              <div className="flex gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    void accept(row).then((r) =>
                      toast[r.ok ? "success" : "error"](r.message),
                    );
                  }}
                  className="cf-btn-primary rounded-lg px-2.5 py-1 text-[10px] font-semibold cursor-pointer"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void reject(row).then((r) =>
                      toast[r.ok ? "success" : "error"](r.message),
                    );
                  }}
                  className="rounded-lg border border-white/12 px-2.5 py-1 text-[10px] cursor-pointer"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {!loading && filtered.length === 0 ? (
        <div className="cf-panel rounded-xl px-4 py-14 text-center">
          <p className="text-[14px] font-semibold text-text-primary">
            {friends.length === 0 ? "No friends yet" : "No matches"}
          </p>
          <p className="mt-2 text-[12px] text-text-muted max-w-sm mx-auto">
            {friends.length === 0
              ? "Add friends on CultForge, then refresh. Use Guilds → Find Players to look someone up."
              : "Try a different search or status filter."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((friend) => (
            <li key={friend.id}>
              <button
                type="button"
                onClick={() => openFriend(friend.id)}
                className="w-full cf-panel rounded-xl px-3 py-3 flex items-center gap-3 text-left cursor-pointer hover:bg-white/[0.03]"
              >
                <div className="relative h-10 w-10 shrink-0">
                  <UserAvatar
                    src={friend.avatarUrl}
                    name={friend.name}
                    className="h-10 w-10 rounded-full border border-white/10"
                  />
                  <span
                    className={cn(
                      "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-bg-app",
                      friend.status === "online"
                        ? "bg-primary-base"
                        : "bg-text-disabled",
                    )}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-text-primary truncate">
                    {friend.name}
                  </div>
                  <div className="text-[11px] text-text-muted truncate">
                    {friend.title} · {friend.activity}
                    {friend.stats.kills || friend.stats.deaths
                      ? ` · ${friend.stats.kills}/${friend.stats.deaths} K/D`
                      : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(friend.id).then((r) =>
                      toast[r.ok ? "success" : "error"](r.message),
                    );
                  }}
                  className="rounded-lg border border-white/12 px-2 py-1 text-[10px] text-text-muted cursor-pointer hover:text-text-primary"
                >
                  Remove
                </button>
                <span
                  className={cn(
                    "text-[10px] font-semibold uppercase tracking-wide",
                    friend.status === "online"
                      ? "text-primary-base"
                      : "text-text-disabled",
                  )}
                >
                  {friend.status}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
