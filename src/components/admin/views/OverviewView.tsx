import { useCallback, useEffect, useState } from "react";
import { AdminClient, unwrapAdminData } from "../../../lib/adminClient";
import {
  OpsButton,
  OpsError,
  OpsPageHeader,
  OpsStatGrid,
  OpsStatusPill,
} from "../ui/ops";

function asRec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

export function OverviewView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<Record<string, unknown> | null>(null);
  const [services, setServices] = useState<Record<string, unknown> | null>(null);
  const [chloe, setChloe] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, b, c] = await Promise.all([
        AdminClient.metricsLive().catch(() => null),
        AdminClient.metricsServices().catch(() => null),
        AdminClient.chloeOverview().catch(() => null),
      ]);
      setLive(asRec(unwrapAdminData(a)) ?? asRec(a));
      setServices(asRec(unwrapAdminData(b)) ?? asRec(b));
      setChloe(asRec(unwrapAdminData(c)) ?? asRec(c));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load overview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const aggregate = String(services?.aggregate ?? "—");
  const aggState =
    aggregate === "ok"
      ? "ok"
      : aggregate === "degraded"
        ? "warn"
        : aggregate === "down"
          ? "err"
          : "muted";

  return (
    <div>
      <OpsPageHeader
        title="Overview"
        subtitle="Live platform health, service fan-out, and Chloe counters."
        actions={
          <OpsButton onClick={() => void load()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </OpsButton>
        }
      />
      {error ? <OpsError message={error} onRetry={() => void load()} /> : null}
      <OpsStatGrid
        items={[
          {
            label: "Uptime",
            value: String(live?.uptime ?? live?.uptime_human ?? "—"),
          },
          {
            label: "RPM",
            value: String(live?.rpm ?? live?.requests_per_minute ?? "—"),
          },
          {
            label: "5xx",
            value: String(live?.errors_5xx ?? live?.["5xx"] ?? "—"),
          },
          {
            label: "DB",
            value: String(live?.db_ping_ms ?? live?.db ?? "—"),
          },
        ]}
      />
      <div className="mb-4 flex items-center gap-2">
        <span className="text-[11px] text-text-muted">Services</span>
        <OpsStatusPill state={aggState} label={String(aggregate)} />
      </div>
      <div className="grid gap-2 sm:grid-cols-3 mb-6">
        {(["auth", "invite", "guilds"] as const).map((key) => {
          const block = asRec(services?.[key]) ?? asRec(services?.[`${key}_status`]);
          const status = String(block?.status ?? block?.state ?? services?.[key] ?? "—");
          return (
            <div
              key={key}
              className="rounded-lg border border-white/10 bg-black/25 px-3 py-2"
            >
              <div className="text-[10px] uppercase tracking-wider text-text-disabled">
                {key}
              </div>
              <div className="mt-1 text-[12px] font-medium text-text-primary">
                {status}
              </div>
            </div>
          );
        })}
      </div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-disabled">
        Chloe
      </h3>
      <OpsStatGrid
        items={[
          {
            label: "Pending",
            value: String(chloe?.pending ?? chloe?.pending_actions ?? "—"),
          },
          {
            label: "Users",
            value: String(chloe?.users ?? chloe?.active_users ?? "—"),
          },
          {
            label: "Quota hits",
            value: String(chloe?.quota_hits ?? "—"),
          },
          {
            label: "Actions",
            value: String(chloe?.actions_today ?? chloe?.actions ?? "—"),
          },
        ]}
      />
    </div>
  );
}
