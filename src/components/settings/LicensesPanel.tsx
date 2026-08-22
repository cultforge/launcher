import { useEffect, useState } from "react";
import { RichMarkdown } from "../RichMarkdown";

type Props = {
  /** Prefer markdown; falls back to plain text. */
  preferMarkdown?: boolean;
};

export function LicensesPanel({ preferMarkdown = true }: Props) {
  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"md" | "txt">(preferMarkdown ? "md" : "txt");

  useEffect(() => {
    let cancelled = false;
    const path = mode === "md" ? "/licenses.md" : "/licenses.txt";
    void fetch(path)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) {
          setBody(text);
          setError(null);
        }
      })
      .catch(async (err) => {
        if (cancelled) return;
        if (mode === "md") {
          setMode("txt");
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
        setBody(null);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-sora text-[15px] font-bold text-text-primary">
            Licenses & legal
          </h3>
          <p className="text-[11px] text-text-muted mt-0.5">
            EULA, Terms, Privacy, and open-source notices for this launcher
            build.
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setMode("md")}
            className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold cursor-pointer ${
              mode === "md"
                ? "border-primary-base/40 bg-primary-base/12 text-primary-base"
                : "border-white/10 text-text-muted"
            }`}
          >
            Markdown
          </button>
          <button
            type="button"
            onClick={() => setMode("txt")}
            className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold cursor-pointer ${
              mode === "txt"
                ? "border-primary-base/40 bg-primary-base/12 text-primary-base"
                : "border-white/10 text-text-muted"
            }`}
          >
            Plain text
          </button>
        </div>
      </div>

      {error ? (
        <div className="cf-panel rounded-xl px-4 py-3 text-[12px] text-amber-200/90">
          {error}
        </div>
      ) : null}

      <div className="cf-panel rounded-xl p-4 max-h-[min(70vh,640px)] overflow-y-auto scroll-hidden">
        {!body ? (
          <p className="text-[12px] text-text-muted">Loading licenses…</p>
        ) : mode === "md" ? (
          <div className="text-[12px] text-text-secondary leading-relaxed prose-invert">
            <RichMarkdown source={body} />
          </div>
        ) : (
          <pre className="whitespace-pre-wrap font-mono text-[11px] text-text-secondary leading-relaxed">
            {body}
          </pre>
        )}
      </div>
    </div>
  );
}
