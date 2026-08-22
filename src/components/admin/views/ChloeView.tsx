import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AdminClient,
  isAdminCapabilityError,
  unwrapAdminData,
} from "../../../lib/adminClient";
import { useAdminSessionStore } from "../../../stores/adminSession";
import {
  OpsButton,
  OpsError,
  OpsInput,
  OpsPageHeader,
  OpsStatGrid,
  OpsToolbar,
} from "../ui/ops";

function asRec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

export function ChloeView() {
  const capabilityActive = useAdminSessionStore((s) => s.capabilityActive);
  const handleUnauthorized = useAdminSessionStore(
    (s) => s.handleCapabilityUnauthorized,
  );
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [quota, setQuota] = useState<Record<string, unknown> | null>(null);
  const [userId, setUserId] = useState("");
  const [quotaValue, setQuotaValue] = useState("");
  const [actionId, setActionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadOverview = useCallback(async () => {
    setError(null);
    try {
      const raw = await AdminClient.chloeOverview();
      setOverview(asRec(unwrapAdminData(raw)) ?? asRec(raw));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const loadQuota = async () => {
    if (!userId.trim()) return;
    setBusy(true);
    try {
      const raw = await AdminClient.getChloeQuota(userId.trim());
      setQuota(asRec(unwrapAdminData(raw)) ?? asRec(raw));
    } catch (err) {
      if (isAdminCapabilityError(err)) handleUnauthorized();
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const saveQuota = async () => {
    if (!capabilityActive || !userId.trim()) {
      toast.error("Step up and user id required");
      return;
    }
    setBusy(true);
    try {
      await AdminClient.setChloeQuota(userId.trim(), {
        quota: Number(quotaValue),
      });
      toast.success("Quota updated");
      await loadQuota();
      await loadOverview();
    } catch (err) {
      if (isAdminCapabilityError(err)) handleUnauthorized();
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const expire = async () => {
    if (!capabilityActive || !actionId.trim()) {
      toast.error("Step up and action id required");
      return;
    }
    setBusy(true);
    try {
      await AdminClient.expireChloeAction(actionId.trim());
      toast.success("Action expired");
      setActionId("");
      await loadOverview();
    } catch (err) {
      if (isAdminCapabilityError(err)) handleUnauthorized();
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <OpsPageHeader
        title="Chloe"
        subtitle="Overview counts, per-user quota, and expire pending actions."
        actions={
          <OpsButton onClick={() => void loadOverview()}>Reload</OpsButton>
        }
      />
      {error ? (
        <OpsError message={error} onRetry={() => void loadOverview()} />
      ) : null}
      <OpsStatGrid
        items={[
          {
            label: "Pending",
            value: String(overview?.pending ?? overview?.pending_actions ?? "—"),
          },
          {
            label: "Active",
            value: String(overview?.active ?? overview?.active_actions ?? "—"),
          },
          {
            label: "Users",
            value: String(overview?.users ?? overview?.user_count ?? "—"),
          },
          {
            label: "Quota total",
            value: String(overview?.quota_total ?? overview?.total_quota ?? "—"),
          },
        ]}
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-black/25 p-3 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            User quota
          </div>
          <OpsToolbar>
            <OpsInput
              placeholder="User id"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-48 font-mono"
            />
            <OpsButton onClick={() => void loadQuota()} disabled={busy}>
              Load
            </OpsButton>
          </OpsToolbar>
          {quota ? (
            <pre className="overflow-auto rounded-md border border-white/10 bg-black/40 p-2 text-[10px] font-mono max-h-40">
              {JSON.stringify(quota, null, 2)}
            </pre>
          ) : null}
          <OpsInput
            placeholder="New quota"
            value={quotaValue}
            onChange={(e) => setQuotaValue(e.target.value)}
            className="w-32"
          />
          <OpsButton
            variant="primary"
            disabled={!capabilityActive || busy || !userId || !quotaValue}
            onClick={() => void saveQuota()}
          >
            Set quota
          </OpsButton>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/25 p-3 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Expire action
          </div>
          <OpsInput
            placeholder="Action id"
            value={actionId}
            onChange={(e) => setActionId(e.target.value)}
            className="w-full font-mono"
          />
          <OpsButton
            variant="danger"
            disabled={!capabilityActive || busy || !actionId}
            onClick={() => void expire()}
          >
            Expire
          </OpsButton>
        </div>
      </div>
    </div>
  );
}
