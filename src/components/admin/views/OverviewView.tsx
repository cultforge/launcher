import { useCallback, useEffect, useState } from "react";
import {
  AdminClient,
  pickAdminNumber,
  pickAdminString,
  unwrapAdminRecord,
} from "../../../lib/adminClient";
import {
  OpsButton,
  OpsError,
  OpsPageHeader,
  OpsStatGrid,
  OpsStatusPill,
} from "../ui/ops";
import { OpsJsonBlock } from "../ui/OpsJsonBlock";

function asRec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function fmtNum(n: number | null, suffix = ""): string {
  if (n == null) return "—";
  return `${n}${suffix}`;
}

export function OverviewView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<Record<string, unknown> | null>(null);
  const [services, setServices] = useState<Record<string, unknown> | null>(null);
  const [chloe, setChloe] = useState<Record<string, unknown> | null>(null);
  const [rawBundle, setRawBundle] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, b, c] = await Promise.all([
        AdminClient.metricsLive().catch((e) => e),
        AdminClient.metricsServices().catch((e) => e),
        AdminClient.chloeOverview().catch((e) => e),
      ]);
      const liveRec =
        a instanceof Error ? null : unwrapAdminRecord(a) ?? asRec(a);
      const svcRec =
        b instanceof Error ? null : unwrapAdminRecord(b) ?? asRec(b);
      const chloeRec =
        c instanceof Error ? null : unwrapAdminRecord(c) ?? asRec(c);
      setLive(liveRec);
      setServices(svcRec);
      setChloe(chloeRec);
      setRawBundle({
        live: a instanceof Error ? { error: a.message } : a,
        services: b instanceof Error ? { error: b.message } : b,
        chloe: c instanceof Error ? { error: c.message } : c,
      });
      if (!liveRec && !svcRec && !chloeRec) {
        const msg = [a, b, c]
          .filter((x): x is Error => x instanceof Error)
          .map((e) => e.message)
          .join(" · ");
        setError(msg || "Overview metrics unavailable");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load overview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const aggregate = pickAdminString(services, ["aggregate", "status", "state"]);
  const aggState =
    aggregate === "ok"
      ? "ok"
      : aggregate === "degraded"
        ? "warn"
        : aggregate === "down"
          ? "err"
          : "muted";

  const uptime =
    pickAdminString(live, ["uptime_human", "uptime"]) ||
    fmtNum(pickAdminNumber(live, ["uptime_seconds", "uptime_s"]), "s");
  const rpm = fmtNum(
    pickAdminNumber(live, ["rpm", "requests_per_minute", "requests_per_min"]),
  );
  const err5xx = fmtNum(
    pickAdminNumber(live, ["errors_5xx", "5xx", "http_5xx"]),
  );
  const db = (() => {
    const ms = pickAdminNumber(live, ["db_ping_ms", "db_ms", "database_ping_ms"]);
    if (ms != null) return `${ms} ms`;
    return pickAdminString(live, ["db", "database", "db_status"]);
  })();

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
          { label: "Uptime", value: uptime },
          { label: "RPM", value: rpm },
          { label: "5xx", value: err5xx },
          { label: "DB", value: db },
        ]}
      />
      <div className="mb-4 flex items-center gap-2">
        <span className="text-[11px] text-text-muted">Services</span>
        <OpsStatusPill state={aggState} label={String(aggregate)} />
      </div>
      <div className="grid gap-2 sm:grid-cols-3 mb-6">
        {(["auth", "invite", "guilds"] as const).map((key) => {
          const block =
            asRec(services?.[key]) ?? asRec(services?.[`${key}_status`]);
          const status = pickAdminString(
            block ?? services,
            block
              ? ["status", "state", "health"]
              : [key, `${key}_status`],
          );
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
            value: fmtNum(
              pickAdminNumber(chloe, ["pending", "pending_actions", "queue"]),
            ),
          },
          {
            label: "Users",
            value: fmtNum(
              pickAdminNumber(chloe, ["users", "active_users", "user_count"]),
            ),
          },
          {
            label: "Quota hits",
            value: fmtNum(
              pickAdminNumber(chloe, ["quota_hits", "quota_exceeded"]),
            ),
          },
          {
            label: "Actions",
            value: fmtNum(
              pickAdminNumber(chloe, ["actions_today", "actions", "action_count"]),
            ),
          },
        ]}
      />
      <div className="mt-4">
        <OpsJsonBlock value={rawBundle} title="overview responses" />
      </div>
    </div>
  );
}
