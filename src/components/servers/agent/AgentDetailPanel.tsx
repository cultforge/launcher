import { AgentPcControlShell } from "./AgentPcControlShell";
import type { CultAgentNode } from "../../../lib/cultAgentApi";

type AgentDetailPanelProps = {
  node: CultAgentNode;
  focusLocalId?: string | null;
  onRefreshNodes?: () => void;
  showRevoke?: boolean;
  showAddServer?: boolean;
};

/** Aternos-style PC + world control (tabs: Server · Options · Console · Advanced). */
export function AgentDetailPanel(props: AgentDetailPanelProps) {
  return <AgentPcControlShell {...props} />;
}
