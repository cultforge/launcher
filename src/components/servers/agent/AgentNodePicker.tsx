import { cn } from "../../../lib/cn";
import type { CultAgentBinding, CultAgentNode } from "../../../lib/cultAgentApi";
import {
  isAgentNodeOnline,
  isAgentNodeOwnedBy,
} from "../../../lib/cultAgentApi";

type Props = {
  nodes: CultAgentNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
  currentUserId?: string;
  bindings?: CultAgentBinding[];
  serverId?: string;
};

export function AgentNodePicker({
  nodes,
  selectedId,
  onSelect,
  loading,
  currentUserId,
  bindings = [],
  serverId,
}: Props) {
  if (nodes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-3 py-2.5 text-[12px] text-text-muted">
        No agents attached — open CultAgent to pair a host.
      </div>
    );
  }

  const primaryNodeId = bindings.find(
    (b) =>
      !b.revokedAt &&
      b.isPrimary &&
      (!serverId ||
        b.guildServerId === serverId ||
        b.personalServerId === serverId ||
        b.localServerId === serverId),
  )?.nodeId;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-disabled">
          Connected agents ({nodes.length})
          {loading ? " · syncing" : ""}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {nodes.map((n) => {
          const active = n.id === selectedId;
          const online = isAgentNodeOnline(n);
          const mine = isAgentNodeOwnedBy(n, currentUserId);
          const isPrimary = primaryNodeId === n.id;
          const isStandby =
            Boolean(serverId) &&
            Boolean(primaryNodeId) &&
            !isPrimary &&
            bindings.some(
              (b) =>
                !b.revokedAt &&
                b.nodeId === n.id &&
                (b.guildServerId === serverId ||
                  b.personalServerId === serverId ||
                  b.localServerId === serverId),
            );
          const ownerLabel =
            n.ownerHandle ||
            (n.ownerId ? n.ownerId.slice(0, 8) : null) ||
            (mine ? "you" : null);

          return (
            <button
              key={n.id}
              type="button"
              onClick={() => onSelect(n.id)}
              title={`${n.name} · ${n.status}${ownerLabel ? ` · ${ownerLabel}` : ""}`}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-left cursor-pointer transition-all max-w-full",
                active
                  ? "border-primary-base/45 bg-primary-base/12 shadow-[0_0_16px_var(--color-glow-secondary)]"
                  : "border-white/10 bg-black/25 hover:bg-white/4",
              )}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full shrink-0",
                  online ? "bg-primary-base" : "bg-text-disabled",
                )}
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 flex-wrap">
                  <span className="block text-[12.5px] font-semibold text-text-primary truncate max-w-44">
                    {n.name}
                  </span>
                  {isPrimary ? (
                    <span className="shrink-0 rounded-full bg-primary-base/15 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-primary-base">
                      Primary
                    </span>
                  ) : null}
                  {isStandby ? (
                    <span className="shrink-0 rounded-full bg-state-warning/15 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-state-warning">
                      Standby
                    </span>
                  ) : null}
                  {!mine ? (
                    <span className="shrink-0 rounded-full bg-state-error/15 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-state-error">
                      Not yours
                    </span>
                  ) : null}
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider ${
                      n.guildId
                        ? "bg-primary-base/12 text-primary-base"
                        : "bg-state-info/12 text-state-info"
                    }`}
                  >
                    {n.guildId ? "Guild" : "Personal"}
                  </span>
                </span>
                <span className="block text-[10px] text-text-muted truncate max-w-48">
                  {online ? "Online" : "Offline"}
                  {ownerLabel ? ` · ${ownerLabel}` : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
