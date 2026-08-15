import { Shield } from "lucide-react";
import { AdminCapabilityBadge } from "./shared/AdminCapabilityBadge";
import { dynamicSectionMeta, ADMIN_SECTIONS } from "../../lib/adminCatalog";

function sectionLabel(id: string): string {
  if (id.startsWith("dynamic:")) {
    return dynamicSectionMeta(id)?.label ?? id.slice("dynamic:".length);
  }
  return ADMIN_SECTIONS.find((s) => s.id === id)?.label ?? id;
}

type Props = {
  expiryLabel: string;
  capabilityActive: boolean;
  activeSection: string;
  onStepUp: () => void;
  onRefresh: () => void;
  loadingCatalog: boolean;
};

export function AdminTopBar({
  expiryLabel,
  capabilityActive,
  activeSection,
  onStepUp,
  onRefresh,
  loadingCatalog,
}: Props) {
  const breadcrumb =
    activeSection === "overview"
      ? "Staff console"
      : `Staff console / ${sectionLabel(activeSection)}`;

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/10 bg-black/40 px-4 py-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-base/15 text-primary-base">
          <Shield size={16} />
        </div>
        <div className="min-w-0">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-primary-base truncate">
            {breadcrumb}
          </div>
          <div className="truncate font-sora text-[15px] font-bold text-text-primary">
            Platform admin
          </div>
        </div>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <AdminCapabilityBadge active={capabilityActive} expiryLabel={expiryLabel} />
        <button
          type="button"
          onClick={onRefresh}
          disabled={loadingCatalog}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] text-text-secondary hover:bg-white/4 cursor-pointer disabled:opacity-50"
        >
          {loadingCatalog ? "Refreshing…" : "Refresh data"}
        </button>
        <button
          type="button"
          onClick={onStepUp}
          className="cf-btn-primary rounded-lg px-3 py-1.5 text-[10px] font-semibold cursor-pointer"
        >
          {capabilityActive ? "Re-step-up" : "Step up"}
        </button>
      </div>
    </header>
  );
}
