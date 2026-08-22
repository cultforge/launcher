import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  formatDownloads,
  formatRelativeDate,
  getModrinthProject,
  getModrinthVersions,
  type ModrinthProject,
  type ModrinthVersion,
} from "../../../lib/modrinth";
import { cn } from "../../../lib/cn";
import { Icon } from "../../ico";
import { AppIcons } from "../../icons";
import { MarkdownBody } from "../../store/MarkdownBody";
import { guildPrimaryBtnClass } from "../guildFormStyles";

function modrinthWebUrl(project: ModrinthProject): string {
  const type = project.project_type || "mod";
  return `https://modrinth.com/${type}/${project.slug}`;
}

async function openExternal(url: string) {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

type Props = {
  open: boolean;
  projectIdOrSlug: string | null;
  gameVersion?: string;
  loader?: string;
  onClose: () => void;
};

export function ModrinthPreviewModal({
  open,
  projectIdOrSlug,
  gameVersion,
  loader,
  onClose,
}: Props) {
  const [project, setProject] = useState<ModrinthProject | null>(null);
  const [versions, setVersions] = useState<ModrinthVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

  useEffect(() => {
    if (!open || !projectIdOrSlug) {
      setProject(null);
      setVersions([]);
      setGalleryIndex(0);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const next = await getModrinthProject(projectIdOrSlug);
        if (cancelled) return;
        setProject(next);
        const vers = await getModrinthVersions(next.id, {
          gameVersions: gameVersion ? [gameVersion] : undefined,
          loaders: loader ? [loader] : undefined,
        });
        if (!cancelled) setVersions(vers.slice(0, 8));
      } catch {
        if (!cancelled) setProject(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectIdOrSlug, gameVersion, loader]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const gallery = useMemo(() => {
    if (!project?.gallery?.length) return [];
    return [...project.gallery].sort(
      (a, b) => (a.ordering ?? 0) - (b.ordering ?? 0),
    );
  }, [project]);

  if (!open) return null;

  return createPortal(
    <div className="guild-preview-overlay fixed inset-0 z-[460] flex flex-col bg-bg-app">
      <header className="cf-fullscreen-header shrink-0">
        <div className="min-w-0 flex-1 flex items-start gap-3">
          {project?.icon_url ? (
            <img
              src={project.icon_url}
              alt=""
              className="h-12 w-12 shrink-0 rounded-xl object-cover"
            />
          ) : (
            <span className="h-12 w-12 shrink-0 rounded-xl bg-bg-elevated" />
          )}
          <div className="min-w-0">
            <h1 className="truncate font-sora text-[20px] font-bold text-text-primary">
              {loading ? "Loading…" : (project?.title ?? "Modrinth project")}
            </h1>
            {project?.description ? (
              <p className="mt-1 line-clamp-2 max-w-2xl text-[13px] text-text-muted">
                {project.description}
              </p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-white/10 text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary"
        >
          <Icon icon={AppIcons.Close} size={18} />
        </button>
      </header>

      <main className="cf-fullscreen-body min-h-0 flex-1 overflow-y-auto scroll-hidden">
        <div className="guild-modal-form mx-auto max-w-2xl px-6 py-6 pb-10">
          {loading ? (
            <p className="py-12 text-center text-[13px] text-text-muted">
              Fetching from Modrinth…
            </p>
          ) : !project ? (
            <p className="py-12 text-center text-[13px] text-text-muted">
              Could not load this project.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-white/6 px-3 py-1 text-[12px] text-text-secondary">
                  {formatDownloads(project.downloads)} downloads
                </span>
                {project.updated ? (
                  <span className="rounded-full bg-white/6 px-3 py-1 text-[12px] text-text-muted">
                    Updated {formatRelativeDate(project.updated)}
                  </span>
                ) : null}
                {gameVersion ? (
                  <span className="rounded-full bg-primary-base/12 px-3 py-1 text-[12px] text-primary-base">
                    {gameVersion}
                    {loader ? ` · ${loader}` : ""}
                  </span>
                ) : null}
              </div>

              {gallery.length > 0 ? (
                <div className="mt-5 overflow-hidden rounded-xl border border-border-subtle">
                  <img
                    src={gallery[galleryIndex]?.url}
                    alt=""
                    className="aspect-video w-full object-cover"
                  />
                  {gallery.length > 1 ? (
                    <div className="flex gap-1.5 overflow-x-auto p-2">
                      {gallery.map((img, i) => (
                        <button
                          key={img.url}
                          type="button"
                          onClick={() => setGalleryIndex(i)}
                          className={cn(
                            "h-14 w-24 shrink-0 overflow-hidden rounded-lg border cursor-pointer",
                            i === galleryIndex
                              ? "border-primary-base/50"
                              : "border-white/10 opacity-70 hover:opacity-100",
                          )}
                        >
                          <img
                            src={img.url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {versions.length > 0 ? (
                <div className="mt-5 rounded-xl border border-border-subtle bg-black/15 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                    Compatible versions
                  </p>
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {versions.map((v) => (
                      <li
                        key={v.id}
                        className="rounded-lg border border-white/8 bg-bg-app/40 px-3 py-2 text-[12px] text-text-secondary"
                      >
                        <span className="font-medium text-text-primary">
                          {v.version_number}
                        </span>
                        <span className="ml-2 text-[11px] text-text-muted">
                          {v.game_versions.slice(0, 3).join(", ")}
                          {v.loaders.length
                            ? ` · ${v.loaders.join(", ")}`
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {project.body?.trim() ? (
                <div className="mt-5 border-t border-white/8 pt-5">
                  <MarkdownBody source={project.body} />
                </div>
              ) : null}
            </>
          )}
        </div>
      </main>

      {project ? (
        <footer className="cf-fullscreen-footer shrink-0 border-t border-white/8 bg-bg-app/95 px-6 py-4 backdrop-blur-sm">
          <div className="mx-auto flex max-w-2xl justify-end">
            <button
              type="button"
              onClick={() => void openExternal(modrinthWebUrl(project))}
              className={guildPrimaryBtnClass}
            >
              Open on Modrinth
            </button>
          </div>
        </footer>
      ) : null}
    </div>,
    document.body,
  );
}
