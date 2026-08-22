import type { CultAgentNode } from "../../../lib/cultAgentApi";
import { AgentDetailPanel } from "./AgentDetailPanel";

type Props = {
  node: CultAgentNode;
  onClose: () => void;
  onOpenInAgents?: () => void;
};

export function AgentControlDrawer({ node, onClose, onOpenInAgents }: Props) {
  return (
    <div
      className="fixed inset-0 z-100 flex items-stretch justify-end bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="cf-panel h-full w-full max-w-2xl border-l border-white/10 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between gap-2 border-b border-white/8 px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-text-muted">
              This computer
            </p>
            <p className="text-[13px] font-semibold text-text-primary">{node.name}</p>
          </div>
          <div className="flex items-center gap-2">
            {onOpenInAgents ? (
              <button
                type="button"
                onClick={onOpenInAgents}
                className="rounded-lg border border-white/12 px-2.5 py-1.5 text-[9px] text-text-secondary cursor-pointer hover:bg-white/5"
              >
                Open in My PCs →
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-text-muted hover:text-text-primary cursor-pointer"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto scroll-hidden p-4">
          <AgentDetailPanel node={node} showRevoke={false} showAddServer />
        </div>
      </div>
    </div>
  );
}
