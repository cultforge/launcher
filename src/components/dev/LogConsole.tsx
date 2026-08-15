import { useEffect, useRef, useState } from "react";
import {
  useLauncherLogsStore,
  LOG_CAP,
  type LogEntry,
  type LogLevel,
} from "../../stores/launcherLogs";
import { useLogConsoleUiStore } from "../../stores/logConsoleUi";

const LEVEL_FILTERS: Array<"ALL" | LogLevel> = [
  "ALL",
  "DEBUG",
  "INFO",
  "SUCCESS",
  "WARNING",
  "ERROR",
  "CRITICAL",
  "EXCEPTION",
];

const LEVEL_TEXT: Record<LogLevel, string> = {
  DEBUG: "text-text-muted",
  INFO: "text-text-secondary",
  SUCCESS: "text-state-success",
  WARNING: "text-state-warning",
  ERROR: "text-state-error",
  CRITICAL: "text-state-error font-bold",
  EXCEPTION: "text-state-error",
};

const LEVEL_BADGE: Record<LogLevel, string> = {
  DEBUG: "border-white/[0.12] bg-white/[0.04] text-text-muted",
  INFO: "border-state-info/30 bg-state-info/10 text-state-info",
  SUCCESS: "border-state-success/30 bg-state-success/10 text-state-success",
  WARNING: "border-state-warning/30 bg-state-warning/10 text-state-warning",
  ERROR: "border-state-error/30 bg-state-error/10 text-state-error",
  CRITICAL: "border-state-error/60 bg-state-error/20 text-state-error font-bold",
  EXCEPTION: "border-state-error/40 bg-state-error/10 text-state-error",
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

function formatTs(ts: number) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

function LogRow({ entry }: { entry: LogEntry }) {
  return (
    <div className="flex items-start gap-2 px-3 py-0.75 hover:bg-white/3">
      <span className="shrink-0 tabular-nums text-[10px] leading-4.5 text-text-muted">
        {formatTs(entry.ts)}
      </span>
      <span
        className={`mt-0.5 shrink-0 rounded border px-1 py-0 text-[8px] font-semibold uppercase leading-3.25 tracking-wider ${LEVEL_BADGE[entry.level]}`}
      >
        {entry.level}
      </span>
      <span className="mt-0.5 shrink-0 rounded bg-white/5 px-1 text-[8px] uppercase leading-3.25 tracking-wider text-text-muted">
        {entry.source}
      </span>
      <span
        className={`min-w-0 whitespace-pre-wrap wrap-break-words text-[11px] leading-4.5 ${LEVEL_TEXT[entry.level]}`}
      >
        {entry.message}
        {entry.stack ? (
          <span className="mt-0.5 block whitespace-pre-wrap text-[10px] leading-3.75 text-text-muted">
            {entry.stack}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function LogConsole() {
  const open = useLogConsoleUiStore((state) => state.open);
  const toggle = useLogConsoleUiStore((state) => state.toggle);
  const setOpen = useLogConsoleUiStore((state) => state.setOpen);
  const entries = useLauncherLogsStore((state) => state.entries);
  const clear = useLauncherLogsStore((state) => state.clear);

  const [filter, setFilter] = useState<"ALL" | LogLevel>("ALL");
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === "l" &&
        e.altKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        !e.metaKey
      ) {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  const visible =
    filter === "ALL" ? entries : entries.filter((e) => e.level === filter);

  // Auto-scroll to the newest entry while the user is pinned to the end.
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [open, visible.length, filter]);

  if (!open) return null;

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-250 flex h-[46vh] min-h-65 flex-col border-t border-white/8 bg-black shadow-[0_-16px_48px_rgba(0,0,0,0.75)]">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/6 bg-[#050505] px-3 py-2">
        <span className="font-sora text-[12px] font-bold text-text-primary">
          Launcher logs
        </span>
        <span className="tabular-nums text-[10px] text-text-muted">
          {visible.length}
          {filter !== "ALL" ? ` / ${entries.length}` : ""} · cap {LOG_CAP}
        </span>
        <span className="text-[9px] uppercase tracking-wider text-text-muted">
          sources: ui / client
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          {LEVEL_FILTERS.map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setFilter(lvl)}
              className={`cursor-pointer rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider transition-colors ${
                filter === lvl
                  ? "border-white/35 bg-white/12 text-text-primary"
                  : "border-white/8 bg-transparent text-text-muted hover:text-text-secondary"
              }`}
            >
              {lvl === "ALL" ? "All" : lvl.charAt(0) + lvl.slice(1).toLowerCase()}
            </button>
          ))}
          <button
            type="button"
            onClick={clear}
            className="ml-1 cursor-pointer rounded border border-white/12 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-text-muted hover:text-white"
          >
            Clear
          </button>
          <button
            type="button"
            aria-label="Close log console"
            onClick={() => setOpen(false)}
            className="cursor-pointer rounded border border-white/12 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-text-muted hover:text-white"
          >
            Close
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-label="Launcher logs"
        className="min-h-0 flex-1 overflow-y-auto font-mono"
      >
        {visible.length === 0 ? (
          <div className="px-3 py-4 text-[11px] text-text-muted">
            No log entries{filter !== "ALL" ? ` for ${filter}` : ""} yet.
          </div>
        ) : (
          visible.map((entry) => <LogRow key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}
