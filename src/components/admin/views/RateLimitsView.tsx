import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AdminClient,
  extractAdminRows,
  isAdminCapabilityError,
} from "../../../lib/adminClient";
import { useAdminSessionStore } from "../../../stores/adminSession";
import {
  OpsButton,
  OpsConfirmDialog,
  OpsError,
  OpsInput,
  OpsPageHeader,
  OpsSelect,
  OpsTable,
  type OpsColumn,
} from "../ui/ops";

type LimitRow = Record<string, unknown> & { id: string };

export function RateLimitsView() {
  const capabilityActive = useAdminSessionStore((s) => s.capabilityActive);
  const handleUnauthorized = useAdminSessionStore(
    (s) => s.handleCapabilityUnauthorized,
  );
  const [rows, setRows] = useState<LimitRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [scope, setScope] = useState("user");
  const [times, setTimes] = useState("60");
  const [seconds, setSeconds] = useState("60");
  const [ttl, setTtl] = useState("3600");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const raw = await AdminClient.listRateLimits();
      setRows(
        extractAdminRows(raw).map((r) => ({
          ...r,
          id: String(r.id ?? r.key ?? r.name ?? ""),
        })) as LimitRow[],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!capabilityActive) {
      toast.error("Step up required");
      return;
    }
    setBusy(true);
    try {
      await AdminClient.createRateLimit({
        scope,
        key,
        times: Number(times),
        seconds: Number(seconds),
        ttl_seconds: Number(ttl),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      toast.success("Rate limit created");
      setKey("");
      setReason("");
      await load();
    } catch (err) {
      if (isAdminCapabilityError(err)) handleUnauthorized();
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const columns: OpsColumn<LimitRow>[] = [
    {
      key: "key",
      header: "Key",
      render: (r) => (
        <span className="font-mono text-[11px]">
          {String(r.key ?? r.name ?? r.id)}
        </span>
      ),
    },
    {
      key: "limit",
      header: "Max requests",
      render: (r) => String(r.times ?? r.limit ?? r.max ?? "—"),
    },
    {
      key: "window",
      header: "Every (sec)",
      render: (r) =>
        String(r.seconds ?? r.window_seconds ?? r.window ?? r.period ?? "—"),
    },
    {
      key: "ttl",
      header: "TTL (sec)",
      render: (r) => String(r.ttl_seconds ?? r.ttl ?? "—"),
    },
    {
      key: "reason",
      header: "Why",
      render: (r) => String(r.reason ?? "—"),
    },
    {
      key: "act",
      header: "",
      className: "w-24 text-right",
      render: (r) => (
        <OpsButton
          variant="danger"
          disabled={!capabilityActive}
          onClick={(e) => {
            e.stopPropagation();
            setDeleteId(r.id);
          }}
        >
          Delete
        </OpsButton>
      ),
    },
  ];

  return (
    <div>
      <OpsPageHeader
        title="Rate limits"
        subtitle="Cap how often a user, IP, or path can hit the API. Think: max requests every N seconds."
        actions={
          <OpsButton onClick={() => void load()}>Reload</OpsButton>
        }
      />
      <div className="mb-4 rounded-xl border border-white/10 bg-black/25 p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1 text-[10px] text-text-muted">
          Scope
          <OpsSelect
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            aria-label="Rate limit scope"
          >
            <option value="user">User</option>
            <option value="ip">IP</option>
            <option value="path">Path</option>
            <option value="global">Global</option>
          </OpsSelect>
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-text-muted">
          Key (who / what)
          <OpsInput
            placeholder={
              scope === "user"
                ? "user id"
                : scope === "ip"
                  ? "ip address"
                  : scope === "path"
                    ? "/v1/…"
                    : "optional"
            }
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="w-full font-mono"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-text-muted">
          Max requests
          <OpsInput
            value={times}
            onChange={(e) => setTimes(e.target.value)}
            className="w-full"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-text-muted">
          Every N seconds
          <OpsInput
            value={seconds}
            onChange={(e) => setSeconds(e.target.value)}
            className="w-full"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-text-muted">
          Expires after (TTL sec)
          <OpsInput
            value={ttl}
            onChange={(e) => setTtl(e.target.value)}
            className="w-full"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-text-muted">
          Reason (optional)
          <OpsInput
            placeholder="Why this limit exists"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full"
          />
        </label>
        <div className="sm:col-span-2 lg:col-span-3">
          <OpsButton
            variant="primary"
            disabled={!capabilityActive || busy || !key}
            onClick={() => void create()}
          >
            Create limit
          </OpsButton>
        </div>
      </div>
      {error ? <OpsError message={error} onRetry={() => void load()} /> : null}
      <OpsTable
        columns={columns}
        rows={rows.filter((r) => r.id)}
        empty="No rate limits"
      />
      <OpsConfirmDialog
        open={Boolean(deleteId)}
        title="Delete rate limit"
        body={`Delete rate limit ${deleteId ?? ""}?`}
        confirmText="delete"
        danger
        busy={busy}
        onCancel={() => setDeleteId(null)}
        onConfirm={async () => {
          if (!deleteId || !capabilityActive) return;
          setBusy(true);
          try {
            await AdminClient.deleteRateLimit(deleteId);
            toast.success("Deleted");
            setDeleteId(null);
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
