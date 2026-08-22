import { useEffect, useState } from "react";
import { ModalShell } from "./ModalShell";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  onClose: () => void;
  onSubmit: (url: string) => void | Promise<void>;
};

export function ImportUrlModal({
  open,
  title,
  description = "Paste an https:// link from an allowlisted host (Modrinth, GitHub, CultForge).",
  confirmLabel = "Import",
  onClose,
  onSubmit,
}: Props) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setUrl("");
      setBusy(false);
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Enter a URL.");
      return;
    }
    if (!trimmed.startsWith("https://")) {
      setError("Only https:// URLs are allowed.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      open={open}
      title={title}
      onClose={busy ? () => undefined : onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="px-3 py-2 text-[11px] font-semibold rounded-lg border border-white/10 text-text-muted hover:text-text-primary cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="cf-btn-primary px-4 py-2 text-[11px] font-semibold uppercase tracking-wide rounded-lg cursor-pointer disabled:opacity-50"
          >
            {busy ? "Importing…" : confirmLabel}
          </button>
        </div>
      }
    >
      <p className="text-[12px] text-text-muted mb-3">{description}</p>
      <label className="flex flex-col gap-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
          URL
        </span>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder="https://"
          autoFocus
          disabled={busy}
          className="w-full px-3 py-2.5 rounded-xl text-[13px] bg-black/30 border border-white/10 text-text-primary placeholder:text-text-disabled outline-none focus:border-primary-base/40"
        />
      </label>
      {error ? (
        <p className="mt-2 text-[11px] text-state-error">{error}</p>
      ) : null}
    </ModalShell>
  );
}
