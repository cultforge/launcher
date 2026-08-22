import { useCallback, useEffect, useState } from "react";
import { AdminClient, extractAdminRows } from "../../../lib/adminClient";
import {
  OpsButton,
  OpsError,
  OpsInput,
  OpsPageHeader,
  OpsTable,
  OpsToolbar,
  type OpsColumn,
} from "../ui/ops";

type AuditRow = Record<string, unknown> & { id: string };

export function AuditView() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);

  const load = useCallback(
    async (next?: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const raw = await AdminClient.listAudit({
          limit: 50,
          ...(action ? { action } : {}),
          ...(actor ? { actor_id: actor } : {}),
          ...(next && cursor ? { cursor } : {}),
        });
        const list = extractAdminRows(raw).map((r) => ({
          ...r,
          id: String(r.id ?? `${r.action}-${r.created_at}`),
        })) as AuditRow[];
        setRows((prev) => (next ? [...prev, ...list] : list));
        if (list.length) {
          setCursor(list[list.length - 1]!.id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load audit");
      } finally {
        setLoading(false);
      }
    },
    [action, actor, cursor],
  );

  useEffect(() => {
    setCursor(null);
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, actor]);

  const columns: OpsColumn<AuditRow>[] = [
    {
      key: "when",
      header: "When",
      render: (r) => (
        <span className="font-mono text-[10px]">
          {String(r.created_at ?? r.ts ?? "—")}
        </span>
      ),
    },
    {
      key: "action",
      header: "Action",
      render: (r) => (
        <span className="text-text-primary">{String(r.action ?? "—")}</span>
      ),
    },
    {
      key: "actor",
      header: "Actor",
      render: (r) => (
        <span className="font-mono text-[10px]">
          {String(r.actor_id ?? r.actor ?? "—")}
        </span>
      ),
    },
    {
      key: "target",
      header: "Target",
      render: (r) => (
        <span className="font-mono text-[10px]">
          {String(r.target_id ?? r.target ?? "—")}
        </span>
      ),
    },
  ];

  return (
    <div>
      <OpsPageHeader
        title="Audit"
        subtitle="Platform action history. Open the Audit stream drawer for a live feed."
      />
      <OpsToolbar>
        <OpsInput
          placeholder="Filter action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="w-40"
        />
        <OpsInput
          placeholder="Actor id"
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          className="w-40 font-mono"
        />
        <OpsButton variant="primary" onClick={() => void load(false)} disabled={loading}>
          {loading ? "…" : "Reload"}
        </OpsButton>
        <OpsButton onClick={() => void load(true)} disabled={loading || !cursor}>
          More
        </OpsButton>
      </OpsToolbar>
      {error ? <OpsError message={error} onRetry={() => void load(false)} /> : null}
      <OpsTable columns={columns} rows={rows} empty="No audit rows" />
    </div>
  );
}
