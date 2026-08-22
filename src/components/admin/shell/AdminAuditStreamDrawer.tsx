import { useCallback, useEffect, useRef, useState } from "react";
import { AdminClient, extractAdminRows } from "../../../lib/adminClient";
import { appendLoopbackQuery, getClientOrigin } from "../../../lib/client";
import { OpsButton, OpsEmpty } from "../ui/ops";
import { useAdminRouteStore } from "../../../stores/adminRoute";
import { useAdminSessionStore } from "../../../stores/adminSession";

type AuditLine = {
  id: string;
  text: string;
  at: string;
};

function formatRow(row: Record<string, unknown>): AuditLine {
  const id = String(row.id ?? row.event_id ?? Date.now());
  const action = String(row.action ?? row.event_type ?? "event");
  const actor = String(row.actor_id ?? row.actor ?? "—");
  const target = String(row.target_id ?? row.target ?? "");
  const at = String(row.created_at ?? row.ts ?? row.occurred_at ?? "");
  return {
    id,
    at,
    text: `${action} · ${actor}${target ? ` → ${target}` : ""}`,
  };
}

function pushLines(
  setLines: React.Dispatch<React.SetStateAction<AuditLine[]>>,
  mapped: AuditLine[],
) {
  setLines((prev) => {
    const ids = new Set(prev.map((l) => l.id));
    const fresh = mapped.filter((m) => !ids.has(m.id));
    return [...fresh, ...prev].slice(0, 80);
  });
}

/**
 * Prefer SSE `/admin/audit/stream` when the sidecar exposes it;
 * otherwise poll `listAudit` every 8s.
 */
export function AdminAuditStreamDrawer() {
  const open = useAdminRouteStore((s) => s.streamOpen);
  const setOpen = useAdminRouteStore((s) => s.setStreamOpen);
  const capabilityActive = useAdminSessionStore((s) => s.capabilityActive);
  const [lines, setLines] = useState<AuditLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"sse" | "poll" | "idle">("idle");
  const afterId = useRef<string>("");
  const endRef = useRef<HTMLDivElement>(null);

  const pull = useCallback(async () => {
    try {
      const raw = await AdminClient.listAudit({
        limit: 20,
        ...(afterId.current ? { cursor: afterId.current } : {}),
      });
      const rows = extractAdminRows(raw);
      if (!rows.length) return;
      const mapped = rows.map(formatRow);
      const newest = mapped[0];
      if (newest) afterId.current = newest.id;
      pushLines(setLines, mapped);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stream failed");
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setMode("idle");
      return;
    }

    let cancelled = false;
    let pollId: number | undefined;
    let es: EventSource | null = null;
    let fallbackTimer: number | undefined;
    let usingSse = false;

    const startPoll = () => {
      if (cancelled || pollId != null) return;
      usingSse = false;
      setMode("poll");
      void pull();
      pollId = window.setInterval(() => void pull(), 8000);
    };

    void (async () => {
      try {
        const origin = await getClientOrigin();
        const url = await appendLoopbackQuery(
          `${origin.replace(/\/$/, "")}/admin/audit/stream`,
        );
        if (cancelled || typeof EventSource === "undefined") {
          startPoll();
          return;
        }
        es = new EventSource(url);
        es.onopen = () => {
          if (cancelled) return;
          usingSse = true;
          setMode("sse");
          setError(null);
        };
        es.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data) as unknown;
            const rows = Array.isArray(data) ? data : extractAdminRows(data);
            const objs = rows.filter(
              (r): r is Record<string, unknown> =>
                Boolean(r && typeof r === "object"),
            );
            if (objs.length) pushLines(setLines, objs.map(formatRow));
          } catch {
            /* ignore */
          }
        };
        es.onerror = () => {
          es?.close();
          es = null;
          if (!cancelled) startPoll();
        };
        fallbackTimer = window.setTimeout(() => {
          if (!cancelled && !usingSse) {
            es?.close();
            es = null;
            startPoll();
          }
        }, 2500);
      } catch {
        startPoll();
      }
    })();

    return () => {
      cancelled = true;
      es?.close();
      if (pollId) window.clearInterval(pollId);
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
    };
  }, [open, pull]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [lines]);

  if (!open) return null;

  const status =
    mode === "sse" ? "Live SSE" : mode === "poll" ? "Polling…" : "Connecting…";

  return (
    <aside className="flex w-full shrink-0 flex-col border-t border-white/10 bg-black/40 lg:w-auto lg:border-t-0 lg:border-l min-h-0">
      <div className="flex items-center justify-between gap-2 border-b border-white/8 px-3 py-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled">
            Live audit
          </div>
          <div className="text-[11px] text-text-muted">
            {status}
            {!capabilityActive ? " · reads only" : ""}
          </div>
        </div>
        <OpsButton onClick={() => setOpen(false)}>Close</OpsButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scroll-hidden p-2 font-mono text-[10px] leading-relaxed">
        {error ? (
          <p className="text-state-error px-1 py-2">{error}</p>
        ) : null}
        {!lines.length && !error ? (
          <OpsEmpty
            title="Waiting for events"
            hint="Actions you take will appear here."
          />
        ) : (
          lines.map((line) => (
            <div
              key={line.id}
              className="rounded px-1.5 py-1 hover:bg-white/4 text-text-secondary"
            >
              <span className="text-text-disabled">
                {line.at.slice(11, 19)}{" "}
              </span>
              {line.text}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </aside>
  );
}
