import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { cn } from "../../lib/cn";
import {
  authFailureMessage,
  isUnauthorizedError,
  searchCultUser,
  type UserSearchScope,
} from "../../lib/client";
import { discoverFriends } from "../../lib/friendsApi";
import { mapApiProfileToCurrentUser } from "../../lib/authProfile";
import {
  cachePlayerProfile,
  mapFriendRecord,
  type FriendProfile,
} from "../../data/friends";
import { useProfileRouteStore } from "../../stores/profileRoute";
import { useFriendsRosterStore } from "../../stores/friendsRoster";
import { useDmStore } from "../../stores/dm";
import { useAppStore } from "../../userstore";

function toPlayerCard(raw: unknown): FriendProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const asFriend = mapFriendRecord(raw);
  if (asFriend) {
    cachePlayerProfile(asFriend);
    return asFriend;
  }
  const obj = raw as Record<string, unknown>;
  if (obj.message === "No user found") return null;
  if (obj.status === true && !obj.data && !obj.user) return null;
  const mapped = mapApiProfileToCurrentUser(raw);
  if (!mapped.id || !mapped.name) return null;
  const profile: FriendProfile = { ...mapped };
  cachePlayerProfile(profile);
  return profile;
}

export function FindPlayersPanel() {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<UserSearchScope>("prefix");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<FriendProfile[]>([]);
  const [searched, setSearched] = useState(false);
  const openFriend = useProfileRouteStore((s) => s.openFriend);
  const request = useFriendsRosterStore((s) => s.request);
  const openPeer = useDmStore((s) => s.openPeer);

  const onSearch = async (e?: FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q || (scope === "prefix" && q.length < 2)) {
      setError(
        scope === "prefix"
          ? "Enter at least 2 characters."
          : "Enter a username or user id.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    setResults([]);
    setSearched(true);
    try {
      if (scope === "prefix") {
        const rows = await discoverFriends(q, 20);
        const mapped = rows
          .map((row) => toPlayerCard(row))
          .filter((x): x is FriendProfile => Boolean(x));
        if (!mapped.length) {
          const fallback = await searchCultUser(q, "prefix", 20);
          const list = Array.isArray(fallback)
            ? fallback
            : fallback &&
                typeof fallback === "object" &&
                Array.isArray((fallback as { data?: unknown }).data)
              ? ((fallback as { data: unknown[] }).data)
              : [fallback];
          for (const row of list) {
            const player = toPlayerCard(row);
            if (player) mapped.push(player);
          }
        }
        setResults(mapped);
        if (!mapped.length) setError("No users found.");
        return;
      }
      const raw = await searchCultUser(q, scope);
      const player = toPlayerCard(raw);
      if (!player) {
        setError("No user found.");
        return;
      }
      setResults([player]);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        const msg = authFailureMessage(err);
        await useAppStore.getState().handleSessionExpired(msg);
        toast.message("Session issue", { description: msg });
        return;
      }
      const message = err instanceof Error ? err.message : "Search failed.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="cf-panel rounded-xl px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-sora text-[18px] font-bold text-text-primary">
            Find Players
          </h2>
          <p className="text-[12px] text-text-muted mt-1 max-w-lg">
            Prefix search, friend discover, or exact username / user id.
          </p>
        </div>
      </header>

      <form
        onSubmit={(e) => void onSearch(e)}
        className="flex flex-col sm:flex-row gap-2 sm:items-center"
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            scope === "prefix"
              ? "Start typing a name…"
              : scope === "username"
                ? "Exact username…"
                : "Exact user id…"
          }
          className="w-full sm:max-w-md px-3.5 py-2.5 rounded-xl text-[13px] bg-black/30 border border-white/10 text-text-primary placeholder:text-text-disabled outline-none focus:border-primary-base/40"
        />
        <div className="flex gap-1.5">
          {(["prefix", "username", "user_id"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setScope(id)}
              className={cn(
                "px-3 py-2 text-[11px] font-semibold rounded-lg border cursor-pointer",
                scope === id
                  ? "border-primary-base/40 bg-primary-base/12 text-primary-base"
                  : "border-white/8 text-text-muted hover:text-text-primary",
              )}
            >
              {id === "prefix"
                ? "Prefix"
                : id === "username"
                  ? "Username"
                  : "User ID"}
            </button>
          ))}
        </div>
        <button
          type="submit"
          disabled={busy}
          className="cf-btn-primary px-4 py-2.5 rounded-xl text-[12px] font-semibold cursor-pointer disabled:opacity-50"
        >
          {busy ? "Searching…" : "Search"}
        </button>
      </form>

      {error && (
        <p className="text-[12px] text-state-error" role="alert">
          {error}
        </p>
      )}

      {searched && !busy && results.length === 0 && !error && (
        <p className="text-[12px] text-text-muted">No matches.</p>
      )}

      <ul className="flex flex-col gap-2">
        {results.map((player) => (
          <li
            key={player.id}
            className="cf-panel rounded-xl px-3 py-3 flex items-center gap-3"
          >
            <button
              type="button"
              onClick={() => openFriend(player.id)}
              className="min-w-0 flex-1 text-left cursor-pointer"
            >
              <div className="text-[13px] font-semibold text-text-primary truncate">
                {player.name}
              </div>
              <div className="text-[11px] text-text-muted truncate">
                {player.title}
              </div>
            </button>
            <button
              type="button"
              onClick={() => void openPeer(player.id)}
              className="rounded-lg border border-white/12 px-2.5 py-1.5 text-[10px] cursor-pointer"
            >
              Message
            </button>
            <button
              type="button"
              onClick={() => {
                void request(player.id).then((r) =>
                  toast[r.ok ? "success" : "error"](r.message),
                );
              }}
              className="cf-btn-primary rounded-lg px-2.5 py-1.5 text-[10px] font-semibold cursor-pointer"
            >
              Add friend
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
