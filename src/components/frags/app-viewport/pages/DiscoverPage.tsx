import { useEffect, useMemo, useState } from "react";
import { Chip } from "@heroui/react";
import { useDiscoverStore } from "../../../../stores/discover";
import { useDiscoverBookmarksStore } from "../../../../stores/discoverBookmarks";
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
import { toast } from "sonner";
import {
  canJoinPersonalServer,
  discoverPublicPersonalServers,
  personalServerJoinAddress,
} from "../../../../lib/personalServersApi";
import type { UserPersonalServerRecord } from "../../../../types/catalog";
import { useAppStore } from "../../../../userstore";

function StoryCover({
  story,
  className,
}: {
  story: NewsStory;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (story.coverUrl && !failed) {
    return (
      <div className={cn("relative overflow-hidden bg-bg-elevated", className)}>
        <img
          src={story.coverUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }
  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ background: story.thumb }}
    />
  );
}

function BookmarkButton({ story }: { story: NewsStory }) {
  const has = useDiscoverBookmarksStore((s) => s.has(story.id));
  const toggle = useDiscoverBookmarksStore((s) => s.toggle);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        toggle(story);
        toast.success(has ? "Removed bookmark" : "Saved locally");
      }}
      className={cn(
        "rounded-md border px-2 py-1 text-[10px] font-semibold cursor-pointer",
        has
          ? "border-primary-base/40 bg-primary-base/12 text-primary-base"
          : "border-white/10 text-text-muted hover:text-text-primary",
      )}
    >
      {has ? "Saved" : "Save"}
    </button>
  );
}

function storyBodyMarkdown(story: NewsStory): string {
  const parts: string[] = [];
  const preview = story.bodyPreview?.trim();
  const dek = story.dek?.trim();
  if (preview) parts.push(preview);
  else if (dek) parts.push(dek);

  // Extra slide lines that aren't just repeating the title/dek.
  const seen = new Set(
    [story.title.trim().toLowerCase(), dek?.toLowerCase(), preview?.toLowerCase()].filter(
      Boolean,
    ) as string[],
  );
  for (const slide of story.slides ?? []) {
    const t = slide.trim();
    if (!t) continue;
    if (seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    parts.push(t);
  }
  return parts.join("\n\n") || "_No details for this story yet._";
}

function StoryDetail({
  story,
  onClose,
}: {
  story: NewsStory;
  onClose: () => void;
}) {
  const body = useMemo(() => storyBodyMarkdown(story), [story]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feed-story-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[min(85vh,720px)] cf-panel rounded-2xl overflow-hidden border border-white/10 flex flex-col bg-bg-elevated shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-start justify-between gap-3 px-4 py-3 bg-black/40 border-b border-white/8">
          <div className="min-w-0 flex-1">
            <p className="text-[9px] uppercase tracking-wider text-primary-base font-semibold">
              {story.category}
              {story.guildName ? ` · ${story.guildName}` : ""}
              {story.date ? ` · ${story.date}` : ""}
            </p>
            <h2
              id="feed-story-title"
              className="font-sora text-[15px] font-semibold text-text-primary leading-snug mt-0.5"
            >
              {story.title}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <BookmarkButton story={story} />
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-lg border border-white/10 px-2.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted hover:text-white cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
        {story.coverUrl ? (
          <StoryCover
            story={story}
            className="h-36 sm:h-44 shrink-0 border-b border-white/6"
          />
        ) : null}
        <div className="flex-1 min-h-0 overflow-y-auto scroll-hidden p-5 flex flex-col gap-4">
          {story.dek && story.dek !== story.bodyPreview ? (
            <p className="text-[13px] text-text-secondary leading-relaxed">
              {story.dek}
            </p>
          ) : null}
          <div className="text-[13px] text-text-primary leading-relaxed prose-invert max-w-none [&_p]:mb-3 [&_a]:text-primary-base">
            <RichMarkdown source={body} />
          </div>
          <div className="flex flex-wrap gap-2 pt-1 mt-auto">
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
                Open source
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

function PublicServersStrip() {
  const me = useAppStore((s) => s.currentUser);
  const [rows, setRows] = useState<UserPersonalServerRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void discoverPublicPersonalServers(24)
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || rows.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-disabled">
        Public personal servers
      </h3>
      <div className="flex gap-2 overflow-x-auto scroll-hidden pb-1">
        {rows.map((s) => {
          const join = personalServerJoinAddress(s);
          const gate = canJoinPersonalServer(s, {
            userId: me?.id,
            username: me?.name,
          });
          return (
            <button
              key={s.id}
              type="button"
              title={gate.ok ? undefined : gate.reason}
              onClick={() => {
                if (!gate.ok) {
                  toast.error(gate.reason || "Join policy blocks this server");
                  return;
                }
                void navigator.clipboard
                  .writeText(`${join.address}:${join.port}`)
                  .then(() => toast.success("Join address copied"))
                  .catch(() => toast.error("Could not copy"));
              }}
              className="cf-panel shrink-0 w-48 rounded-xl p-3 flex flex-col gap-1.5 text-left cursor-pointer hover:bg-bg-elevated transition-colors"
            >
              <div className="text-[12px] font-semibold text-text-primary truncate">
                {s.name}
              </div>
              <div className="text-[10px] text-text-muted truncate font-mono">
                {join.address}:{join.port}
              </div>
              <div className="text-[9px] text-text-disabled">
                {s.joinPolicy}
                {!gate.ok ? " · gated" : ""}
              </div>
            </button>
          );
        })}
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
  const bookmarks = useDiscoverBookmarksStore((s) => s.items);
  const [story, setStory] = useState<NewsStory | null>(null);
  const themeBorderGlow = useThemeBorderGlow();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    if (category === "Saved") return bookmarks;
    return filterNews(stories, category);
  }, [stories, category, bookmarks]);

  const hero = filtered[0] ?? null;
  const featured = filtered.slice(1, 3);
  const feed = filtered.slice(3);

  return (
    <div className="h-full overflow-y-auto scroll-hidden p-4 pb-24 flex flex-col gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-sora text-[17px] font-bold text-text-primary">
            Feed
          </h2>
          <p className="text-[11px] text-text-muted mt-0.5">
            Minecraft news from open networks, plus CultForge launcher stories
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
            disabled={loading || category === "Saved"}
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

      {category !== "Saved" ? <GuildStrip guilds={guilds} /> : null}
      {category !== "Saved" ? <PublicServersStrip /> : null}

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
              <StoryCover story={hero} className="absolute inset-0" />
              <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/45 to-black/20" />
              <div className="absolute inset-0 bg-linear-to-r from-black/50 via-transparent to-transparent" />
              <div className="relative z-10 h-full flex flex-col justify-end p-5 gap-2 max-w-3xl">
                <div className="flex items-center gap-2">
                  <Chip size="sm" variant="soft" color="default">
                    <Chip.Label className="text-[10px]">
                      {hero.category}
                      {hero.isPinned ? " · Pinned" : ""}
                    </Chip.Label>
                  </Chip>
                  <BookmarkButton story={hero} />
                </div>
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
            ? "Loading Feed…"
            : category === "Saved"
              ? "No saved stories yet. Bookmark one with Save."
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
              <StoryCover story={n} className="h-28 relative" />
              <div className="p-3.5 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] uppercase tracking-wider text-primary-base font-semibold">
                    {n.category}
                  </span>
                  <BookmarkButton story={n} />
                </div>
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
                <StoryCover
                  story={n}
                  className="w-20 h-14 rounded-lg shrink-0 border border-white/6"
                />
                <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] uppercase tracking-wider text-primary-base font-semibold">
                      {n.category}
                    </span>
                    <span className="text-[10px] text-text-disabled">
                      {n.date}
                    </span>
                    <span className="ml-auto">
                      <BookmarkButton story={n} />
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
