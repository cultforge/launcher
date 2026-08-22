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
  OpsError,
  OpsInput,
  OpsPageHeader,
  OpsTable,
  OpsTextarea,
  OpsToolbar,
  type OpsColumn,
} from "../ui/ops";

type UpdateRow = Record<string, unknown> & { id: string };

export function HotfixesView() {
  const capabilityActive = useAdminSessionStore((s) => s.capabilityActive);
  const handleUnauthorized = useAdminSessionStore(
    (s) => s.handleCapabilityUnauthorized,
  );
  const [rows, setRows] = useState<UpdateRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [version, setVersion] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const raw = await AdminClient.listUpdates();
      setRows(
        extractAdminRows(raw).map((r, i) => ({
          ...r,
          id: String(r.id ?? r.version ?? i),
        })) as UpdateRow[],
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
      await AdminClient.createUpdate({
        title,
        body,
        ...(version ? { version } : {}),
      });
      toast.success("Hotfix created");
      setTitle("");
      setBody("");
      setVersion("");
      await load();
    } catch (err) {
      if (isAdminCapabilityError(err)) handleUnauthorized();
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const columns: OpsColumn<UpdateRow>[] = [
    {
      key: "title",
      header: "Title",
      render: (r) => String(r.title ?? r.name ?? "—"),
    },
    {
      key: "version",
      header: "Version",
      render: (r) => (
        <span className="font-mono text-[10px]">
          {String(r.version ?? "—")}
        </span>
      ),
    },
    {
      key: "when",
      header: "When",
      render: (r) => (
        <span className="font-mono text-[10px]">
          {String(r.created_at ?? "—")}
        </span>
      ),
    },
  ];

  return (
    <div>
      <OpsPageHeader
        title="Hotfixes"
        subtitle="Platform update / hotfix notices."
        actions={
          <OpsButton onClick={() => void load()}>Reload</OpsButton>
        }
      />
      <div className="mb-4 rounded-lg border border-white/10 bg-black/25 p-3 space-y-2 max-w-xl">
        <OpsInput
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full"
        />
        <OpsInput
          placeholder="Version (optional)"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          className="w-40 font-mono"
        />
        <OpsTextarea
          placeholder="Body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className="w-full"
        />
        <OpsButton
          variant="primary"
          disabled={!capabilityActive || busy || !title}
          onClick={() => void create()}
        >
          Create hotfix
        </OpsButton>
      </div>
      <OpsToolbar>
        <span className="text-[11px] text-text-muted">Published updates</span>
      </OpsToolbar>
      {error ? <OpsError message={error} onRetry={() => void load()} /> : null}
      <OpsTable columns={columns} rows={rows} empty="No updates" />
    </div>
  );
}
