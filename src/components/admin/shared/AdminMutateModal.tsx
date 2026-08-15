import { useState } from "react";
import { ModalShell } from "../../modals/ModalShell";
import type { AdminCatalogEntry } from "../../../lib/adminApi";
import { useAdminMutate } from "../../../hooks/useAdminMutate";

type Props = {
  open: boolean;
  entry: AdminCatalogEntry | null;
  pathParams?: Record<string, string>;
  onClose: () => void;
  onSuccess?: () => void;
};

export function AdminMutateModal({
  open,
  entry,
  pathParams,
  onClose,
  onSuccess,
}: Props) {
  const [bodyText, setBodyText] = useState("{}");
  const { mutate, busy } = useAdminMutate(() => {
    onSuccess?.();
    onClose();
  });

  const handleConfirm = async () => {
    if (!entry) return;
    let body: Record<string, unknown> | undefined;
    if (entry.method !== "GET" && entry.method !== "DELETE") {
      try {
        body = JSON.parse(bodyText) as Record<string, unknown>;
      } catch {
        return;
      }
    }
    await mutate({ entry, pathParams, body });
  };

  const needsBody =
    entry &&
    !["GET", "DELETE"].includes(entry.method) &&
    !entry.path.includes("{");

  return (
    <ModalShell
      open={open && Boolean(entry)}
      onClose={onClose}
      title="Confirm admin action"
      wide
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-text-muted cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleConfirm()}
            className="cf-btn-primary rounded-lg px-3 py-1.5 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
          >
            {busy ? "Running…" : "Confirm"}
          </button>
        </>
      }
    >
      {entry ? (
        <div className="flex flex-col gap-4">
          <p className="text-[12px] text-text-muted">
            This action requires an active admin capability token. It will be
            proxied through the sidecar with catalog validation.
          </p>
          <div className="rounded-lg bg-black/30 border border-white/10 px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-state-warning mr-2">
              {entry.method}
            </span>
            <code className="text-[11px] text-text-primary break-all">
              {entry.path}
            </code>
          </div>
          {needsBody ? (
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Request body (JSON)
              </label>
              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={8}
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-[11px] font-mono text-text-primary outline-none focus:border-primary-base/40"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </ModalShell>
  );
}
