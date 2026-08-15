import { useState } from "react";
import { toast } from "sonner";
import { adminRequest, type AdminCatalogEntry } from "../../../lib/adminApi";
import { useAdminSessionStore } from "../../../stores/adminSession";
import { ClientHttpError } from "../../../lib/client";
import { AdminErrorBanner } from "../shared/AdminErrorBanner";
import { AdminToolbar } from "../shared/AdminToolbar";

export function AdminCatalogExplorer() {
  const groupedCatalog = useAdminSessionStore((s) => s.groupedCatalog);
  const handleUnauthorized = useAdminSessionStore(
    (s) => s.handleCapabilityUnauthorized,
  );
  const capabilityActive = useAdminSessionStore((s) => s.capabilityActive);
  const entries = groupedCatalog?.explorer ?? [];

  const [selected, setSelected] = useState<AdminCatalogEntry | null>(
    entries[0] ?? null,
  );
  const [queryText, setQueryText] = useState("{}");
  const [bodyText, setBodyText] = useState("{}");
  const [response, setResponse] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!selected) return;
    if (selected.mutate && !capabilityActive) {
      toast.error("Step up required for mutating commands.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      let query: Record<string, string> | undefined;
      let body: Record<string, unknown> | undefined;

      if (queryText.trim() && queryText.trim() !== "{}") {
        query = JSON.parse(queryText) as Record<string, string>;
      }
      if (
        selected.method !== "GET" &&
        selected.method !== "DELETE" &&
        bodyText.trim() &&
        bodyText.trim() !== "{}"
      ) {
        body = JSON.parse(bodyText) as Record<string, unknown>;
      }

      const result = await adminRequest({
        method: selected.method,
        path: selected.path,
        query,
        body,
      });
      setResponse(result);
      toast.success("Request completed");
    } catch (err) {
      if (err instanceof ClientHttpError && err.status === 401) {
        handleUnauthorized();
      }
      setError(err instanceof Error ? err.message : "Request failed");
      setResponse(null);
    } finally {
      setBusy(false);
    }
  };

  const copyResponse = () => {
    if (!response) return;
    void navigator.clipboard.writeText(JSON.stringify(response, null, 2));
    toast.success("Copied to clipboard");
  };

  return (
    <div>
      <AdminToolbar
        title="API Explorer"
        description="Run unmatched catalog commands with query/body parameters. Mutates require capability."
      />

      {entries.length === 0 ? (
        <p className="text-[12px] text-text-muted">
          All catalog entries are mapped to domain sections.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-4">
          <div className="rounded-xl border border-white/10 overflow-hidden max-h-[480px] overflow-y-auto">
            {entries.map((entry) => (
              <button
                key={`${entry.method}:${entry.path}`}
                type="button"
                onClick={() => {
                  setSelected(entry);
                  setResponse(null);
                  setError(null);
                }}
                className={`w-full text-left px-3 py-2.5 border-b border-white/5 cursor-pointer ${
                  selected?.path === entry.path &&
                  selected?.method === entry.method
                    ? "bg-primary-base/12"
                    : "hover:bg-white/4"
                }`}
              >
                <span className="text-[9px] font-bold uppercase tracking-wide text-text-muted mr-2">
                  {entry.method}
                </span>
                <code className="text-[10px] text-text-primary break-all">
                  {entry.path}
                </code>
                {entry.mutate ? (
                  <span className="ml-1 text-[8px] uppercase text-state-warning">
                    mutate
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            {selected ? (
              <>
                <div className="rounded-lg bg-black/30 border border-white/10 px-3 py-2">
                  <code className="text-[11px] text-text-primary">
                    {selected.method} {selected.path}
                  </code>
                </div>

                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    Query params (JSON)
                  </label>
                  <textarea
                    value={queryText}
                    onChange={(e) => setQueryText(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-[11px] font-mono text-text-primary outline-none"
                  />
                </div>

                {selected.method !== "GET" && selected.method !== "DELETE" ? (
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                      Body (JSON)
                    </label>
                    <textarea
                      value={bodyText}
                      onChange={(e) => setBodyText(e.target.value)}
                      rows={5}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-[11px] font-mono text-text-primary outline-none"
                    />
                  </div>
                ) : null}

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run()}
                  className="cf-btn-primary self-start rounded-lg px-4 py-2 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                >
                  {busy ? "Running…" : "Run request"}
                </button>

                {error ? <AdminErrorBanner message={error} /> : null}

                {response ? (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                        Response
                      </span>
                      <button
                        type="button"
                        onClick={copyResponse}
                        className="text-[10px] text-primary-base cursor-pointer"
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="rounded-lg bg-black/40 border border-white/8 p-3 text-[10px] text-text-secondary overflow-x-auto max-h-[320px]">
                      {JSON.stringify(response, null, 2)}
                    </pre>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
