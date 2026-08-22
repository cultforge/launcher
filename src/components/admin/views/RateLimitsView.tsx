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
  OpsTable,
  OpsToolbar,
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
  const [limit, setLimit] = useState("60");
  const [windowSec, setWindowSec] = useState("60");

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
        key,
        limit: Number(limit),
        window_seconds: Number(windowSec),
      });
      toast.success("Rate limit created");
      setKey("");
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
      header: "Limit",
      render: (r) => String(r.limit ?? r.max ?? "—"),
    },
    {
      key: "window",
      header: "Window",
      render: (r) =>
        String(r.window_seconds ?? r.window ?? r.period ?? "—"),
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
        subtitle="List, create, and delete platform rate-limit entries."
        actions={
          <OpsButton onClick={() => void load()}>Reload</OpsButton>
        }
      />
      <OpsToolbar>
        <OpsInput
          placeholder="Key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="w-40 font-mono"
        />
        <OpsInput
          placeholder="Limit"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          className="w-20"
        />
        <OpsInput
          placeholder="Window sec"
          value={windowSec}
          onChange={(e) => setWindowSec(e.target.value)}
          className="w-24"
        />
        <OpsButton
          variant="primary"
          disabled={!capabilityActive || busy || !key}
          onClick={() => void create()}
        >
          Create
        </OpsButton>
      </OpsToolbar>
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
