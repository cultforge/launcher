import { useEffect, useState } from "react";
import {
  fetchDiscoverableGuilds,
  type DiscoverGuildCard,
} from "../../lib/cultApi";
import { useGuildStore } from "../../stores/guilds";
import { logger } from "../../lib/logger";
import { GuildIcon } from "../GuildIcon";
import { handleContentHref } from "../../lib/deepLinks";

export function GuildDiscoverPanel() {
  const setDiscoverOpen = useGuildStore((s) => s.setDiscoverOpen);
  const setActiveGuild = useGuildStore((s) => s.setActiveGuild);
  const catalogRevision = useGuildStore((s) => s.guildCatalogRevision);
  const [items, setItems] = useState<DiscoverGuildCard[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchDiscoverableGuilds()
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(`Guild discover failed: ${message}`);
        setError(message);
        setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [catalogRevision]);

  const filtered = items.filter((g) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      g.name.toLowerCase().includes(q) ||
      (g.description ?? "").toLowerCase().includes(q) ||
      (g.tags ?? []).some((t) => t.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => setDiscoverOpen(false)}
            className="text-[10px] uppercase tracking-wider text-primary-base font-semibold cursor-pointer mb-1"
          >
            ← Your guilds
          </button>
          <h2 className="font-sora text-[17px] font-bold text-text-primary">
            Discover guilds
          </h2>
          <p className="text-[11px] text-text-muted mt-0.5">
            Public communities from CultForge. Join via invite when listed.
          </p>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search guilds…"
          className="h-9 w-full max-w-xs rounded-lg border border-border-subtle bg-black/25 px-3 text-[12px] outline-none focus:border-primary-base/45"
        />
      </header>

      {error ? (
        <div className="cf-panel rounded-xl px-4 py-3 text-[12px] text-amber-200/90">
          {error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto scroll-hidden">
        {loading ? (
          <div className="cf-panel rounded-xl px-5 py-12 text-center text-[13px] text-text-muted">
            Loading public guilds…
          </div>
        ) : filtered.length === 0 ? (
          <div className="cf-panel rounded-xl px-5 py-12 text-center text-[13px] text-text-muted">
            No publicly listed guilds yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((g) => (
              <article
                key={g.id}
                className="cf-panel rounded-xl overflow-hidden flex flex-col"
              >
                <div className="relative aspect-16/6 bg-bg-elevated overflow-hidden">
                  {g.banner_url ? (
                    <img
                      src={g.banner_url}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-linear-to-br from-primary-base/20 to-black/60" />
                  )}
                </div>
                <div className="p-3.5 flex flex-col gap-2 flex-1">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <GuildIcon
                      src={g.icon_url}
                      name={g.name}
                      className="h-10 w-10 rounded-lg shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold text-text-primary truncate">
                        {g.name}
                      </div>
                      <div className="text-[10px] text-text-muted">
                        {g.member_count ?? 0} members
                        {g.is_featured ? " · Featured" : ""}
                      </div>
                    </div>
                  </div>
                  {g.description ? (
                    <p className="text-[11px] text-text-secondary line-clamp-3">
                      {g.description}
                    </p>
                  ) : null}
                  {g.tags && g.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {g.tags.slice(0, 4).map((t) => (
                        <span
                          key={t}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-text-muted"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-auto flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveGuild(g.id);
                        setDiscoverOpen(false);
                      }}
                      className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-semibold text-text-secondary cursor-pointer"
                    >
                      Preview
                    </button>
                    {g.deep_link ? (
                      <button
                        type="button"
                        onClick={() => handleContentHref(g.deep_link!)}
                        className="cf-btn-primary rounded-lg px-2.5 py-1.5 text-[10px] font-semibold cursor-pointer"
                      >
                        Open
                      </button>
                    ) : (
                      <span className="px-2.5 py-1.5 text-[10px] text-text-disabled">
                        Invite only
                      </span>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
