import { useCallback, useEffect, useState } from "react";
import {
  AdminClient,
  extractAdminCursor,
  extractAdminRows,
} from "../../../lib/adminClient";
import { formatRelativeTime } from "../../../lib/adminFormatters";
import {
  OpsButton,
  OpsDrawer,
  OpsError,
  OpsInput,
  OpsPageHeader,
  OpsTable,
  OpsToolbar,
  type OpsColumn,
} from "../ui/ops";
import { OpsJsonBlock } from "../ui/OpsJsonBlock";

type AuditRow = Record<string, unknown> & { id: string };

export function AuditView() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [detail, setDetail] = useState<AuditRow | null>(null);

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
        const list = extractAdminRows(raw).map((r, i) => ({
          ...r,
          id: String(r.id ?? `${r.action}-${r.created_at ?? i}`),
        })) as AuditRow[];
        setRows((prev) => (next ? [...prev, ...list] : list));
        const nextCursor = extractAdminCursor(raw);
        setCursor(nextCursor);
        setHasMore(Boolean(nextCursor));
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
    setHasMore(false);
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, actor]);

  const columns: OpsColumn<AuditRow>[] = [
    {
      key: "when",
      header: "When",
      render: (r) => (
        <span className="text-[11px] text-text-secondary">
          {formatRelativeTime(String(r.created_at ?? r.ts ?? "")) || "—"}
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
      key: "summary",
      header: "Context",
      render: (r) => (
        <span className="text-[11px] text-text-muted line-clamp-2">
          {String(
            r.summary ??
              r.message ??
              r.details ??
              r.resource ??
              r.reason ??
              "—",
          )}
        </span>
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
      key: "more",
      header: "",
      render: (r) => (
        <OpsButton onClick={() => setDetail(r)}>More</OpsButton>
      ),
    },
  ];

  return (
    <div>
      <OpsPageHeader
        title="Audit"
        subtitle="Platform action history with human context. Open a row for full details."
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
        <OpsButton
          variant="primary"
          onClick={() => void load(false)}
          disabled={loading}
        >
          {loading ? "…" : "Reload"}
        </OpsButton>
        <OpsButton onClick={() => void load(true)} disabled={loading || !hasMore}>
          Load more
        </OpsButton>
      </OpsToolbar>
      {error ? (
        <OpsError message={error} onRetry={() => void load(false)} />
      ) : null}
      <OpsTable columns={columns} rows={rows} />
      <OpsDrawer
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? String(detail.action ?? "Audit event") : "Audit"}
      >
        {detail ? (
          <div className="flex flex-col gap-3 p-1">
            <p className="text-[12px] text-text-secondary">
              {String(
                detail.summary ??
                  detail.message ??
                  detail.details ??
                  "No summary provided.",
              )}
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <div className="text-text-disabled">Actor</div>
                <div className="font-mono">
                  {String(detail.actor_id ?? detail.actor ?? "—")}
                </div>
              </div>
              <div>
                <div className="text-text-disabled">Target</div>
                <div className="font-mono">
                  {String(detail.target_id ?? detail.target ?? "—")}
                </div>
              </div>
            </div>
            <OpsJsonBlock value={detail} title="audit event" defaultOpen />
          </div>
        ) : null}
      </OpsDrawer>
    </div>
  );
}
