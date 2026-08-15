import { useEffect, useState } from "react";

import { AdminStepUpModal } from "../../../modals/AdminStepUpModal";

import { AdminShell } from "../../../admin/AdminShell";

import { useAdminSessionStore } from "../../../../stores/adminSession";

import { useAdminRouteStore } from "../../../../stores/adminRoute";



function formatExpiry(expiresAt: number | null): string {

  if (!expiresAt) return "Not active";

  const remaining = expiresAt - Date.now();

  if (remaining <= 0) return "Expired";

  const mins = Math.floor(remaining / 60000);

  const secs = Math.floor((remaining % 60000) / 1000);

  return `${mins}:${String(secs).padStart(2, "0")}`;

}



export default function AdminPage() {

  const capabilityActive = useAdminSessionStore((s) => s.capabilityActive);

  const capabilityExpiresAt = useAdminSessionStore((s) => s.capabilityExpiresAt);

  const loadingCatalog = useAdminSessionStore((s) => s.loadingCatalog);

  const loadCatalog = useAdminSessionStore((s) => s.loadCatalog);

  const refreshWhoami = useAdminSessionStore((s) => s.refreshWhoami);

  const handleCapabilityUnauthorized = useAdminSessionStore(

    (s) => s.handleCapabilityUnauthorized,

  );

  const resetRoute = useAdminRouteStore((s) => s.reset);



  const [stepUpOpen, setStepUpOpen] = useState(false);

  const [expiryLabel, setExpiryLabel] = useState(formatExpiry(null));



  useEffect(() => {

    void refreshWhoami();

  }, [refreshWhoami]);



  useEffect(() => {

    if (stepUpOpen) void refreshWhoami();

  }, [stepUpOpen, refreshWhoami]);



  useEffect(() => {

    if (!capabilityActive) {

      setStepUpOpen(true);

      return;

    }

    void loadCatalog();

  }, [capabilityActive, loadCatalog]);



  useEffect(() => {

    const tick = () => {

      setExpiryLabel(formatExpiry(capabilityExpiresAt));

      if (

        capabilityExpiresAt &&

        capabilityExpiresAt <= Date.now() &&

        capabilityActive

      ) {

        handleCapabilityUnauthorized();

        setStepUpOpen(true);

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



  useEffect(() => {

    if (!capabilityActive) resetRoute();

  }, [capabilityActive, resetRoute]);



  return (

    <div className="h-full min-h-0 flex flex-col">

      {capabilityActive ? (

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

              Complete OAuth step-up to unlock the staff console. Capability

              tokens stay in the sidecar only (~15 min).

            </p>

            <button

              type="button"

              onClick={() => setStepUpOpen(true)}

              className="cf-btn-primary mt-4 rounded-lg px-4 py-2 text-[11px] font-semibold cursor-pointer"

            >

              Step up

            </button>

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

