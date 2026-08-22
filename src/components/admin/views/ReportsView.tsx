import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AdminClient,
  extractAdminRows,
  isAdminCapabilityError,
  unwrapAdminData,
} from "../../../lib/adminClient";
import { useAdminSessionStore } from "../../../stores/adminSession";
import {
  OpsButton,
  OpsDrawer,
  OpsEmpty,
  OpsError,
  OpsInput,
  OpsPageHeader,
  OpsTable,
  OpsToolbar,
  type OpsColumn,
} from "../ui/ops";

type ReportRow = Record<string, unknown> & { id: string };

export function ReportsView() {
  const capabilityActive = useAdminSessionStore((s) => s.capabilityActive);
  const handleUnauthorized = useAdminSessionStore(
    (s) => s.handleCapabilityUnauthorized,
  );
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState("summary");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const raw = await AdminClient.listReports();
      setRows(
        extractAdminRows(raw).map((r) => ({
          ...r,
          id: String(r.id ?? r.report_id ?? ""),
        })) as ReportRow[],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = async (id: string) => {
    setDetailId(id);
    try {
      const raw = await AdminClient.getReport(id);
      const data = unwrapAdminData(raw);
      setDetail(
        data && typeof data === "object"
          ? (data as Record<string, unknown>)
          : { id },
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const run = async () => {
    if (!capabilityActive) {
      toast.error("Step up required");
      return;
    }
    setBusy(true);
    try {
      await AdminClient.runReport({ kind });
      toast.success("Report started");
      await load();
    } catch (err) {
      if (isAdminCapabilityError(err)) handleUnauthorized();
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const columns: OpsColumn<ReportRow>[] = [
    {
      key: "id",
      header: "Id",
      render: (r) => (
        <span className="font-mono text-[10px]">{r.id}</span>
      ),
    },
    {
      key: "kind",
      header: "Kind",
      render: (r) => String(r.kind ?? r.type ?? "—"),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => String(r.status ?? "—"),
    },
    {
      key: "when",
      header: "When",
      render: (r) => (
        <span className="font-mono text-[10px]">
          {String(r.created_at ?? r.completed_at ?? "—")}
        </span>
      ),
    },
  ];

  return (
    <div>
      <OpsPageHeader
        title="Reports"
        subtitle="Run platform reports and inspect results."
        actions={
          <OpsButton onClick={() => void load()}>Reload</OpsButton>
        }
      />
      <OpsToolbar>
        <OpsInput
          placeholder="Report kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="w-40"
        />
        <OpsButton
          variant="primary"
          disabled={!capabilityActive || busy || !kind}
          onClick={() => void run()}
        >
          Run report
        </OpsButton>
      </OpsToolbar>
      {error ? <OpsError message={error} onRetry={() => void load()} /> : null}
      <OpsTable
        columns={columns}
        rows={rows.filter((r) => r.id)}
        onRowClick={(r) => void open(r.id)}
        empty="No reports"
      />
      <OpsDrawer
        open={Boolean(detailId)}
        title="Report detail"
        onClose={() => {
          setDetailId(null);
          setDetail(null);
        }}
      >
        {!detail ? (
          <OpsEmpty title="Loading…" />
        ) : (
          <pre className="overflow-auto rounded-md border border-white/10 bg-black/40 p-3 text-[10px] font-mono text-text-secondary max-h-[60vh]">
            {JSON.stringify(detail, null, 2)}
          </pre>
        )}
      </OpsDrawer>
    </div>
  );
}
