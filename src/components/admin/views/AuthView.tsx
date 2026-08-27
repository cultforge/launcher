import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AdminClient,
  isAdminCapabilityError,
  pickAdminNumber,
  pickAdminString,
  unwrapAdminRecord,
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
import { OpsJsonBlock } from "../ui/OpsJsonBlock";

function asRec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function providersLabel(overview: Record<string, unknown> | null): string {
  if (!overview) return "—";
  const p = overview.providers;
  if (Array.isArray(p)) {
    return (
      p
        .map((item) => {
          if (typeof item === "string") return item;
          const row = asRec(item);
          return row
            ? String(row.name ?? row.id ?? row.provider ?? "")
            : "";
        })
        .filter(Boolean)
        .join(", ") || String(p.length)
    );
  }
  if (typeof p === "number") return String(p);
  if (typeof p === "string") return p;
  return pickAdminString(overview, ["provider_count", "providers_count"]);
}

export function AuthView() {
  const capabilityActive = useAdminSessionStore((s) => s.capabilityActive);
  const handleUnauthorized = useAdminSessionStore(
    (s) => s.handleCapabilityUnauthorized,
  );
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [raw, setRaw] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await AdminClient.authOverview();
      setRaw(response);
      setOverview(unwrapAdminRecord(response) ?? asRec(response));
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
        subtitle="Sign-in health and emergency revoke-all for a user."
        actions={<OpsButton onClick={() => void load()}>Reload</OpsButton>}
      />
      {error ? <OpsError message={error} onRetry={() => void load()} /> : null}
      <OpsStatGrid
        items={[
          {
            label: "Active sessions",
            value: String(
              pickAdminNumber(overview, [
                "active_sessions",
                "sessions",
                "session_count",
              ]) ?? "—",
            ),
          },
          {
            label: "Users",
            value: String(
              pickAdminNumber(overview, ["users", "user_count", "accounts"]) ??
                "—",
            ),
          },
          {
            label: "Logins (24h)",
            value: String(
              pickAdminNumber(overview, [
                "logins_24h",
                "logins",
                "successful_logins_24h",
              ]) ?? "—",
            ),
          },
          {
            label: "Failures (24h)",
            value: String(
              pickAdminNumber(overview, [
                "failures_24h",
                "failures",
                "failed_logins_24h",
              ]) ?? "—",
            ),
          },
          {
            label: "Freshness",
            value: pickAdminString(overview, ["freshness", "status", "state"]),
          },
          {
            label: "Providers",
            value: providersLabel(overview),
          },
        ]}
      />
      <div className="mt-6 rounded-lg border border-white/10 bg-black/25 p-3 max-w-lg space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          Revoke user sessions
        </div>
        <p className="text-[11px] text-text-disabled">
          Signs the player out everywhere. Paste a CultForge user id.
        </p>
        <OpsToolbar>
          <OpsInput
            placeholder="User id (cf_…)"
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
      <div className="mt-4 max-w-xl">
        <OpsJsonBlock value={raw} title="auth overview" />
      </div>
      <OpsConfirmDialog
        open={confirmOpen}
        title="Revoke all sessions"
        body={`Revoke every session for ${userId.trim()}?`}
        confirmText="revoke"
        danger
        busy={busy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={async () => {
          if (!capabilityActive) return;
          setBusy(true);
          try {
            await AdminClient.revokeAllUserSessions(userId.trim());
            toast.success("Sessions revoked");
            setConfirmOpen(false);
            setUserId("");
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
