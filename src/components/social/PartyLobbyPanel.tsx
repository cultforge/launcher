import { useEffect, useState } from "react";
import { usePartyLobbyStore } from "../../stores/partyLobby";
import { useFriendsRosterStore } from "../../stores/friendsRoster";
import { useGuildStore } from "../../stores/guilds";
import { usePersonalServersStore } from "../../stores/personalServers";
import { useAppStore } from "../../userstore";
import { ShareDeepLinkButton } from "../CopyButton";
import { cn } from "../../lib/cn";
import { toast } from "sonner";

export function PartyLobbyPanel() {
  const lobby = usePartyLobbyStore((s) => s.lobby);
  const loading = usePartyLobbyStore((s) => s.loading);
  const busy = usePartyLobbyStore((s) => s.busy);
  const panelOpen = usePartyLobbyStore((s) => s.panelOpen);
  const setPanelOpen = usePartyLobbyStore((s) => s.setPanelOpen);
  const refreshMe = usePartyLobbyStore((s) => s.refreshMe);
  const create = usePartyLobbyStore((s) => s.create);
  const join = usePartyLobbyStore((s) => s.join);
  const invite = usePartyLobbyStore((s) => s.invite);
  const setReady = usePartyLobbyStore((s) => s.setReady);
  const setTarget = usePartyLobbyStore((s) => s.setTarget);
  const start = usePartyLobbyStore((s) => s.start);
  const leave = usePartyLobbyStore((s) => s.leave);
  const kick = usePartyLobbyStore((s) => s.kick);
  const cancel = usePartyLobbyStore((s) => s.cancel);

  const me = useAppStore((s) => s.currentUser?.id ?? "");
  const friends = useFriendsRosterStore((s) => s.friends);
  const guildId = useGuildStore((s) => s.activeGuildId);
  const guildServers = useGuildStore((s) => s.servers).filter(
    (s) => s.guildId === guildId,
  );
  const personalServers = usePersonalServersStore((s) => s.servers);
  const refreshPersonal = usePersonalServersStore((s) => s.refresh);

  const [joinCode, setJoinCode] = useState("");
  const [invitePick, setInvitePick] = useState("");
  const [targetPick, setTargetPick] = useState("");

  useEffect(() => {
    void refreshMe();
    void refreshPersonal();
  }, [refreshMe, refreshPersonal]);

  useEffect(() => {
    if (!lobby || lobby.status !== "starting" || !lobby.target) return;
    const t = lobby.target;
    if (t.address) {
      toast.success("Lobby starting — join target", {
        description: `${t.address}${t.port ? `:${t.port}` : ""}${
          t.buildName ? ` · ${t.buildName}` : ""
        }`,
      });
    }
  }, [lobby?.status, lobby?.target?.address, lobby?.id]);

  if (!panelOpen && !lobby) {
    return (
      <div className="cf-panel rounded-xl p-3 flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-text-primary">
            Party lobby
          </div>
          <div className="text-[10px] text-text-muted">
            Create a party, invite friends, ready up, start together.
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void create({
              scope: "personal",
              capacity: 4,
            })
          }
          className="cf-btn-primary rounded-lg px-3 py-1.5 text-[10px] font-semibold cursor-pointer disabled:opacity-40"
        >
          Create party
        </button>
        {guildId ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void create({
                scope: "guild",
                guildId,
                capacity: 8,
              })
            }
            className="rounded-lg border border-white/12 px-3 py-1.5 text-[10px] text-text-secondary cursor-pointer disabled:opacity-40"
          >
            Guild party
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="rounded-lg border border-white/12 px-3 py-1.5 text-[10px] text-text-secondary cursor-pointer"
        >
          Join with code
        </button>
      </div>
    );
  }

  const isHost = Boolean(
    lobby && (lobby.hostUserId === me || lobby.members.some((m) => m.userId === me && m.isHost)),
  );
  const myMember = lobby?.members.find((m) => m.userId === me);
  const allReady =
    Boolean(lobby?.members.length) &&
    lobby!.members.every((m) => m.ready || m.isHost);

  return (
    <div className="cf-panel rounded-xl p-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[12px] font-semibold text-text-primary">
            Party lobby
            {lobby ? (
              <span className="ml-2 text-[10px] font-normal text-text-muted">
                {lobby.status} · {lobby.members.length}/{lobby.capacity}
              </span>
            ) : null}
          </div>
          {lobby?.inviteCode ? (
            <div className="text-[10px] text-text-muted mt-0.5">
              Code {lobby.inviteCode}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          {lobby ? (
            <ShareDeepLinkButton
              link={{
                kind: "lobby",
                lobbyId: lobby.id,
                inviteCode: lobby.inviteCode ?? undefined,
              }}
              label="Share lobby"
            />
          ) : null}
          <button
            type="button"
            onClick={() => setPanelOpen(false)}
            className="rounded-lg border border-white/12 px-2 py-1 text-[10px] text-text-muted cursor-pointer"
          >
            Hide
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-[11px] text-text-muted">Loading…</p>
      ) : !lobby ? (
        <div className="flex flex-wrap gap-2 items-end">
          <label className="flex flex-col gap-1 text-[10px] text-text-muted flex-1 min-w-[8rem]">
            Invite code or lobby id
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              className="rounded-md border border-white/10 bg-black/25 px-2 py-1.5 text-[12px] text-text-primary"
            />
          </label>
          <button
            type="button"
            disabled={busy || !joinCode.trim()}
            onClick={() => {
              const code = joinCode.trim();
              void join(
                code.includes("-") || code.length > 20
                  ? { lobbyId: code }
                  : { inviteCode: code },
              );
            }}
            className="cf-btn-primary rounded-lg px-3 py-1.5 text-[10px] font-semibold cursor-pointer disabled:opacity-40"
          >
            Join
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void create({ scope: "personal", capacity: 4 })}
            className="rounded-lg border border-white/12 px-3 py-1.5 text-[10px] text-text-secondary cursor-pointer"
          >
            Create
          </button>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-1">
            {lobby.members.map((m) => (
              <li
                key={m.userId}
                className="flex items-center gap-2 rounded-lg border border-white/8 px-2.5 py-1.5"
              >
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    m.ready ? "bg-primary-base" : "bg-text-disabled",
                  )}
                />
                <span className="flex-1 min-w-0 text-[12px] text-text-primary truncate">
                  {m.username || m.userId}
                  {m.isHost ? (
                    <span className="ml-1 text-[9px] text-primary-base">
                      host
                    </span>
                  ) : null}
                </span>
                {isHost && m.userId !== me ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void kick(m.userId)}
                    className="text-[9px] text-state-error cursor-pointer"
                  >
                    Kick
                  </button>
                ) : null}
              </li>
            ))}
          </ul>

          {isHost ? (
            <div className="flex flex-wrap gap-2 items-end">
              <label className="flex flex-col gap-1 text-[10px] text-text-muted flex-1 min-w-[10rem]">
                Target server
                <select
                  value={targetPick}
                  onChange={(e) => setTargetPick(e.target.value)}
                  className="rounded-md border border-white/10 bg-black/25 px-2 py-1.5 text-[11px] text-text-primary"
                >
                  <option value="">Pick…</option>
                  {personalServers.map((s) => (
                    <option key={`p-${s.id}`} value={`personal:${s.id}`}>
                      Personal · {s.name}
                    </option>
                  ))}
                  {guildServers.map((s) => (
                    <option key={`g-${s.id}`} value={`guild:${s.id}`}>
                      Guild · {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={busy || !targetPick}
                onClick={() => {
                  const [kind, id] = targetPick.split(":");
                  if (!kind || !id) return;
                  void setTarget({
                    targetServerKind: kind,
                    targetServerId: id,
                  });
                }}
                className="rounded-lg border border-white/12 px-3 py-1.5 text-[10px] text-text-secondary cursor-pointer disabled:opacity-40"
              >
                Set target
              </button>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 items-end">
            <label className="flex flex-col gap-1 text-[10px] text-text-muted flex-1 min-w-[8rem]">
              Invite friend
              <select
                value={invitePick}
                onChange={(e) => setInvitePick(e.target.value)}
                className="rounded-md border border-white/10 bg-black/25 px-2 py-1.5 text-[11px] text-text-primary"
              >
                <option value="">Friend…</option>
                {friends.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy || !invitePick}
              onClick={() => {
                void invite([invitePick]).then(() => setInvitePick(""));
              }}
              className="rounded-lg border border-white/12 px-3 py-1.5 text-[10px] text-text-secondary cursor-pointer disabled:opacity-40"
            >
              Invite
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void setReady(!myMember?.ready)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[10px] font-semibold cursor-pointer disabled:opacity-40",
                myMember?.ready
                  ? "border border-primary-base/40 bg-primary-base/12 text-primary-base"
                  : "cf-btn-primary",
              )}
            >
              {myMember?.ready ? "Unready" : "Ready"}
            </button>
            {isHost ? (
              <button
                type="button"
                disabled={busy || !allReady || !lobby.targetServerId}
                onClick={() => void start()}
                className="cf-btn-primary rounded-lg px-3 py-1.5 text-[10px] font-semibold cursor-pointer disabled:opacity-40"
                title={
                  !lobby.targetServerId
                    ? "Set a target server first"
                    : !allReady
                      ? "Everyone must be ready"
                      : undefined
                }
              >
                Start
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void leave()}
              className="rounded-lg border border-white/12 px-3 py-1.5 text-[10px] text-text-secondary cursor-pointer"
            >
              Leave
            </button>
            {isHost ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void cancel()}
                className="rounded-lg border border-state-error/30 px-3 py-1.5 text-[10px] text-state-error cursor-pointer"
              >
                Cancel
              </button>
            ) : null}
          </div>

          {lobby.target?.address ? (
            <p className="text-[10px] text-text-muted">
              Target {lobby.target.address}
              {lobby.target.port ? `:${lobby.target.port}` : ""}
              {lobby.target.buildName ? ` · ${lobby.target.buildName}` : ""}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
