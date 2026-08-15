import { useEffect, useState } from "react";
import { useBuildStore } from "../../../stores/build";
import { MarkdownBody } from "../../store/MarkdownBody";
import { cn } from "../../../lib/cn";

export function NotesPanel() {
  const active = useBuildStore((s) => s.active());
  const setNotes = useBuildStore((s) => s.setNotes);
  const [draft, setDraft] = useState(active.notes);
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  useEffect(() => {
    setDraft(active.notes);
  }, [active.id, active.notes]);

  const commit = () => {
    if (draft !== active.notes) setNotes(active.id, draft);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3 px-0.5">
        <div>
          <h3 className="font-sora text-[15px] font-bold text-text-primary">
            Build notes
          </h3>
          <p className="text-[11px] text-text-muted mt-0.5">
            Private to this build. Markdown supported. Not synced.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-white/10 overflow-hidden">
            <button
              type="button"
              onClick={() => setMode("edit")}
              className={cn(
                "px-2.5 py-1 text-[10px] font-semibold cursor-pointer",
                mode === "edit"
                  ? "bg-primary-base/15 text-primary-base"
                  : "text-text-muted hover:text-text-primary",
              )}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                commit();
                setMode("preview");
              }}
              className={cn(
                "px-2.5 py-1 text-[10px] font-semibold cursor-pointer",
                mode === "preview"
                  ? "bg-primary-base/15 text-primary-base"
                  : "text-text-muted hover:text-text-primary",
              )}
            >
              Preview
            </button>
          </div>
          <span className="text-[10px] text-text-disabled">Autosaves on blur</span>
        </div>
      </div>

      {mode === "edit" ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          placeholder="Notes, reminders, pack quirks… Markdown OK."
          rows={14}
          className="cf-panel w-full rounded-xl px-4 py-3 text-[13px] leading-relaxed text-text-primary placeholder:text-text-disabled outline-none border border-transparent focus:border-primary-base/30 resize-y min-h-70"
        />
      ) : (
        <div className="cf-panel w-full rounded-xl px-4 py-3 min-h-70">
          {draft.trim() ? (
            <MarkdownBody source={draft} />
          ) : (
            <p className="text-[13px] text-text-muted">Nothing to preview.</p>
          )}
        </div>
      )}
    </div>
  );
}
