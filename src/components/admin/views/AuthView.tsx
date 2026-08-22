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
  OpsConfirmDialog,
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

export function AuthView() {
  const capabilityActive = useAdminSessionStore((s) => s.capabilityActive);
  const handleUnauthorized = useAdminSessionStore(
    (s) => s.handleCapabilityUnauthorized,
  );
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const raw = await AdminClient.authOverview();
      setOverview(asRec(unwrapAdminData(raw)) ?? asRec(raw));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <OpsPageHeader
        title="Auth"
        subtitle="Auth service overview and revoke-all sessions for a user."
        actions={
          <OpsButton onClick={() => void load()}>Reload</OpsButton>
        }
      />
      {error ? <OpsError message={error} onRetry={() => void load()} /> : null}
      <OpsStatGrid
        items={[
          {
            label: "Active sessions",
            value: String(
              overview?.active_sessions ?? overview?.sessions ?? "—",
            ),
          },
          {
            label: "Users",
            value: String(overview?.users ?? overview?.user_count ?? "—"),
          },
          {
            label: "Freshness",
            value: String(overview?.freshness ?? overview?.status ?? "—"),
          },
          {
            label: "Providers",
            value: String(overview?.providers ?? "—"),
          },
        ]}
      />
      <div className="mt-6 rounded-lg border border-white/10 bg-black/25 p-3 max-w-lg space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          Revoke user sessions
        </div>
        <OpsToolbar>
          <OpsInput
            placeholder="User id"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-56 font-mono"
          />
          <OpsButton
            variant="danger"
            disabled={!capabilityActive || !userId.trim()}
            onClick={() => setConfirmOpen(true)}
          >
            Revoke all
          </OpsButton>
        </OpsToolbar>
      </div>
      <OpsConfirmDialog
        open={confirmOpen}
        title="Revoke all auth sessions"
        body={`Revoke every session for user ${userId}. They must sign in again.`}
        confirmText="revoke-all"
        danger
        busy={busy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={async () => {
          if (!capabilityActive || !userId.trim()) return;
          setBusy(true);
          try {
            await AdminClient.revokeUserAuthSessions(userId.trim());
            toast.success("Sessions revoked");
            setConfirmOpen(false);
            await load();
          } catch (err) {
            if (isAdminCapabilityError(err)) handleUnauthorized();
            toast.error(err instanceof Error ? err.message : "Failed");
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
