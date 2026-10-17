import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { usePersonalServersStore } from "../../../../stores/personalServers";
import {
  canJoinPersonalServer,
  kickPersonalServerPlayer,
  personalServerJoinAddress,
  updatePersonalServerAcl,
} from "../../../../lib/personalServersApi";
import { useMpingWatchList } from "../../../../hooks/useMpingWatchList";
import {
  listMyCultAgentNodes,
  bindPersonalServer,
  unbindPersonalServer,
  listAgentBindings,
  isAgentNodeOnline,
  agentModeLabel,
  setPersonalServerPrimaryAgent,
  type CultAgentNode,
  type CultAgentBinding,
} from "../../../../lib/cultAgentApi";
import { useNavigationStore } from "../../../../typlibs";
import { AgentPersonalConnectPanel } from "../../../servers/agent/AgentPersonalConnectPanel";
import { LiveSharePanel } from "../../../servers/LiveSharePanel";
import type {
  PersonalServerJoinPolicy,
  PersonalServerVisibility,
  UserPersonalServerRecord,
} from "../../../../types/catalog";
import { Icon } from "../../../ico";
import { AppIcons } from "../../../icons";
import { useAppStore } from "../../../../userstore";

function ServerCard({
  server,
  liveLabel,
  liveOnline,
  livePingMs,
  livePlayers,
  onEdit,
  onDelete,
  onSelect,
}: {
  server: UserPersonalServerRecord;
  liveLabel?: string;
  liveOnline?: boolean | null;
  livePingMs?: number;
  livePlayers?: { online: number; max: number };
  onEdit: () => void;
  onDelete: () => void;
  onSelect: () => void;
}) {
  const me = useAppStore((s) => s.currentUser);
  const join = personalServerJoinAddress(server);
  const gate = canJoinPersonalServer(server, {
    userId: me?.id,
    username: me?.name,
  });
  const dotClass =
    liveOnline === true
      ? "bg-state-success"
      : liveOnline === false
        ? "bg-state-error"
        : "bg-text-disabled";
  return (
    <div
      className="cf-panel rounded-xl p-4 flex flex-col gap-2 cursor-pointer hover:bg-white/3"
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full shrink-0 ${dotClass}`} />
        <div
          className="h-3 w-3 rounded-full shrink-0"
          style={{ backgroundColor: server.themeColor }}
        />
        <span className="truncate text-[13px] font-semibold text-text-primary">
          {server.name}
        </span>
        <span className="rounded-full bg-white/6 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-text-muted">
          {server.visibility}
        </span>
        {server.addressSource === "tunnel" ? (
          <span className="rounded-full bg-primary-base/12 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-primary-base">
            Tunnel
          </span>
        ) : (
          <span className="rounded-full bg-white/6 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-text-muted">
            Direct
          </span>
        )}
      </div>
      <div className="text-[10px] text-text-muted space-y-0.5">
        <div>
          <span className="text-text-disabled">Play address: </span>
          <span className="text-text-primary font-medium">
            {join.address}:{join.port}
          </span>
          {liveLabel ? (
            <span className="text-text-disabled"> · {liveLabel}</span>
          ) : null}
        </div>
        {livePlayers && livePlayers.max > 0 && (
          <div>
            <span className="text-text-disabled">Players: </span>
            {livePlayers.online}/{livePlayers.max}
            {livePingMs != null ? ` · ~${Math.round(livePingMs)} ms` : ""}
          </div>
        )}
        {server.addressSource === "tunnel" && (
          <div>
            <span className="text-text-disabled">Home address: </span>
            {server.configuredAddress}:{server.configuredPort}
          </div>
        )}
      </div>
      {!gate.ok ? (
        <p className="text-[10px] text-state-warning">{gate.reason}</p>
      ) : null}
      <div className="flex gap-1.5 mt-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!gate.ok) {
              toast.error(gate.reason || "Join policy blocks this server");
              return;
            }
            void navigator.clipboard
              .writeText(`${join.address}:${join.port}`)
              .then(() => toast.success("Address copied"))
              .catch(() => toast.error("Could not copy"));
          }}
          className="rounded-md border border-white/12 px-2 py-1 text-[9px] text-text-secondary cursor-pointer hover:bg-white/5"
        >
          Copy address
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="rounded-md border border-white/12 px-2 py-1 text-[9px] text-text-secondary cursor-pointer hover:bg-white/5"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="rounded-md border border-state-error/20 px-2 py-1 text-[9px] text-state-error cursor-pointer hover:bg-state-error/8"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export function ServerEditor({
  server,
  onSave,
  onCancel,
}: {
  server: UserPersonalServerRecord | null;
  onSave: (data: {
    name: string;
    serverAddress: string;
    port: number;
    themeColor: string;
    visibility: PersonalServerVisibility;
    joinPolicy: PersonalServerJoinPolicy;
  }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(server?.name ?? "");
  const [addr, setAddr] = useState(server?.serverAddress ?? "");
  const [port, setPort] = useState(server?.port ?? 25565);
  const [color, setColor] = useState(server?.themeColor ?? "#7A2CFF");
  const [visibility, setVisibility] = useState<PersonalServerVisibility>(
    server?.visibility ?? "private",
  );
  const [joinPolicy, setJoinPolicy] = useState<PersonalServerJoinPolicy>(
    server?.joinPolicy ?? "allowlist",
  );

  return (
    <div className="cf-panel rounded-xl p-4 flex flex-col gap-3">
      <h3 className="font-sora text-[14px] font-bold text-text-primary">
        {server ? "Edit server" : "Add server"}
      </h3>
      <label className="flex flex-col gap-1 text-[10px] text-text-muted">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My SMP"
          className="rounded-md border border-border-strong bg-black/20 px-2.5 py-2 text-[11px] text-text-primary outline-none placeholder:text-text-disabled"
        />
      </label>
      <div className="grid grid-cols-[1fr_100px] gap-2">
        <label className="flex flex-col gap-1 text-[10px] text-text-muted">
          Address
          <input
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            placeholder="play.example.com"
            className="rounded-md border border-border-strong bg-black/20 px-2.5 py-2 text-[11px] text-text-primary outline-none placeholder:text-text-disabled"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-text-muted">
          Port
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(Number(e.target.value) || 25565)}
            className="rounded-md border border-border-strong bg-black/20 px-2.5 py-2 text-[11px] text-text-primary outline-none"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[10px] text-text-muted">
          Visibility
          <select
            value={visibility}
            onChange={(e) =>
              setVisibility(e.target.value as PersonalServerVisibility)
            }
            className="rounded-md border border-border-strong bg-black/20 px-2.5 py-2 text-[11px] text-text-primary"
          >
            <option value="private">private</option>
            <option value="unlisted">unlisted</option>
            <option value="public">public</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-text-muted">
          Join policy
          <select
            value={joinPolicy}
            onChange={(e) =>
              setJoinPolicy(e.target.value as PersonalServerJoinPolicy)
            }
            className="rounded-md border border-border-strong bg-black/20 px-2.5 py-2 text-[11px] text-text-primary"
          >
            <option value="open">open</option>
            <option value="allowlist">allowlist</option>
            <option value="friends">friends</option>
            <option value="guild_members">guild_members</option>
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-[10px] text-text-muted">
        Theme color
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-6 w-6 rounded cursor-pointer border-0"
        />
        <span className="text-text-disabled">{color}</span>
      </label>
      <div className="flex gap-2 mt-1">
        <button
          type="button"
          disabled={!name.trim() || !addr.trim()}
          onClick={() =>
            onSave({
              name: name.trim(),
              serverAddress: addr.trim(),
              port,
              themeColor: color,
              visibility,
              joinPolicy,
            })
          }
          className="cf-btn-primary rounded-lg px-4 py-2 text-[11px] font-semibold cursor-pointer disabled:opacity-40"
        >
          {server ? "Save" : "Add server"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-white/12 px-4 py-2 text-[11px] text-text-secondary cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function PersonalHostingPanel({
  server,
  onUpdated,
}: {
  server: UserPersonalServerRecord;
  onUpdated: () => void;
}) {
  const [allowText, setAllowText] = useState(
    server.allowlistUsernames.join(", "),
  );
  const [kickName, setKickName] = useState("");
  const [busy, setBusy] = useState(false);
  const updateServer = usePersonalServersStore((s) => s.update);

  const saveAcl = async () => {
    setBusy(true);
    try {
      await updatePersonalServerAcl(server.id, {
        allowlistUsernames: allowText
          .split(/[,;\s]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        allowlistUserIds: server.allowlistUserIds,
      });
      toast.success("Allow list saved");
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ACL failed");
    } finally {
      setBusy(false);
    }
  };

  const onKick = async (ban: boolean) => {
    if (!kickName.trim()) return;
    if (ban && !window.confirm(`Ban ${kickName.trim()} and denylist?`)) return;
    setBusy(true);
    try {
      await kickPersonalServerPlayer(server.id, {
        minecraftName: kickName.trim(),
        ban,
      });
      toast.success(ban ? "Ban enqueued" : "Kick enqueued");
      setKickName("");
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kick failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/8 bg-black/15 p-3">
      <h4 className="text-[11px] font-semibold text-text-primary">
        Hosting & access
      </h4>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[10px] text-text-muted">
          Visibility
          <select
            value={server.visibility}
            disabled={busy}
            onChange={(e) => {
              void updateServer(server.id, {
                visibility: e.target.value as PersonalServerVisibility,
              })
                .then(() => toast.success("Visibility updated"))
                .catch((err) =>
                  toast.error(
                    err instanceof Error ? err.message : "Update failed",
                  ),
                );
            }}
            className="rounded-md border border-white/10 bg-black/25 px-2 py-1.5 text-[11px] text-text-primary"
          >
            <option value="private">private</option>
            <option value="unlisted">unlisted</option>
            <option value="public">public</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-text-muted">
          Join policy
          <select
            value={server.joinPolicy}
            disabled={busy}
            onChange={(e) => {
              void updateServer(server.id, {
                joinPolicy: e.target.value as PersonalServerJoinPolicy,
              })
                .then(() => toast.success("Join policy updated"))
                .catch((err) =>
                  toast.error(
                    err instanceof Error ? err.message : "Update failed",
                  ),
                );
            }}
            className="rounded-md border border-white/10 bg-black/25 px-2 py-1.5 text-[11px] text-text-primary"
          >
            <option value="open">open</option>
            <option value="allowlist">allowlist</option>
            <option value="friends">friends</option>
            <option value="guild_members">guild_members</option>
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-[10px] text-text-muted">
        Allowlist usernames (comma-separated)
        <input
          value={allowText}
          onChange={(e) => setAllowText(e.target.value)}
          className="rounded-md border border-white/10 bg-black/25 px-2 py-1.5 text-[11px] text-text-primary"
        />
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={() => void saveAcl()}
        className="self-start rounded-lg border border-white/12 px-3 py-1.5 text-[10px] font-semibold cursor-pointer"
      >
        Save ACL
      </button>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[10px] text-text-muted flex-1 min-w-40">
          Kick / ban player
          <input
            value={kickName}
            onChange={(e) => setKickName(e.target.value)}
            placeholder="Minecraft name"
            className="rounded-md border border-white/10 bg-black/25 px-2 py-1.5 text-[11px] text-text-primary"
          />
        </label>
        <button
          type="button"
          disabled={busy || !kickName.trim()}
          onClick={() => void onKick(false)}
          className="rounded-lg border border-white/12 px-3 py-1.5 text-[10px] cursor-pointer"
        >
          Kick
        </button>
        <button
          type="button"
          disabled={busy || !kickName.trim()}
          onClick={() => void onKick(true)}
          className="rounded-lg border border-state-error/30 px-3 py-1.5 text-[10px] text-state-error cursor-pointer"
        >
          Ban
        </button>
      </div>
    </div>
  );
}

function AgentBindSection({
  server,
}: {
  server: UserPersonalServerRecord;
}) {
  const [nodes, setNodes] = useState<CultAgentNode[]>([]);
  const [bindings, setBindings] = useState<CultAgentBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const personal = await listMyCultAgentNodes(50, { dedupe: true });
      setNodes(personal);
      const allBindings = await Promise.all(
        personal.map((n) => listAgentBindings(n.id).catch(() => [])),
      );
      setBindings(allBindings.flat());
    } catch {
      setNodes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [server.id]);

  const boundNodeIds = new Set(
    bindings
      .filter(
        (b) =>
          b.personalServerId === server.id && !b.revokedAt,
      )
      .map((b) => b.nodeId),
  );

  const onBind = async (nodeId: string) => {
    setBusy(true);
    try {
      await bindPersonalServer(server.id, nodeId);
      toast.success("PC connected to this server");
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not connect";
      if (msg.includes("limit") || msg.includes("403")) {
        toast.error("You can connect up to 3 PCs on your account");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const onMakePrimary = async (nodeId: string) => {
    setBusy(true);
    try {
      await setPersonalServerPrimaryAgent(server.id, nodeId);
      toast.success("Primary agent updated");
      await refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not set primary",
      );
    } finally {
      setBusy(false);
    }
  };

  const onUnbind = async (nodeId: string) => {
    setBusy(true);
    try {
      await unbindPersonalServer(server.id, nodeId);
      toast.success("PC disconnected from this server");
      await refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not disconnect",
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <p className="text-[10px] text-text-disabled">
        Loading PCs…
      </p>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <AgentPersonalConnectPanel compact onLinked={() => void refresh()} />
        <p className="text-[10px] text-text-muted text-center">
          Or open{" "}
          <ConnectPcLink />{" "}
          for the full PC list.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled">
        Connect a PC to manage this server
      </p>
      {nodes.map((node) => {
        const bound = boundNodeIds.has(node.id);
        const binding = bindings.find(
          (b) =>
            b.nodeId === node.id &&
            b.personalServerId === server.id &&
            !b.revokedAt,
        );
        const online = isAgentNodeOnline(node);
        return (
          <div
            key={node.id}
            className="flex items-center gap-3 rounded-lg border border-white/8 bg-black/15 px-3 py-2"
          >
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${online ? "bg-primary-base" : "bg-text-disabled"}`}
            />
            <div className="min-w-0 flex-1">
              <span className="text-[11px] font-semibold text-text-primary truncate block">
                {node.name}
              </span>
              <span className="text-[9px] text-text-muted">
                {agentModeLabel(node)} · {node.status}
              </span>
              {binding?.workloadId && (
                <span className="text-[8px] text-text-disabled font-mono block">
                  Instance {binding.workloadId}
                </span>
              )}
            </div>
            {bound && binding && !binding.isPrimary ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onMakePrimary(node.id)}
                className="rounded-md border border-primary-base/30 px-2 py-1.5 text-[9px] font-semibold text-primary-base cursor-pointer"
              >
                Make primary
              </button>
            ) : null}
            {bound && binding?.isPrimary ? (
              <span className="rounded-full bg-primary-base/15 px-1.5 py-0.5 text-[7px] font-bold uppercase text-primary-base">
                Primary
              </span>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void (bound ? onUnbind(node.id) : onBind(node.id))}
              className={`rounded-md px-3 py-1.5 text-[9px] font-semibold cursor-pointer ${
                bound
                  ? "border border-state-error/20 text-state-error hover:bg-state-error/8"
                  : "cf-btn-primary"
              }`}
            >
              {bound ? "Disconnect" : "Connect"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ConnectPcLink() {
  const setPrimaryTab = useNavigationStore((s) => s.setPrimaryTab);
  const setSideItem = useNavigationStore((s) => s.setSideItem);
  return (
    <button
      type="button"
      onClick={() => {
        setPrimaryTab("Servers");
        setSideItem("My PCs");
      }}
      className="text-primary-base font-semibold hover:underline cursor-pointer"
    >
      My PCs
    </button>
  );
}

export default function MyServersPage() {
  const servers = usePersonalServersStore((s) => s.servers);
  const loading = usePersonalServersStore((s) => s.loading);
  const error = usePersonalServersStore((s) => s.error);
  const refresh = usePersonalServersStore((s) => s.refresh);
  const selected = usePersonalServersStore((s) => s.selected);
  const select = usePersonalServersStore((s) => s.select);
  const createServer = usePersonalServersStore((s) => s.create);
  const updateServer = usePersonalServersStore((s) => s.update);
  const removeServer = usePersonalServersStore((s) => s.remove);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, []);

  const selectedServer = servers.find((s) => s.id === selected) ?? null;
  const editTarget = editingId
    ? servers.find((s) => s.id === editingId) ?? null
    : null;

  const addresses = useMemo(
    () =>
      servers.map((s) => {
        const j = personalServerJoinAddress(s);
        return `${j.address}:${j.port}`;
      }),
    [servers],
  );
  const mping = useMpingWatchList(addresses);

  return (
    <div className="h-full overflow-y-auto scroll-hidden p-4 pb-24 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-sora text-xl font-bold text-text-primary">
            My Servers
          </h1>
          <p className="text-[11px] text-text-muted mt-1">
            Your personal Minecraft servers. Connect a PC to manage them
            remotely.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingId(null);
            setCreating(true);
          }}
          className="cf-btn-primary rounded-lg px-4 py-2 text-[11px] font-semibold cursor-pointer"
        >
          Add server
        </button>
      </div>

      {creating && (
        <ServerEditor
          server={null}
          onSave={async (data) => {
            try {
              await createServer(data);
              setCreating(false);
              toast.success("Server added");
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Could not add server",
              );
            }
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {editingId && editTarget && (
        <ServerEditor
          server={editTarget}
          onSave={async (data) => {
            try {
              await updateServer(editingId, data);
              setEditingId(null);
              toast.success("Server updated");
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Could not update server",
              );
            }
          }}
          onCancel={() => setEditingId(null)}
        />
      )}

      {error && (
        <div className="rounded-lg border border-state-error/20 bg-state-error/6 px-3 py-2.5 text-[11px] text-state-error">
          {error}
        </div>
      )}

      {loading && servers.length === 0 && (
        <div className="cf-panel rounded-xl flex items-center justify-center min-h-40 text-[12px] text-text-muted">
          Loading your servers…
        </div>
      )}

      {!loading && servers.length === 0 && !error && (
        <div className="cf-panel rounded-xl flex flex-col items-center justify-center min-h-40 gap-2 text-center px-4">
          <Icon icon={AppIcons.Servers} size={28} className="text-text-disabled" />
          <p className="text-[13px] text-text-muted">
            No personal servers yet.
          </p>
          <p className="text-[10px] text-text-disabled max-w-sm">
            Add a server to bookmark it here and optionally connect your PC to
            manage it remotely with CultAgent.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {servers.map((server) => {
          const join = personalServerJoinAddress(server);
          const addr = `${join.address}:${join.port}`;
          const live = mping[addr];
          return (
          <ServerCard
            key={server.id}
            server={server}
            liveLabel={live?.label}
            liveOnline={live?.online}
            livePingMs={live?.stats?.pingMs}
            livePlayers={
              live?.stats
                ? {
                    online: live.stats.playersOnline,
                    max: live.stats.playersMax,
                  }
                : undefined
            }
            onEdit={() => {
              setCreating(false);
              setEditingId(server.id);
            }}
            onDelete={async () => {
              try {
                await removeServer(server.id);
                toast.success("Server removed");
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Could not remove server",
                );
              }
            }}
            onSelect={() => select(server.id)}
          />
          );
        })}
      </div>

      {selectedServer && (
        <div className="flex flex-col gap-3">
          <LiveSharePanel kind="personal" serverId={selectedServer.id} />
          <div className="cf-panel rounded-xl p-4 flex flex-col gap-3">
            <h3 className="font-sora text-[14px] font-bold text-text-primary">
              {selectedServer.name} — PC Connection
            </h3>
            <PersonalHostingPanel
              server={selectedServer}
              onUpdated={() => void refresh()}
            />
            <AgentBindSection server={selectedServer} />
          </div>
        </div>
      )}
    </div>
  );
}
