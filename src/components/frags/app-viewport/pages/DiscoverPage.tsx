import { useMemo, useState } from "react";
import { Chip } from "@heroui/react";
import { RevealStory } from "../../../news/RevealStory";
import {
  DISCOVER_FILTERS,
  NEWS_FEED,
  filterNews,
  type NewsStory,
} from "../../../../data/news";
import { useDiscoverStore } from "../../../../stores/discover";
import { cn } from "../../../../lib/cn";
import {
  BorderGlow,
  useThemeBorderGlow,
} from "../../../magic/border-glow";

function DiscoverPage() {
  const category = useDiscoverStore((s) => s.category);
  const setCategory = useDiscoverStore((s) => s.setCategory);
  const [story, setStory] = useState<NewsStory | null>(null);
  const themeBorderGlow = useThemeBorderGlow();

  const filtered = useMemo(
    () => filterNews(NEWS_FEED, category),
    [category],
  );

  const hero = filtered[0] ?? null;
  const featured = filtered.slice(1, 3);
  const feed = filtered.slice(3);

  const openStory = (n: NewsStory) => setStory(n);

  return (
    <div className="h-full overflow-y-auto scroll-hidden p-4 pb-24 flex flex-col gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-sora text-[17px] font-bold text-text-primary">
            Discover
          </h2>
          <p className="text-[11px] text-text-muted mt-0.5">
            Launcher news, community notes, pack briefings
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DISCOVER_FILTERS.map((f) => {
            const active = category === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setCategory(f)}
                className={cn(
                  "px-3 py-1.5 text-[11px] font-semibold rounded-lg border cursor-pointer transition-colors",
                  active
                    ? "border-primary-base/40 bg-primary-base/12 text-primary-base"
                    : "border-white/8 text-text-muted hover:text-text-primary hover:bg-white/3",
                )}
              >
                {f}
              </button>
            );
          })}
        </div>
      </header>

      {hero ? (
        <div className="relative shrink-0 overflow-x-clip overflow-y-visible">
          <BorderGlow
            {...themeBorderGlow}
            className="min-h-55 h-57.5 w-full max-w-full"
          >
            <button
              type="button"
              onClick={() => openStory(hero)}
              className="w-full h-full min-h-55 overflow-hidden text-left cursor-pointer group relative rounded-[inherit]"
            >
              <div
                className="absolute inset-0"
                style={{ background: hero.thumb }}
              />
              <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/45 to-black/20" />
              <div className="absolute inset-0 bg-linear-to-r from-black/50 via-transparent to-transparent" />
              <div className="relative z-10 h-full flex flex-col justify-end p-5 gap-2 max-w-3xl">
                <Chip size="sm" variant="soft" color="default">
                  <Chip.Label className="text-[10px]">
                    {hero.category}
                  </Chip.Label>
                </Chip>
                <h3 className="font-sora text-[22px] font-bold text-text-primary group-hover:text-white leading-snug">
                  {hero.title}
                </h3>
                <p className="text-[12px] text-text-secondary leading-relaxed line-clamp-2">
                  {hero.dek}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[10px] text-text-muted">
                    {hero.date} · {hero.readMin} min read
                  </span>
                  <span className="text-[11px] font-semibold text-primary-base">
                    Read story →
                  </span>
                </div>
              </div>
            </button>
          </BorderGlow>
        </div>
      ) : (
        <div className="cf-panel rounded-xl px-5 py-10 text-center text-[13px] text-text-muted">
          No stories in this category yet.
        </div>
      )}

      {featured.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {featured.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => openStory(n)}
              className="cf-panel rounded-xl overflow-hidden text-left cursor-pointer group flex flex-col"
            >
              <div
                className="h-25 relative"
                style={{ background: n.thumb }}
              >
                <div className="absolute inset-0 bg-linear-to-t from-black/50 to-transparent" />
              </div>
              <div className="p-3.5 flex flex-col gap-1.5">
                <span className="text-[9px] uppercase tracking-wider text-primary-base font-semibold">
                  {n.category}
                </span>
                <span className="text-[14px] font-sora font-bold text-text-primary group-hover:text-white leading-snug line-clamp-2">
                  {n.title}
                </span>
                <p className="text-[11px] text-text-muted line-clamp-2">
                  {n.dek}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {feed.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[9px] font-semibold uppercase tracking-[0.16em] text-text-muted px-0.5">
            More stories
          </h3>
          <div className="flex flex-col gap-2">
            {feed.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => openStory(n)}
                className="cf-panel rounded-xl px-3.5 py-3 flex gap-3 text-left cursor-pointer hover:bg-bg-elevated transition-colors"
              >
                <div
                  className="w-16 h-16 rounded-lg shrink-0 border border-white/6"
                  style={{ background: n.thumb }}
                />
                <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] uppercase tracking-wider text-primary-base font-semibold">
                      {n.category}
                    </span>
                    <span className="text-[10px] text-text-disabled">
                      {n.date}
                    </span>
                  </div>
                  <div className="text-[13px] font-semibold text-text-primary truncate">
                    {n.title}
                  </div>
                  <p className="text-[11px] text-text-muted line-clamp-1">
                    {n.dek}
                  </p>
                </div>
                <span className="text-[10px] text-text-disabled shrink-0 self-center">
                  {n.readMin} min
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <RevealStory
        open={!!story}
        title={story?.title ?? ""}
        slides={story?.slides ?? []}
        onClose={() => setStory(null)}
      />
    </div>
  );
}

export default DiscoverPage;
