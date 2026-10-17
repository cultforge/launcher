import { useCallback, useEffect, useState } from "react";
import { useGuildModalsStore } from "../../../stores/guildModals";
import { useGuildStore } from "../../../stores/guilds";
import { useAppStore } from "../../../userstore";
import {
  capabilitiesForRole,
  membershipForUser,
} from "../../../lib/guildPermissions";
import {
  isAgentNodeOnline,
  isAgentNodeOwnedBy,
  listGuildCultAgentNodes,
  type CultAgentNode,
} from "../../../lib/cultAgentApi";
import { EntityImage } from "../../EntityImage";
import { AgentConnectCodePanel } from "../../servers/agent/AgentConnectCodePanel";
import { toast } from "sonner";

function GuildAgentsSection({
  guildId,
  userId,
  canViewAll,
}: {
  guildId: string;
  userId: string;
  canViewAll: boolean;
}) {
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [nodes, setNodes] = useState<CultAgentNode[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listGuildCultAgentNodes(guildId, 50, {
        scope: canViewAll ? scope : "mine",
        dedupe: true,
      });
      setNodes(list);
    } catch {
      setNodes([]);
    } finally {
      setLoading(false);
    }
  }, [guildId, scope, canViewAll]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="cf-panel rounded-xl p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className="text-[12px] font-semibold text-text-primary">Agents</h4>
          <p className="text-[10px] text-text-muted">
            Default: your nodes only. Foreign cards show “not yours”.
          </p>
        </div>
        {canViewAll ? (
          <div className="flex rounded-lg border border-white/10 overflow-hidden text-[10px]">
            <button
              type="button"
              onClick={() => setScope("mine")}
              className={`px-2.5 py-1.5 cursor-pointer ${
                scope === "mine"
                  ? "bg-primary-base/20 text-primary-base"
                  : "text-text-muted"
              }`}
            >
              Mine
            </button>
            <button
              type="button"
              onClick={() => setScope("all")}
              className={`px-2.5 py-1.5 cursor-pointer ${
                scope === "all"
                  ? "bg-primary-base/20 text-primary-base"
                  : "text-text-muted"
              }`}
            >
              View all
            </button>
          </div>
        ) : null}
      </div>
      {loading ? (
        <p className="text-[11px] text-text-muted py-2">Loading agents…</p>
      ) : nodes.length === 0 ? (
        <p className="text-[11px] text-text-muted py-2">
          No agents in this scope yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {nodes.map((n) => {
            const mine = isAgentNodeOwnedBy(n, userId);
            const online = isAgentNodeOnline(n);
            return (
              <li
                key={n.id}
                className="flex items-center gap-2 rounded-lg border border-white/8 bg-black/20 px-2.5 py-2"
              >
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    online ? "bg-primary-base" : "bg-text-disabled"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[12px] font-semibold text-text-primary truncate">
                      {n.name}
                    </span>
                    {!mine ? (
                      <span className="rounded-full bg-state-error/15 px-1.5 py-0.5 text-[7px] font-bold uppercase text-state-error">
                        Not yours
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[10px] text-text-muted truncate">
                    {n.ownerHandle || n.ownerId || (mine ? "you" : "unknown")}
                    {" · "}
                    {online ? "Online" : "Offline"}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ManageServers() {
  const guildId = useGuildStore((state) => state.activeGuildId);
  const servers = useGuildStore((state) => state.servers);
  const members = useGuildStore((state) => state.members);
  const userId = useAppStore((s) => s.currentUser?.id ?? "");
  const deleteServer = useGuildStore((state) => state.deleteServer);
  const open = useGuildModalsStore((state) => state.open);
  const rows = servers.filter((server) => server.guildId === guildId);
  const caps = capabilitiesForRole(
    membershipForUser(members, guildId, userId)?.role,
  );
  const canManageAgents = caps.manageServers;
  const canViewAllAgents = caps.openManagement;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-sora text-[14px] font-bold text-text-primary">
            Servers
          </h3>
          <p className="text-[10px] text-text-muted max-w-lg">
            Add servers your guild can join. Connect a guild PC below to host
            worlds remotely.
          </p>
        </div>
        <button
          type="button"
          onClick={() => open("server")}
          className="cf-btn-primary rounded-lg px-3 py-2 text-[10px] font-semibold cursor-pointer"
        >
          Add server
        </button>
      </div>
      <div className="cf-panel overflow-hidden rounded-xl">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[11px] text-text-muted">
            No servers yet. Add one so members can see it in the guild hub.
          </p>
        ) : (
          <table className="w-full text-left">
            <thead className="border-b border-border-subtle text-[8px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Address</th>
                <th className="px-3 py-2 font-medium">Region</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((server) => (
                <tr
                  key={server.id}
                  className="border-b border-border-subtle/60 last:border-0 hover:bg-white/3"
                >
                  <td className="px-3 py-2 text-[11px] text-text-primary">
                    <div className="flex items-center gap-2">
                      <EntityImage
                        kind="server"
                        entityId={server.id}
                        source={
                          server.iconUrl ||
                          server.coverUrl ||
                          server.thumbnail ||
                          null
                        }
                        alt=""
                        className="h-7 w-7 rounded-md shrink-0 border border-white/10"
                      />
                      <div className="min-w-0">
                        <div className="truncate">{server.name}</div>
                        {server.tags.length > 0 && (
                          <div className="mt-0.5 text-[8px] text-text-muted">
                            {server.tags.join(" · ")}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-text-secondary">
                    {server.address}
                  </td>
                  <td className="px-3 py-2 text-[10px] text-text-muted">
                    {server.region}
                  </td>
                  <td className="px-3 py-2 text-[10px] capitalize text-text-secondary">
                    {server.status}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => open("server", server.id)}
                      className="mr-2 text-[9px] text-text-muted cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void deleteServer(guildId, server.id).then((result) => {
                          if (!result.ok) {
                            toast.error(result.message ?? "Delete failed");
                            return;
                          }
                          toast.success("Server removed");
                        });
                      }}
                      className="text-[9px] text-state-error cursor-pointer"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <GuildAgentsSection
        guildId={guildId}
        userId={userId}
        canViewAll={canViewAllAgents}
      />

      {canManageAgents ? (
        <AgentConnectCodePanel
          guildId={guildId}
          title="Connect a guild PC"
          subtitle="Generate a code here. On the hosting machine run cf-agent register --code with that code, then cf-agent run."
          onLinked={() => {
            toast.success("PC linked", {
              description:
                "Owned agents show under Servers → My PCs. Guild Agents lists scope above.",
            });
          }}
        />
      ) : null}
    </div>
  );
}
