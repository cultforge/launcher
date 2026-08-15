import { DEMO_ACTIVITY } from "../../data/guilds";

export function ActivityFeedPanel() {
  return (
    <div className="flex flex-col gap-4">
      <header className="cf-panel rounded-xl px-4 py-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="font-sora text-[18px] font-bold text-text-primary">
            Activity Feed
          </h2>
          <p className="text-[12px] text-text-muted mt-1 max-w-lg">
            Cross-guild pulse — raids, ranks, joins, and announcements from every
            community you belong to.
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-sora font-bold text-primary-base tabular-nums">
            {DEMO_ACTIVITY.length}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-text-muted">
            recent
          </div>
        </div>
      </header>

      <div className="cf-panel rounded-xl p-2 flex flex-col gap-1">
        {DEMO_ACTIVITY.length === 0 ? (
          <div className="px-3 py-10 text-center text-[13px] text-text-muted">
            No activity yet.
          </div>
        ) : (
          DEMO_ACTIVITY.map((a, i) => (
            <div
              key={a.id}
              className="flex items-start gap-3 px-3 py-3 rounded-xl hover:bg-bg-elevated transition-colors"
            >
              <div className="flex flex-col items-center pt-1.5">
                <span className="h-2 w-2 rounded-full bg-primary-base shrink-0" />
                {i < DEMO_ACTIVITY.length - 1 && (
                  <span className="w-px flex-1 min-h-5 bg-white/6 mt-1" />
                )}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <p className="text-[13px] text-text-primary leading-snug">
                  {a.text}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  {a.guildTag && (
                    <span className="text-[10px] font-mono text-primary-base px-1.5 py-0.5 rounded border border-primary-base/25 bg-primary-base/8">
                      [{a.guildTag}]
                    </span>
                  )}
                  <span className="text-[10px] text-text-disabled">{a.when}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
