import { useEffect, useState } from "react";
import { AdminStepUpModal } from "../../../modals/AdminStepUpModal";
import { AdminShell } from "../../../admin/AdminShell";
import { useAdminSessionStore } from "../../../../stores/adminSession";
import { useAdminRouteStore } from "../../../../stores/adminRoute";
import { useServerAdminStore } from "../../../../stores/serverAdmin";

function formatExpiry(expiresAt: number | null): string {
  if (!expiresAt) return "Not active";
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return "Expired";
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/**
 * Platform staff console (GET /v1/admin/* via sidecar).
 * Reads work with session Bearer; mutates need step-up capability.
 * Clears prior admin navigation / orphaned server-admin overlays on mount.
 */
export default function AdminPage() {
  const isPlatformAdmin = useAdminSessionStore((s) => s.isPlatformAdmin);
  const capabilityActive = useAdminSessionStore((s) => s.capabilityActive);
  const capabilityExpiresAt = useAdminSessionStore((s) => s.capabilityExpiresAt);
  const loadingWhoami = useAdminSessionStore((s) => s.loadingWhoami);
  const loadingCatalog = useAdminSessionStore((s) => s.loadingCatalog);
  const loadCatalog = useAdminSessionStore((s) => s.loadCatalog);
  const refreshWhoami = useAdminSessionStore((s) => s.refreshWhoami);
  const handleCapabilityUnauthorized = useAdminSessionStore(
    (s) => s.handleCapabilityUnauthorized,
  );
  const resetRoute = useAdminRouteStore((s) => s.reset);
  const closeServerAdmin = useServerAdminStore((s) => s.close);

  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [expiryLabel, setExpiryLabel] = useState(formatExpiry(null));
  const [stepUpPrompted, setStepUpPrompted] = useState(false);

  useEffect(() => {
    resetRoute();
    closeServerAdmin();
    void refreshWhoami();
    return () => {
      resetRoute();
    };
  }, [resetRoute, closeServerAdmin, refreshWhoami]);

  useEffect(() => {
    if (stepUpOpen) void refreshWhoami();
  }, [stepUpOpen, refreshWhoami]);

  useEffect(() => {
    if (capabilityActive) {
      void loadCatalog();
      return;
    }
    if (isPlatformAdmin && !stepUpPrompted && !loadingWhoami) {
      setStepUpPrompted(true);
      setStepUpOpen(true);
    }
  }, [
    capabilityActive,
    isPlatformAdmin,
    loadCatalog,
    stepUpPrompted,
    loadingWhoami,
  ]);

  useEffect(() => {
    const tick = () => {
      setExpiryLabel(formatExpiry(capabilityExpiresAt));
      if (
        capabilityExpiresAt &&
        capabilityExpiresAt <= Date.now() &&
        capabilityActive
      ) {
        handleCapabilityUnauthorized();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [
    capabilityActive,
    capabilityExpiresAt,
    handleCapabilityUnauthorized,
  ]);

  const showConsole = isPlatformAdmin === true || capabilityActive;

  return (
    <div className="relative h-full min-h-0 flex flex-col">
      {showConsole ? (
        <AdminShell
          expiryLabel={expiryLabel}
          onStepUp={() => setStepUpOpen(true)}
        />
      ) : (
        <div className="flex h-full items-center justify-center px-6">
          <div className="cf-panel max-w-md rounded-xl p-8 text-center">
            <h2 className="font-sora text-[16px] font-semibold text-text-primary">
              Platform admin
            </h2>
            <p className="mt-2 text-[12px] text-text-muted leading-relaxed">
              {loadingWhoami
                ? "Checking staff access…"
                : "This console is limited to platform staff accounts."}
            </p>
            {!loadingWhoami && isPlatformAdmin === false ? null : (
              <button
                type="button"
                onClick={() => setStepUpOpen(true)}
                className="cf-btn-primary mt-4 rounded-lg px-4 py-2 text-[11px] font-semibold cursor-pointer"
              >
                Step up
              </button>
            )}
          </div>
        </div>
      )}

      {loadingCatalog && capabilityActive ? (
        <div className="pointer-events-none absolute bottom-4 right-4 rounded-lg bg-black/60 px-3 py-1.5 text-[10px] text-text-muted">
          Syncing staff catalog…
        </div>
      ) : null}

      <AdminStepUpModal
        open={stepUpOpen}
        onClose={() => setStepUpOpen(false)}
        onSuccess={() => setStepUpOpen(false)}
      />
    </div>
  );
}
