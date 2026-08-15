import { useEffect, useState } from "react";
import {
  fetchAdminWhoami,
  type AdminLocalStatus,
  type AdminStepUpHints,
  type AdminWhoami,
} from "../../../lib/adminApi";
import { useAdminSessionStore } from "../../../stores/adminSession";
import { AdminErrorBanner } from "../shared/AdminErrorBanner";
import { AdminLoadingSkeleton } from "../shared/AdminLoadingSkeleton";
import { AdminPageHeader } from "../shared/AdminPageHeader";
import { AdminStatusBadge } from "../shared/AdminStatusBadge";

function formatMinutes(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value < 1) return "<1 min";
  if (value < 60) return `${Math.round(value)} min`;
  const h = Math.floor(value / 60);
  const m = Math.round(value % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

function formatExpiry(ms: number | null): string {
  if (!ms) return "Not active";
  const left = ms - Date.now();
  if (left <= 0) return "Expired";
  return formatMinutes(left / 60_000);
}

export function AdminWhoamiPanel() {
  const capabilityActive = useAdminSessionStore((s) => s.capabilityActive);
  const capabilityExpiresAt = useAdminSessionStore((s) => s.capabilityExpiresAt);
  const refreshWhoami = useAdminSessionStore((s) => s.refreshWhoami);

  const [whoami, setWhoami] = useState<AdminWhoami | null>(null);
  const [local, setLocal] = useState<AdminLocalStatus | null>(null);
  const [hints, setHints] = useState<AdminStepUpHints | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAdminWhoami();
      setWhoami(result.whoami);
      setLocal(result.local);
      setHints(result.hints);
      await refreshWhoami();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load whoami");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const roles = Array.isArray(whoami?.roles)
    ? whoami!.roles.map(String)
    : [];

  return (
    <div>
      <AdminPageHeader
        breadcrumb="Staff console / Whoami"
        title="Your admin session"
        subtitle="This is you as a platform admin — identity, roles, and whether step-up capability is currently unlocked on this machine. It is not a user search or record list."
        actions={
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-white/10 px-3.5 py-2 text-[11px] font-semibold text-text-secondary hover:bg-white/6 cursor-pointer disabled:opacity-40"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        }
      />

      {error ? (
        <AdminErrorBanner message={error} onRetry={() => void load()} />
      ) : loading && !whoami ? (
        <AdminLoadingSkeleton rows={4} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl">
          <div className="cf-panel rounded-xl border border-white/10 p-5">
            <h3 className="font-sora text-[13px] font-semibold text-text-primary mb-3">
              Platform identity
            </h3>
            <dl className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[10px] uppercase tracking-wider text-text-muted">
                  Platform admin
                </dt>
                <dd>
                  <AdminStatusBadge
                    status={whoami?.admin ? "active" : "failed"}
                  />
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-[10px] uppercase tracking-wider text-text-muted">
                  Roles
                </dt>
                <dd className="text-right text-[12px] text-text-primary">
                  {roles.length ? roles.join(", ") : "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[10px] uppercase tracking-wider text-text-muted">
                  Step-up method
                </dt>
                <dd className="text-[12px] text-text-secondary">
                  {String(
                    whoami?.step_up_method ??
                      hints?.stepUpMethod ??
                      "OAuth session",
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[10px] uppercase tracking-wider text-text-muted">
                  Session age
                </dt>
                <dd className="text-[12px] text-text-secondary">
                  {formatMinutes(whoami?.session_age_minutes)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[10px] uppercase tracking-wider text-text-muted">
                  Fresh enough for step-up
                </dt>
                <dd>
                  <AdminStatusBadge
                    status={
                      whoami?.session_fresh_enough === false ? "failed" : "active"
                    }
                  />
                </dd>
              </div>
            </dl>
          </div>

          <div className="cf-panel rounded-xl border border-white/10 p-5">
            <h3 className="font-sora text-[13px] font-semibold text-text-primary mb-3">
              Local capability (this launcher)
            </h3>
            <dl className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[10px] uppercase tracking-wider text-text-muted">
                  Capability unlocked
                </dt>
                <dd>
                  <AdminStatusBadge
                    status={capabilityActive || local?.capability_active ? "active" : "pending"}
                  />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[10px] uppercase tracking-wider text-text-muted">
                  Expires in
                </dt>
                <dd className="text-[12px] text-text-secondary">
                  {formatExpiry(
                    capabilityExpiresAt ?? local?.capability_expires_at ?? null,
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[10px] uppercase tracking-wider text-text-muted">
                  Max step-up window
                </dt>
                <dd className="text-[12px] text-text-secondary">
                  {formatMinutes(
                    whoami?.step_up_session_max_minutes ??
                      hints?.stepUpSessionMaxMinutes,
                  )}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-[11px] leading-relaxed text-text-muted">
              Use <span className="text-text-secondary">Re-step-up</span> in the
              top bar after a fresh OAuth sign-in to unlock mutating admin
              actions. Read-only pages work without capability.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
