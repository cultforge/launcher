import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RefreshCw } from "lucide-react";

import {

  isAgentNodeOnline,

  listAccessibleCultAgentNodes,

  listAgentBindings,

  type CultAgentBinding,

  type CultAgentNode,

} from "../../../../lib/cultAgentApi";

import { copyText, truncateMiddle } from "../../../../lib/copyText";

import { joinedGuilds } from "../../../../data/guilds";

import { useAgentControlStore } from "../../../../stores/agentControl";

import { useGuildStore } from "../../../../stores/guilds";

import { Icon } from "../../../ico";

import { AppIcons } from "../../../icons";

import { AgentDetailPanel } from "../../../servers/agent/AgentDetailPanel";
import { AgentPersonalConnectPanel } from "../../../servers/agent/AgentPersonalConnectPanel";
import { FullScreenShell } from "../../../modals/FullScreenShell";



function formatLastSeen(at: string | null | undefined): string {

  if (!at) return "Unknown";

  const ts = Date.parse(at);

  if (!Number.isFinite(ts)) return "Unknown";

  const delta = Date.now() - ts;

  if (delta < 60_000) return "Just now";

  if (delta < 3_600_000) return `${Math.round(delta / 60_000)} min ago`;

  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)} hr ago`;

  return `${Math.round(delta / 86_400_000)} days ago`;

}



function PcRow({

  node,

  hosting,

  selected,

  onSelect,

}: {

  node: CultAgentNode;

  hosting: string[];

  selected: boolean;

  onSelect: () => void;

}) {

  const online = isAgentNodeOnline(node);

  return (

    <button

      type="button"

      onClick={onSelect}

      className={`w-full rounded-xl border px-3 py-3 text-left cursor-pointer transition-colors ${

        selected

          ? "border-primary-base/40 bg-primary-base/10"

          : "border-white/8 bg-black/15 hover:bg-white/3"

      }`}

    >

      <div className="flex items-start gap-3">

        <span

          className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${

            online ? "bg-state-success" : "bg-text-disabled"

          }`}

        />

        <div className="min-w-0 flex-1">

          <div className="flex flex-wrap items-center gap-2">

            <span className="text-[13px] font-semibold text-text-primary truncate">

              {node.name}

            </span>

            <span

              className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${

                online

                  ? "bg-primary-base/15 text-primary-base"

                  : "bg-white/8 text-text-muted"

              }`}

            >

              {online ? "Connected" : "Offline"}

            </span>

            {node.guildId ? (

              <span className="rounded-full bg-accent-delta/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent-delta">

                Guild

              </span>

            ) : (

              <span className="rounded-full bg-state-info/12 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-state-info">

                Personal

              </span>

            )}

          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-text-muted">

            <span className="font-mono">{truncateMiddle(node.id)}</span>

            <button

              type="button"

              onClick={(e) => {

                e.stopPropagation();

                void copyText(node.id, "PC id copied");

              }}

              className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] hover:bg-white/5 cursor-pointer"

            >

              Copy

            </button>

            <span>· Last seen {formatLastSeen(node.lastSeenAt)}</span>

          </div>

          {hosting.length > 0 ? (

            <p className="mt-1.5 text-[10px] text-text-secondary">

              Hosting: {hosting.slice(0, 3).join(", ")}

              {hosting.length > 3 ? ` +${hosting.length - 3}` : ""}

            </p>

          ) : (

            <p className="mt-1.5 text-[10px] text-text-disabled">

              No servers hosted yet — open this PC to host one

            </p>

          )}

        </div>

      </div>

    </button>

  );

}



export default function MyPcsPage() {

  const selectedNodeId = useAgentControlStore((s) => s.selectedNodeId);

  const selectedLocalServerId = useAgentControlStore(

    (s) => s.selectedLocalServerId,

  );

  const selectNode = useAgentControlStore((s) => s.selectNode);

  const pendingConnectCode = useAgentControlStore((s) => s.pendingConnectCode);

  const clearPendingConnectCode = useAgentControlStore(

    (s) => s.clearPendingConnectCode,

  );

  const activeGuildId = useGuildStore((s) => s.activeGuildId);



  const [nodes, setNodes] = useState<CultAgentNode[]>([]);

  const [bindingsByNode, setBindingsByNode] = useState<

    Record<string, CultAgentBinding[]>

  >({});

  const [loading, setLoading] = useState(true);

  const [loadError, setLoadError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(selectedNodeId);

  const [showConnectHelp, setShowConnectHelp] = useState(true);

  const prevCountRef = useRef(0);



  const guildIds = useMemo(() => {

    const ids = new Set(joinedGuilds().map((g) => g.id));

    if (activeGuildId) ids.add(activeGuildId);

    return Array.from(ids);

  }, [activeGuildId]);



  const refresh = useCallback(async () => {

    setLoading(true);

    setLoadError(null);

    try {

      const list = await listAccessibleCultAgentNodes(guildIds, { dedupe: true });

      setNodes(list);



      if (list.length > 0 && prevCountRef.current === 0) {

        setShowConnectHelp(false);

        setExpandedId((prev) => prev ?? list[0]?.id ?? null);

      }

      prevCountRef.current = list.length;



      const bindingEntries = await Promise.all(

        list.map(async (node) => {

          try {

            const bindings = await listAgentBindings(node.id);

            return [node.id, bindings.filter((b) => !b.revokedAt)] as const;

          } catch {

            return [node.id, []] as const;

          }

        }),

      );

      setBindingsByNode(Object.fromEntries(bindingEntries));

    } catch (err) {

      const msg =

        err instanceof Error ? err.message : "Could not load your PCs";

      setLoadError(msg);

      setNodes([]);

    } finally {

      setLoading(false);

    }

  }, [guildIds]);



  useEffect(() => {

    void refresh();

    const id = window.setInterval(() => void refresh(), 3_000);

    return () => window.clearInterval(id);

  }, [refresh]);



  useEffect(() => {

    if (selectedNodeId) {

      setExpandedId(selectedNodeId);

      setShowConnectHelp(false);

    }

  }, [selectedNodeId]);



  const personalNodes = useMemo(

    () => nodes.filter((n) => !n.guildId),

    [nodes],

  );

  const guildNodes = useMemo(() => nodes.filter((n) => n.guildId), [nodes]);



  const hostingLabels = (nodeId: string): string[] => {

    const bindings = bindingsByNode[nodeId] ?? [];

    return bindings

      .map(

        (b) =>

          (typeof b.raw.display_name === "string"

            ? b.raw.display_name

            : null) ??

          b.guildServerId ??

          b.personalServerId ??

          b.localServerId ??

          "Server",

      )

      .filter(Boolean) as string[];

  };



  const expandedNode = nodes.find((n) => n.id === expandedId) ?? null;

  const hasNodes = nodes.length > 0;



  return (

    <div className="h-full min-h-0 overflow-y-auto scroll-hidden p-4 pb-24 flex flex-col gap-4 max-w-3xl">

      <div className="flex items-start justify-between gap-3">

        <div>

          <h1 className="font-sora text-xl font-bold text-text-primary">

            My PCs

          </h1>

          <p className="text-[11px] text-text-muted mt-1 max-w-lg">

            Computers running CultAgent. Tap a PC to start, stop, and host

            servers.

          </p>

        </div>

        <button

          type="button"

          disabled={loading}

          onClick={() => void refresh()}

          className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-3 py-2 text-[10px] font-semibold text-text-secondary hover:bg-white/5 cursor-pointer disabled:opacity-40"

        >

          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />

          Refresh

        </button>

      </div>



      {loadError ? (

        <div className="rounded-lg border border-state-error/25 bg-state-error/8 px-3 py-2.5 text-[11px] text-state-error">

          {loadError}

        </div>

      ) : null}



      {pendingConnectCode ? (

        <div className="rounded-lg border border-state-warning/25 bg-state-warning/8 px-3 py-2 text-[11px] text-text-secondary flex items-center justify-between gap-2">

          <span>

            Guild code from link:{" "}

            <span className="font-mono font-semibold text-text-primary">

              {pendingConnectCode}

            </span>{" "}

            — generate in guild settings → Servers.

          </span>

          <button

            type="button"

            onClick={clearPendingConnectCode}

            className="text-[10px] text-text-muted hover:text-text-primary cursor-pointer"

          >

            Dismiss

          </button>

        </div>

      ) : null}



      {loading && !hasNodes ? (

        <div className="cf-panel rounded-xl flex items-center justify-center min-h-32 text-[12px] text-text-muted">

          Loading your PCs…

        </div>

      ) : null}



      {!loading && !hasNodes ? (

        <div className="cf-panel rounded-xl flex flex-col items-center justify-center min-h-36 gap-2 text-center px-4">

          <Icon icon={AppIcons.Servers} size={28} className="text-text-disabled" />

          <p className="text-[13px] text-text-muted">No PCs connected yet</p>

          <p className="text-[10px] text-text-disabled max-w-sm">

            Personal: run{" "}

            <span className="font-mono text-text-primary">cf-agent login</span>{" "}

            then{" "}

            <span className="font-mono text-text-primary">cf-agent run</span>.

            Guild: register with a code from guild settings → Servers.

          </p>

        </div>

      ) : null}



      {hasNodes ? (

        <>

          {personalNodes.length > 0 ? (

            <section className="flex flex-col gap-2">

              <h2 className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled">

                Your computers

              </h2>

              <div className="flex flex-col gap-2">

                {personalNodes.map((node) => (

                  <PcRow

                    key={node.id}

                    node={node}

                    hosting={hostingLabels(node.id)}

                    selected={expandedId === node.id}

                    onSelect={() => {
                      setExpandedId(node.id);
                      selectNode(node.id, selectedLocalServerId);
                    }}

                  />

                ))}

              </div>

            </section>

          ) : null}



          {guildNodes.length > 0 ? (

            <section className="flex flex-col gap-2">

              <h2 className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled">

                Guild PCs

              </h2>

              <div className="flex flex-col gap-2">

                {guildNodes.map((node) => (

                  <PcRow

                    key={node.id}

                    node={node}

                    hosting={hostingLabels(node.id)}

                    selected={expandedId === node.id}

                    onSelect={() => {
                      setExpandedId(node.id);
                      selectNode(node.id, selectedLocalServerId);
                    }}

                  />

                ))}

              </div>

            </section>

          ) : null}

        </>

      ) : null}



      {hasNodes && !expandedNode ? (
        <p className="text-[11px] text-text-muted text-center py-2">
          Tap a PC to open server control.
        </p>
      ) : null}

      <FullScreenShell
        open={expandedNode != null}
        title={expandedNode?.name ?? "My PC"}
        subtitle={
          expandedNode
            ? isAgentNodeOnline(expandedNode)
              ? "Connected — start and stop worlds from here."
              : "Offline — start CultAgent on this computer."
            : undefined
        }
        onClose={() => setExpandedId(null)}
        confirmClose={false}
        bodyScroll={false}
      >
        {expandedNode ? (
          <AgentDetailPanel
            node={expandedNode}
            focusLocalId={selectedLocalServerId}
            onRefreshNodes={() => void refresh()}
            showRevoke
          />
        ) : null}
      </FullScreenShell>

      <div className="flex flex-col gap-2">

        <button

          type="button"

          onClick={() => setShowConnectHelp((v) => !v)}

          className="self-start text-[11px] font-semibold text-primary-base hover:underline cursor-pointer"

        >

          {showConnectHelp ? "Hide connect instructions" : "Connect another PC"}

        </button>

        {showConnectHelp || !hasNodes ? (

          <AgentPersonalConnectPanel onLinked={() => void refresh()} compact />

        ) : null}

      </div>

    </div>

  );

}


