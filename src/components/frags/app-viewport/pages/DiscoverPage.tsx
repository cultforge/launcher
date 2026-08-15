import { useEffect, useMemo, useState } from "react";
import { Chip } from "@heroui/react";
import { useDiscoverStore } from "../../../../stores/discover";
import { DISCOVER_FILTERS, filterNews, type NewsStory } from "../../../../data/news";
import { cn } from "../../../../lib/cn";
import {
  BorderGlow,
  useThemeBorderGlow,
} from "../../../magic/border-glow";
import { RichMarkdown } from "../../../RichMarkdown";
import { handleContentHref } from "../../../../lib/deepLinks";
import { GuildIcon } from "../../../GuildIcon";
import type { DiscoverGuildCard } from "../../../../lib/cultApi";

function StoryDetail({
  story,
  onClose,
}: {
  story: NewsStory;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[min(80vh,640px)] cf-panel rounded-2xl overflow-hidden border border-white/10 flex flex-col">
        <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-black/40 border-b border-white/8">
          <div className="min-w-0 pr-4">
            <p className="text-[9px] uppercase tracking-wider text-primary-base font-semibold">
              {story.category}
              {story.guildName ? ` · ${story.guildName}` : ""}
            </p>
            <h2 className="font-sora text-[14px] font-semibold text-text-primary truncate">
              {story.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] uppercase tracking-wide text-text-muted hover:text-white cursor-pointer shrink-0"
          >
            Close
          </button>
        </div>
        {story.coverUrl ? (
          <div
            className="h-36 shrink-0 border-b border-white/6"
            style={{
              background: `center / cover no-repeat url("${story.coverUrl.replace(/"/g, '\\"')}")`,
            }}
          />
        ) : null}
        <div className="flex-1 min-h-0 overflow-y-auto scroll-hidden p-5 flex flex-col gap-3">
          {story.dek ? (
            <p className="text-[13px] text-text-secondary leading-relaxed">
              {story.dek}
            </p>
          ) : null}
          {story.bodyPreview ? (
            <div className="text-[13px] text-text-primary leading-relaxed">
              <RichMarkdown source={story.bodyPreview} />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-2">
            {story.deepLink ? (
              <button
                type="button"
                className="px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-primary-base/40 bg-primary-base/12 text-primary-base cursor-pointer"
                onClick={() => handleContentHref(story.deepLink!)}
              >
                Open in CultForge
              </button>
            ) : null}
            {story.shareUrl ? (
              <a
                href={story.shareUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-white/10 text-text-muted hover:text-text-primary"
              >
                Share link
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function GuildStrip({ guilds }: { guilds: DiscoverGuildCard[] }) {
  if (!guilds.length) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[9px] font-semibold uppercase tracking-[0.16em] text-text-muted px-0.5">
        Featured guilds
      </h3>
      <div className="flex gap-2 overflow-x-auto scroll-hidden pb-1">
        {guilds.map((g) => (
          <button
            key={g.id}
            type="button"
            title={g.description ?? g.name}
            onClick={() => {
              if (g.deep_link) handleContentHref(g.deep_link);
            }}
            className="cf-panel shrink-0 w-44 rounded-xl p-3 flex flex-col gap-2 text-left cursor-pointer hover:bg-bg-elevated transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <GuildIcon
                name={g.name}
                src={g.icon_url}
                className="shrink-0 size-9 rounded-lg"
              />
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-text-primary truncate">
                  {g.name}
                </div>
                <div className="text-[10px] text-text-muted truncate">
                  {g.member_count ?? 0} members
                  {g.is_featured ? " · Featured" : ""}
                </div>
              </div>
            </div>
            {g.tags && g.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {g.tags.slice(0, 3).map((t) => (
                  <span
                    key={t}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-text-muted"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );
}

function DiscoverPage() {
  const category = useDiscoverStore((s) => s.category);
  const setCategory = useDiscoverStore((s) => s.setCategory);
  const stories = useDiscoverStore((s) => s.stories);
  const guilds = useDiscoverStore((s) => s.guilds);
  const loading = useDiscoverStore((s) => s.loading);
  const error = useDiscoverStore((s) => s.error);
  const refresh = useDiscoverStore((s) => s.refresh);
  const [story, setStory] = useState<NewsStory | null>(null);
  const themeBorderGlow = useThemeBorderGlow();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(
    () => filterNews(stories, category),
    [stories, category],
  );

  const hero = filtered[0] ?? null;
  const featured = filtered.slice(1, 3);
  const feed = filtered.slice(3);

  return (
    <div className="h-full overflow-y-auto scroll-hidden p-4 pb-24 flex flex-col gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-sora text-[17px] font-bold text-text-primary">
            Discover
          </h2>
          <p className="text-[11px] text-text-muted mt-0.5">
            Launcher news, guild notes, and featured communities
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
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
          <button
            type="button"
            onClick={() => void refresh({ force: true })}
            disabled={loading}
            className="px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-white/8 text-text-muted hover:text-text-primary cursor-pointer disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {error ? (
        <div className="cf-panel rounded-xl px-4 py-3 text-[12px] text-amber-200/90">
          {error}
        </div>
      ) : null}

      <GuildStrip guilds={guilds} />

      {hero ? (
        <div className="relative shrink-0 overflow-x-clip overflow-y-visible">
          <BorderGlow
            {...themeBorderGlow}
            className="min-h-55 h-57.5 w-full max-w-full"
          >
            <button
              type="button"
              onClick={() => setStory(hero)}
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
                    {hero.isPinned ? " · Pinned" : ""}
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
                    {hero.date}
                    {hero.readMin ? ` · ${hero.readMin} min` : ""}
                  </span>
                  <span className="text-[11px] font-semibold text-primary-base">
                    Read →
                  </span>
                </div>
              </div>
            </button>
          </BorderGlow>
        </div>
      ) : (
        <div className="cf-panel rounded-xl px-5 py-10 text-center text-[13px] text-text-muted">
          {loading
            ? "Loading Discover…"
            : "No stories in this category yet."}
        </div>
      )}

      {featured.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {featured.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setStory(n)}
              className="cf-panel rounded-xl overflow-hidden text-left cursor-pointer group flex flex-col"
            >
              <div className="h-25 relative" style={{ background: n.thumb }}>
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
                onClick={() => setStory(n)}
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
              </button>
            ))}
          </div>
        </section>
      )}

      {story ? (
        <StoryDetail story={story} onClose={() => setStory(null)} />
      ) : null}
    </div>
  );
}

export default DiscoverPage;
