import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  formatDownloads,
  formatRelativeDate,
  getModrinthVersions,
  versionMatchesFilters,
  type ModrinthProject,
  type ModrinthVersion,
} from "../../lib/modrinth";
import type { BuildInstance } from "../../stores/build";
import { Icon } from "../ico";
import { AppIcons } from "../icons";
import { ThemeLogo } from "../ThemeLogo";
import { MarkdownBody } from "./MarkdownBody";
import { StoreInstallBar } from "./StoreInstallBar";
import { cn } from "../../lib/cn";

type DetailTab = "overview" | "about" | "versions" | "gallery";

const TABS: { id: DetailTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "about", label: "About" },
  { id: "versions", label: "Versions" },
  { id: "gallery", label: "Gallery" },
];

function SideChip({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  if (!value) return null;
  return (
    <span className="rounded-md border border-white/8 bg-white/[0.04] px-2 py-1 text-[10px] text-text-secondary">
      <span className="text-text-muted">{label}: </span>
      <span className="capitalize">{value}</span>
    </span>
  );
}

function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold text-primary-base hover:bg-primary-base/10"
    >
      {label}
    </a>
  );
}

export function StoreProjectDetail({
  project,
  loading,
  builds,
  selectedBuildId,
  onSelectedBuildChange,
  installing,
  onInstall,
  onClose,
}: {
  project: ModrinthProject | null;
  loading: boolean;
  builds: BuildInstance[];
  selectedBuildId: string;
  onSelectedBuildChange: (id: string) => void;
  installing: boolean;
  onInstall: (opts: {
    build: BuildInstance;
    versionId: string;
  }) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>("overview");
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [versions, setVersions] = useState<ModrinthVersion[]>([]);
  const [rawVersionCount, setRawVersionCount] = useState(0);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionId, setVersionId] = useState("");
  const [showAllVersions, setShowAllVersions] = useState(false);

  const selectedBuild = builds.find((b) => b.id === selectedBuildId) ?? null;
  const selectedVersion = versions.find((v) => v.id === versionId) ?? null;

  const gallery = useMemo(() => {
    if (!project?.gallery?.length)
      return [] as NonNullable<ModrinthProject["gallery"]>;
    return [...project.gallery].sort(
      (a, b) => (a.ordering ?? 0) - (b.ordering ?? 0),
    );
  }, [project]);

  useEffect(() => {
    setTab("overview");
    setGalleryIndex(0);
    setShowAllVersions(false);
    setVersionId("");
    setVersions([]);
    setRawVersionCount(0);
  }, [project?.id]);

  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    setVersionsLoading(true);
    const gameVersion = selectedBuild?.mc;
    const loader = selectedBuild?.loader;
    void (async () => {
      try {
        const list = showAllVersions
          ? await getModrinthVersions(project.id)
          : await getModrinthVersions(project.id, {
              gameVersions:
                gameVersion && gameVersion !== "—" ? [gameVersion] : undefined,
              loaders:
                loader &&
                loader !== "—" &&
                normalizeLoaderSafe(loader) !== "vanilla"
                  ? [loader]
                  : undefined,
            });
        if (cancelled) return;
        setRawVersionCount(list.length);
        const filtered = showAllVersions
          ? list
          : list.filter((v) =>
              versionMatchesFilters(
                v,
                gameVersion && gameVersion !== "—" ? gameVersion : undefined,
                loader && loader !== "—" ? loader : undefined,
              ),
            );
        const finalList = filtered.length ? filtered : list;
        setVersions(finalList);
        setVersionId((prev) =>
          finalList.some((v) => v.id === prev)
            ? prev
            : (finalList[0]?.id ?? ""),
        );
      } catch {
        if (!cancelled) {
          setVersions([]);
          setVersionId("");
          setRawVersionCount(0);
        }
      } finally {
        if (!cancelled) setVersionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    project?.id,
    selectedBuild?.id,
    selectedBuild?.mc,
    selectedBuild?.loader,
    showAllVersions,
  ]);

  const categories = useMemo(() => {
    if (!project) return [];
    return [
      ...project.categories,
      ...(project.additional_categories ?? []),
    ].filter((c, i, arr) => arr.indexOf(c) === i);
  }, [project]);

  const loaderMismatch =
    !showAllVersions &&
    !versionsLoading &&
    versions.length === 0 &&
    Boolean(selectedBuild) &&
    Boolean(project?.loaders?.length) &&
    selectedBuild?.loader &&
    selectedBuild.loader !== "—" &&
    !project!.loaders!.some(
      (l) =>
        normalizeLoaderSafe(l) === normalizeLoaderSafe(selectedBuild!.loader),
    );

  const disabledReason = (() => {
    if (!builds.length) {
      return "Create or select a local build with an install path first.";
    }
    if (!selectedBuild) return "Choose a build to install into.";
    if (!selectedBuild.location.trim()) {
      return "Selected build has no install location.";
    }
    if (selectedBuild.managed) {
      return "Guild-managed builds cannot receive Store installs.";
    }
    if (!versionsLoading && !versionId) {
      if (loaderMismatch) {
        return `No ${selectedBuild.loader} builds — this project supports ${project?.loaders?.join(", ") ?? "other loaders"}. Try another build or show all versions.`;
      }
      return "No compatible Modrinth version for this build.";
    }
    return null;
  })();

  if (loading && !project) {
    return (
      <aside className="flex h-full min-h-0 flex-col border-l border-white/8 bg-bg-card/80">
        <div className="flex flex-1 items-center justify-center text-[13px] text-text-muted">
          Loading project…
        </div>
      </aside>
    );
  }

  if (!project) return null;

  const featured =
    gallery.find((g) => g.featured)?.url ??
    gallery[galleryIndex]?.url ??
    gallery[0]?.url;

  const visibleTabs = TABS.filter((t) => {
    if (t.id === "about") return Boolean(project.body?.trim());
    if (t.id === "gallery") return gallery.length > 0;
    return true;
  });

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-white/8 bg-bg-card/90">
      {/* Compact header */}
      <div className="relative shrink-0 border-b border-white/8">
        <div className="relative h-28 overflow-hidden bg-black/40">
          {featured ? (
            <img
              src={gallery[galleryIndex]?.url ?? featured}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-70"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary-base/20 to-transparent" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-bg-card via-bg-card/40 to-transparent" />
          <button
            type="button"
            onClick={onClose}
            className="absolute right-2 top-2 cursor-pointer rounded-lg border border-white/15 bg-black/50 p-1.5 text-text-secondary hover:text-white"
            aria-label="Close detail"
          >
            <Icon icon={AppIcons.Close} size={16} />
          </button>
        </div>

        <div className="relative -mt-8 flex gap-3 px-3 pb-2">
          {project.icon_url ? (
            <img
              src={project.icon_url}
              alt=""
              className="h-14 w-14 shrink-0 rounded-lg border-2 border-bg-card object-cover bg-black/40 shadow-lg"
            />
          ) : (
            <div className="h-14 w-14 shrink-0 rounded-lg border-2 border-bg-card bg-black/40 p-2 shadow-lg">
              <ThemeLogo
                className="h-full w-full"
                glow={false}
                label="CultForge fallback artwork"
              />
            </div>
          )}
          <div className="min-w-0 flex-1 pt-8">
            <h3 className="truncate font-sora text-[16px] font-bold text-text-primary">
              {project.title}
            </h3>
            <p className="mt-0.5 truncate text-[11px] capitalize text-text-muted">
              {project.project_type}
              {" · "}
              {formatDownloads(project.downloads)} downloads
              {typeof project.followers === "number" &&
                ` · ${formatDownloads(project.followers)} follows`}
              {project.updated &&
                ` · Updated ${formatRelativeDate(project.updated)}`}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <nav
          className="flex gap-0.5 overflow-x-auto scroll-hidden px-2"
          aria-label="Project sections"
        >
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "cursor-pointer shrink-0 border-b-2 px-3 py-2 text-[11px] font-semibold transition-colors",
                tab === t.id
                  ? "border-primary-base text-text-primary"
                  : "border-transparent text-text-muted hover:text-text-secondary",
              )}
            >
              {t.label}
              {t.id === "versions" && !versionsLoading && versions.length > 0
                ? ` (${versions.length})`
                : ""}
              {t.id === "gallery" && gallery.length > 1
                ? ` (${gallery.length})`
                : ""}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab panels */}
      <div className="min-h-0 flex-1 overflow-y-auto scroll-hidden px-3 py-3">
        {tab === "overview" && (
          <div className="space-y-3">
            <p className="text-[12px] leading-relaxed text-text-secondary">
              {project.description}
            </p>

            <div className="flex flex-wrap gap-1.5">
              <SideChip label="Client" value={project.client_side} />
              <SideChip label="Server" value={project.server_side} />
              {project.license?.name || project.license?.id ? (
                <SideChip
                  label="License"
                  value={project.license.name || project.license.id}
                />
              ) : null}
            </div>

            {!!project.loaders?.length && (
              <MetaBlock label="Loaders">
                {project.loaders.map((l) => (
                  <span
                    key={l}
                    className="rounded bg-white/6 px-1.5 py-0.5 text-[10px] capitalize text-text-secondary"
                  >
                    {l}
                  </span>
                ))}
              </MetaBlock>
            )}

            {!!project.game_versions?.length && (
              <MetaBlock label="Game versions">
                {project.game_versions.slice(0, 16).map((v) => (
                  <span
                    key={v}
                    className="rounded bg-white/6 px-1.5 py-0.5 text-[10px] text-text-secondary"
                  >
                    {v}
                  </span>
                ))}
                {project.game_versions.length > 16 && (
                  <span className="text-[10px] text-text-muted">
                    +{project.game_versions.length - 16} more
                  </span>
                )}
              </MetaBlock>
            )}

            {categories.length > 0 && (
              <MetaBlock label="Categories">
                {categories.map((c) => (
                  <span
                    key={c}
                    className="rounded bg-black/30 px-2 py-0.5 text-[10px] capitalize text-text-muted"
                  >
                    {c}
                  </span>
                ))}
              </MetaBlock>
            )}

            <div className="flex flex-wrap gap-1.5 pt-1">
              <ExternalLink
                href={`https://modrinth.com/${project.project_type}/${project.slug}`}
                label="Modrinth"
              />
              {project.source_url && (
                <ExternalLink href={project.source_url} label="Source" />
              )}
              {project.issues_url && (
                <ExternalLink href={project.issues_url} label="Issues" />
              )}
              {project.wiki_url && (
                <ExternalLink href={project.wiki_url} label="Wiki" />
              )}
              {project.discord_url && (
                <ExternalLink href={project.discord_url} label="Discord" />
              )}
              {(project.donation_urls ?? []).map((d) => (
                <ExternalLink
                  key={d.id + d.url}
                  href={d.url}
                  label={d.platform || "Donate"}
                />
              ))}
            </div>

            {project.body?.trim() && (
              <button
                type="button"
                onClick={() => setTab("about")}
                className="w-full cursor-pointer rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2.5 text-left text-[11px] text-text-secondary hover:border-white/15 hover:bg-white/[0.05]"
              >
                Read full description on the About tab →
              </button>
            )}
          </div>
        )}

        {tab === "about" && project.body?.trim() && (
          <MarkdownBody source={project.body} />
        )}

        {tab === "versions" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-text-muted">
                {selectedBuild
                  ? showAllVersions
                    ? "Showing all Modrinth versions"
                    : `Filtered for ${selectedBuild.mc} / ${selectedBuild.loader}`
                  : "Select a build below to filter compatible versions"}
              </p>
              <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-text-muted">
                <input
                  type="checkbox"
                  checked={showAllVersions}
                  onChange={(e) => setShowAllVersions(e.target.checked)}
                  className="accent-[var(--color-primary-base,#7a2cff)]"
                />
                Show all
              </label>
            </div>

            {loaderMismatch && (
              <p className="rounded-lg border border-state-warning/30 bg-state-warning/10 px-2.5 py-2 text-[11px] text-state-warning">
                This project lists {project.loaders?.join(", ")} — your selected
                build uses {selectedBuild?.loader}. Turn on Show all or pick a
                matching build.
              </p>
            )}

            {versionsLoading ? (
              <p className="py-8 text-center text-[12px] text-text-muted">
                Loading versions…
              </p>
            ) : versions.length === 0 ? (
              <p className="py-8 text-center text-[12px] text-text-muted">
                No versions found
                {rawVersionCount === 0 ? "." : " for this filter."}
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {versions.map((v) => {
                  const compatible =
                    !selectedBuild ||
                    versionMatchesFilters(
                      v,
                      selectedBuild.mc !== "—"
                        ? selectedBuild.mc
                        : undefined,
                      selectedBuild.loader !== "—"
                        ? selectedBuild.loader
                        : undefined,
                    );
                  return (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => setVersionId(v.id)}
                        className={cn(
                          "w-full cursor-pointer rounded-lg border px-2.5 py-2.5 text-left transition-colors",
                          versionId === v.id
                            ? "border-primary-base/45 bg-primary-base/12"
                            : "border-white/8 hover:bg-white/[0.04]",
                          !compatible && showAllVersions && "opacity-55",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[12px] font-semibold text-text-primary">
                              {v.version_number}
                              {v.name !== v.version_number && (
                                <span className="ml-2 font-normal text-text-muted">
                                  {v.name}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 text-[10px] text-text-muted">
                              {v.game_versions.slice(0, 4).join(", ")}
                              {v.game_versions.length > 4
                                ? ` +${v.game_versions.length - 4}`
                                : ""}
                              {" · "}
                              {v.loaders.join(", ")}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                                (v.version_type ?? "release") === "release"
                                  ? "bg-emerald-500/15 text-emerald-300"
                                  : v.version_type === "beta"
                                    ? "bg-amber-500/15 text-amber-200"
                                    : "bg-white/8 text-text-muted",
                              )}
                            >
                              {v.version_type ?? "release"}
                            </span>
                            <div className="mt-1 text-[9px] text-text-muted">
                              {formatRelativeDate(v.date_published)}
                            </div>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {tab === "gallery" && (
          <div className="space-y-3">
            {gallery.length === 0 ? (
              <p className="py-8 text-center text-[12px] text-text-muted">
                No gallery images
              </p>
            ) : (
              <>
                <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
                  <img
                    src={gallery[galleryIndex]?.url}
                    alt={gallery[galleryIndex]?.title || ""}
                    className="max-h-[280px] w-full object-contain"
                  />
                </div>
                {(gallery[galleryIndex]?.title ||
                  gallery[galleryIndex]?.description) && (
                  <div>
                    {gallery[galleryIndex]?.title && (
                      <p className="text-[12px] font-semibold text-text-primary">
                        {gallery[galleryIndex].title}
                      </p>
                    )}
                    {gallery[galleryIndex]?.description && (
                      <p className="mt-0.5 text-[11px] text-text-muted">
                        {gallery[galleryIndex].description}
                      </p>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                  {gallery.map((img, i) => (
                    <button
                      key={img.url + i}
                      type="button"
                      onClick={() => setGalleryIndex(i)}
                      className={cn(
                        "aspect-video cursor-pointer overflow-hidden rounded-md border",
                        i === galleryIndex
                          ? "border-primary-base"
                          : "border-white/15 opacity-70 hover:opacity-100",
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
              </>
            )}
          </div>
        )}
      </div>

      <StoreInstallBar
        builds={builds}
        buildId={selectedBuildId}
        onBuildChange={onSelectedBuildChange}
        selectedVersion={selectedVersion}
        versionsLoading={versionsLoading}
        onOpenVersions={() => setTab("versions")}
        installing={installing}
        disabledReason={disabledReason}
        onInstall={() => {
          if (!selectedBuild || !versionId) return;
          onInstall({ build: selectedBuild, versionId });
        }}
      />
    </aside>
  );
}

function MetaBlock({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function normalizeLoaderSafe(loader: string): string {
  return loader.trim().toLowerCase().split(/\s+/)[0] ?? "";
}
