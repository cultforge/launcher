import { cn } from "../../../lib/cn";
import type { CultAgentNode } from "../../../lib/cultAgentApi";
import { isAgentNodeOnline } from "../../../lib/cultAgentApi";

type Props = {
  nodes: CultAgentNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
};

export function AgentNodePicker({
  nodes,
  selectedId,
  onSelect,
  loading,
}: Props) {
  if (nodes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-3 py-2.5 text-[12px] text-text-muted">
        No agents attached — open CultAgent to pair a host.
      </div>
    );
  }

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
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => onSelect(n.id)}
              title={`${n.name} · ${n.status}`}
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
                <span className="flex items-center gap-1.5">
                  <span className="block text-[12.5px] font-semibold text-text-primary truncate max-w-44">
                    {n.name}
                  </span>
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
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
