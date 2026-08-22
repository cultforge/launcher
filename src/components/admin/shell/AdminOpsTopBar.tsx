import { Radio, Shield, X } from "lucide-react";
import { OpsButton, OpsStatusPill } from "../ui/ops";
import { useAdminSessionStore } from "../../../stores/adminSession";
import { useAdminRouteStore } from "../../../stores/adminRoute";
import { useNavigationStore, type PrimaryTab } from "../../../typlibs";
import { HOME_BUILDS_SIDE } from "../../../lib/homeNav";
import { ADMIN_NAV } from "../../../lib/adminNav";
import { useAppStore } from "../../../userstore";

function formatExpiry(expiresAt: number | null): string {
  if (!expiresAt) return "—";
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return "0:00";
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

type Props = {
  expiryLabel: string;
  onStepUp: () => void;
  onRefresh: () => void;
  loadingCatalog: boolean;
};

export function AdminOpsTopBar({
  expiryLabel,
  onStepUp,
  onRefresh,
  loadingCatalog,
}: Props) {
  const badgeState = useAdminSessionStore((s) => s.badgeState);
  const handle = useAdminSessionStore((s) => s.handle);
  const capabilityExpiresAt = useAdminSessionStore((s) => s.capabilityExpiresAt);
  const profileName = useAppStore((s) => s.currentUser?.name);
  const activeSection = useAdminRouteStore((s) => s.activeSection);
  const streamOpen = useAdminRouteStore((s) => s.streamOpen);
  const setStreamOpen = useAdminRouteStore((s) => s.setStreamOpen);
  const resetRoute = useAdminRouteStore((s) => s.reset);
  const setPrimaryTab = useNavigationStore((s) => s.setPrimaryTab);
  const setSideItem = useNavigationStore((s) => s.setSideItem);

  const sectionLabel =
    ADMIN_NAV.find((n) => n.id === activeSection)?.label ?? activeSection;

  const countdown =
    badgeState === "active"
      ? expiryLabel || formatExpiry(capabilityExpiresAt)
      : null;

  const badge =
    badgeState === "active"
      ? { state: "ok" as const, label: "Capability active" }
      : badgeState === "relogin"
        ? { state: "err" as const, label: "Re-login required" }
        : badgeState === "expired"
          ? { state: "warn" as const, label: "Capability expired" }
          : { state: "warn" as const, label: "Needs step-up" };

  const exitAdmin = () => {
    resetRoute();
    setPrimaryTab("Home" as PrimaryTab);
    setSideItem(HOME_BUILDS_SIDE);
  };

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/10 bg-black/50 px-3 py-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-base/15 text-primary-base">
          <Shield size={14} />
        </div>
        <div className="min-w-0">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-text-disabled truncate">
            Platform admin / {sectionLabel}
          </div>
          <div className="truncate text-[12px] font-medium text-text-primary">
            {profileName || handle || "Staff"}
            {countdown ? (
              <span className="ml-2 font-mono text-[10px] text-text-muted">
                {countdown} left
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <OpsStatusPill state={badge.state} label={badge.label} />
        <OpsButton
          onClick={() => setStreamOpen(!streamOpen)}
          className="inline-flex items-center gap-1"
        >
          <Radio size={11} />
          {streamOpen ? "Hide stream" : "Audit stream"}
        </OpsButton>
        <OpsButton onClick={onRefresh} disabled={loadingCatalog}>
          {loadingCatalog ? "…" : "Refresh"}
        </OpsButton>
        <OpsButton
          variant="primary"
          onClick={onStepUp}
          disabled={badgeState === "relogin"}
        >
          {badgeState === "active" ? "Re-step-up" : "Step up"}
        </OpsButton>
        <OpsButton
          onClick={exitAdmin}
          className="inline-flex items-center gap-1"
        >
          <X size={11} />
          Exit
        </OpsButton>
      </div>
    </header>
  );
}
