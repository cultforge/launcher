import { useEffect } from "react";
import { Chip } from "@heroui/react";
import { useGuildStore } from "../../../stores/guilds";
import { useGuildModalsStore } from "../../../stores/guildModals";
import { useAppStore } from "../../../userstore";
import {
  capabilitiesForRole,
  membershipForUser,
} from "../../../lib/guildPermissions";
import { toast } from "sonner";
import { CoverImage } from "../../CoverImage";
import { ContentLinks, RichMarkdown } from "../../RichMarkdown";
import { handleContentHref } from "../../../lib/deepLinks";

export function NewsPanel() {
  const guildId = useGuildStore((s) => s.activeGuildId);
  const news = useGuildStore((s) => s.news);
  const members = useGuildStore((s) => s.members);
  const focusNewsId = useGuildStore((s) => s.focusNewsId);
  const focusNews = useGuildStore((s) => s.focusNews);
  const clearContentFocus = useGuildStore((s) => s.clearContentFocus);
  const togglePinned = useGuildStore((s) => s.togglePinnedNews);
  const userId = useAppStore((s) => s.currentUser?.id ?? "");
  const openModal = useGuildModalsStore((s) => s.open);
  const capabilities = capabilitiesForRole(
    membershipForUser(members, guildId, userId)?.role,
  );
  const items = news.filter((item) => item.guildId === guildId);
  const focused = focusNewsId
    ? items.find((item) => item.id === focusNewsId)
    : null;
  const pinned = items.filter((n) => n.pinned && n.id !== focused?.id);
  const rest = items.filter((n) => !n.pinned && n.id !== focused?.id);

  useEffect(() => {
    if (focusNewsId && !items.some((item) => item.id === focusNewsId)) {
      // Keep focus until hydrate arrives; no-op.
    }
  }, [focusNewsId, items]);

  if (focused) {
    return (
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => clearContentFocus()}
          className="self-start text-[11px] text-text-muted hover:text-text-primary cursor-pointer"
        >
          ← All news
        </button>
        <article className="cf-panel overflow-hidden rounded-xl">
          {focused.coverUrl ? (
            <CoverImage
              src={focused.coverUrl}
              alt=""
              className="max-h-56 border-b border-white/8"
            />
          ) : null}
          <div className="flex flex-col gap-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              {focused.pinned ? (
                <Chip size="sm" variant="soft" color="success">
                  <Chip.Label className="text-[9px] text-primary-base">
                    Pinned
                  </Chip.Label>
                </Chip>
              ) : null}
              <span className="text-[10px] text-text-disabled">
                {focused.when}
              </span>
              {capabilities.manageNews && (
                <button
                  type="button"
                  onClick={() => openModal("announcement", focused.id)}
                  className="ml-auto text-[10px] text-text-muted hover:text-text-primary cursor-pointer"
                >
                  Edit
                </button>
              )}
            </div>
            <h2 className="font-sora text-[20px] font-bold text-text-primary">
              {focused.title}
            </h2>
            {focused.tagline ? (
              <p className="text-[13px] text-text-muted">{focused.tagline}</p>
            ) : null}
            <RichMarkdown
              source={focused.body}
              format={focused.bodyFormat ?? "markdown"}
            />
            <ContentLinks links={focused.links} />
            {focused.deepLink ? (
              <button
                type="button"
                onClick={() => handleContentHref(focused.deepLink)}
                className="self-start text-[10px] text-text-disabled hover:text-primary-base cursor-pointer"
              >
                {focused.deepLink}
              </button>
            ) : null}
          </div>
        </article>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-text-muted">
          Rich guild announcements with markdown and deep links
        </p>
        {capabilities.manageNews && (
          <button
            type="button"
            onClick={() => openModal("announcement")}
            className="px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-white/10 text-text-secondary hover:text-text-primary cursor-pointer"
          >
            Post announcement
          </button>
        )}
      </div>

      {pinned.map((n) => (
        <article
          key={n.id}
          className="cf-panel overflow-hidden rounded-xl border border-primary-base/20"
        >
          {n.coverUrl ? (
            <CoverImage
              src={n.coverUrl}
              alt=""
              className="max-h-40 border-b border-white/8"
            />
          ) : null}
          <div className="flex flex-col gap-1.5 p-4">
            <div className="flex items-center gap-2">
              <Chip size="sm" variant="soft" color="success">
                <Chip.Label className="text-[9px] text-primary-base">
                  Pinned
                </Chip.Label>
              </Chip>
              <span className="text-[10px] text-text-disabled">{n.when}</span>
              {capabilities.manageNews && (
                <>
                  <button
                    type="button"
                    onClick={() => openModal("announcement", n.id)}
                    className="ml-auto text-[8px] text-text-muted hover:text-text-primary cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void togglePinned(guildId, n.id).then((result) => {
                        result.ok
                          ? toast.success(result.message)
                          : toast.error(result.message);
                      });
                    }}
                    className="text-[8px] text-text-muted hover:text-text-primary cursor-pointer"
                  >
                    Unpin
                  </button>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => focusNews(n.id)}
              className="text-left cursor-pointer"
            >
              <h3 className="text-[15px] font-sora font-bold text-text-primary">
                {n.title}
              </h3>
              {n.tagline ? (
                <p className="mt-0.5 text-[12px] text-text-muted">{n.tagline}</p>
              ) : null}
            </button>
            <div className="line-clamp-4">
              <RichMarkdown
                source={n.body}
                format={n.bodyFormat ?? "markdown"}
              />
            </div>
            <ContentLinks links={n.links} />
          </div>
        </article>
      ))}

      <div className="cf-panel rounded-xl p-1.5 flex flex-col gap-0.5">
        {rest.length === 0 && pinned.length === 0 ? (
          <div className="px-3 py-8 text-center text-[13px] text-text-muted">
            No news yet
          </div>
        ) : (
          rest.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => focusNews(n.id)}
              className="flex gap-3 px-3 py-3 rounded-lg hover:bg-bg-elevated text-left cursor-pointer"
            >
              {n.coverUrl ? (
                <CoverImage
                  src={n.coverUrl}
                  alt=""
                  className="h-14 w-20 shrink-0 rounded-md"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="text-[13px] font-medium text-text-primary truncate">
                    {n.title}
                  </h4>
                  <span className="text-[10px] text-text-disabled shrink-0">
                    {n.when}
                  </span>
                </div>
                {n.tagline ? (
                  <p className="text-[12px] text-text-muted mt-0.5 line-clamp-1">
                    {n.tagline}
                  </p>
                ) : (
                  <p className="text-[12px] text-text-muted mt-0.5 line-clamp-2">
                    {n.body}
                  </p>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
