import { useMemo, useState } from "react";
import { DEMO_FORUMS } from "../../data/guilds";
import { cn } from "../../lib/cn";

const CATEGORIES = [
  "All",
  "Announcements",
  "Builds",
  "Raids",
  "Looking for",
  "Off-topic",
];

export function ForumsPanel() {
  const [category, setCategory] = useState("All");
  const [openId, setOpenId] = useState<string | null>(DEMO_FORUMS[0]?.id ?? null);

  const threads = useMemo(() => {
    if (category === "All") return DEMO_FORUMS;
    return DEMO_FORUMS.filter((t) => t.category === category);
  }, [category]);

  const open =
    threads.find((t) => t.id === openId) ??
    DEMO_FORUMS.find((t) => t.id === openId);

  return (
    <div className="flex flex-col gap-4">
      <header className="cf-panel rounded-xl px-4 py-4">
        <h2 className="font-sora text-[18px] font-bold text-text-primary">
          Forums
        </h2>
        <p className="text-[12px] text-text-muted mt-1 max-w-lg">
          Browse community threads — announcements, builds, raids, and LFG.
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              setCategory(c);
            }}
            className={cn(
              "px-3 py-1.5 text-[11px] font-semibold rounded-lg border cursor-pointer",
              category === c
                ? "border-primary-base/40 bg-primary-base/12 text-primary-base"
                : "border-white/8 text-text-muted hover:text-text-primary",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-80">
        <div className="lg:col-span-5 cf-panel rounded-xl p-2 flex flex-col gap-0.5">
          {threads.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setOpenId(t.id)}
              className={cn(
                "text-left px-3 py-3 rounded-xl cursor-pointer transition-colors",
                openId === t.id
                  ? "bg-primary-base/10 border border-primary-base/25"
                  : "hover:bg-bg-elevated border border-transparent",
              )}
            >
              <div className="text-[9px] text-text-muted uppercase tracking-[0.14em]">
                {t.category}
              </div>
              <div className="text-[13px] text-text-primary font-semibold mt-1 leading-snug">
                {t.title}
              </div>
              <div className="text-[10px] text-text-disabled mt-1.5">
                {t.replies} replies · {t.lastActive}
              </div>
            </button>
          ))}
        </div>

        <div className="lg:col-span-7 cf-panel rounded-xl p-5 flex flex-col gap-3">
          {open ? (
            <>
              <div className="text-[10px] text-primary-base uppercase tracking-[0.14em] font-semibold">
                {open.category}
              </div>
              <h3 className="font-sora text-[18px] font-bold text-text-primary leading-tight">
                {open.title}
              </h3>
              <div className="flex items-center gap-2 text-[11px] text-text-muted">
                <span>Started by {open.author}</span>
                <span className="opacity-30">·</span>
                <span>{open.replies} replies</span>
                <span className="opacity-30">·</span>
                <span>Last {open.lastActive}</span>
              </div>
              <div className="h-px bg-white/6" />
              <p className="text-[13px] text-text-secondary leading-relaxed flex-1">
                Thread content will load when guild forums are connected.
              </p>
              <button
                type="button"
                className="w-fit px-4 py-2 text-[11px] font-semibold rounded-lg border border-white/10 text-text-secondary hover:text-text-primary cursor-pointer"
              >
                Reply
              </button>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-[13px] text-text-muted">
              Select a thread
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
