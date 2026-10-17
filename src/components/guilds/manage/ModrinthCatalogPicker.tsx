import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getModrinthVersions,
  searchModrinth,
  type ModrinthHit,
  type ModrinthPickResult,
  type ModrinthVersion,
} from "../../../lib/modrinth";
import { cn } from "../../../lib/cn";
import { Icon } from "../../ico";
import { AppIcons } from "../../icons";
import { ModrinthPreviewModal } from "./ModrinthPreviewModal";
import { ModDependencyPanel } from "./ModDependencyPanel";

const fieldClass =
  "h-10 w-full rounded-xl border border-border-subtle bg-black/25 px-3.5 text-[13px] text-text-primary outline-none placeholder:text-text-disabled focus:border-primary-base/45";

export type ModrinthPickWithOptional = ModrinthPickResult & {
  optional?: boolean;
};

type PreviewTarget = {
  id: string;
  slug: string;
};

type Props = {
  label: string;
  projectType: "mod" | "resourcepack" | "shader" | "datapack";
  loader?: string;
  gameVersion?: string;
  selected: ModrinthPickWithOptional[];
  onChange: (next: ModrinthPickWithOptional[]) => void;
  allowOptionalToggle?: boolean;
  compact?: boolean;
  variant?: "stack" | "split";
};

function primaryUrl(version: ModrinthVersion): string {
  const file =
    version.files.find((f) => f.primary) ?? version.files[0] ?? null;
  return file?.url ?? "";
}

function SelectedRow({
  item,
  allowOptionalToggle,
  selected,
  onChange,
  onView,
  loader,
  gameVersion,
  projectType,
}: {
  item: ModrinthPickWithOptional;
  allowOptionalToggle: boolean;
  selected: ModrinthPickWithOptional[];
  onChange: (next: ModrinthPickWithOptional[]) => void;
  onView: () => void;
  loader?: string;
  gameVersion?: string;
  projectType: string;
}) {
  const [versions, setVersions] = useState<ModrinthVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingVersions(true);
    void getModrinthVersions(item.projectId || item.slug, {
      gameVersions: gameVersion ? [gameVersion] : undefined,
      loaders:
        projectType === "mod" && loader && loader !== "vanilla"
          ? [loader]
          : undefined,
    })
      .then((list) => {
        if (!cancelled) setVersions(list);
      })
      .catch(() => {
        if (!cancelled) setVersions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingVersions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item.projectId, item.slug, gameVersion, loader, projectType]);

  const applyVersion = (version: ModrinthVersion) => {
    const sourceUrl = primaryUrl(version);
    onChange(
      selected.map((s) =>
        s.projectId === item.projectId
          ? {
              ...s,
              version: version.version_number,
              versionId: version.id,
              sourceUrl: sourceUrl || s.sourceUrl,
            }
          : s,
      ),
    );
  };

  return (
    <li className="build-basket-item group flex flex-col gap-1.5 rounded-lg px-2 py-2 transition-colors hover:bg-white/4">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-medium text-text-primary">
            {item.name}
          </span>
          <span className="block truncate text-[10px] text-text-muted">
            {item.slug}
            {allowOptionalToggle && item.optional ? " · optional" : null}
          </span>
        </span>
        {allowOptionalToggle ? (
          <label className="flex shrink-0 items-center gap-1.5 text-[10px] text-text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={Boolean(item.optional)}
              onChange={(e) =>
                onChange(
                  selected.map((s) =>
                    s.projectId === item.projectId
                      ? { ...s, optional: e.target.checked }
                      : s,
                  ),
                )
              }
              className="accent-primary-base"
            />
            Opt.
          </label>
        ) : null}
        <button
          type="button"
          onClick={onView}
          className="shrink-0 rounded-md px-2 py-1 text-[10px] font-medium text-primary-base hover:bg-primary-base/10 cursor-pointer"
        >
          View
        </button>
        <button
          type="button"
          aria-label={`Remove ${item.name}`}
          className="shrink-0 rounded-md px-2 py-1 text-[10px] font-medium text-text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-state-error/10 hover:text-state-error cursor-pointer"
          onClick={() =>
            onChange(selected.filter((s) => s.projectId !== item.projectId))
          }
        >
          Remove
        </button>
      </div>
      <label className="flex items-center gap-2 text-[10px] text-text-muted">
        Pin
        <select
          value={item.versionId || ""}
          disabled={loadingVersions || versions.length === 0}
          onChange={(e) => {
            const v = versions.find((x) => x.id === e.target.value);
            if (v) applyVersion(v);
          }}
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-text-primary"
          title="Modrinth version pin — always send a version on save"
        >
          {!item.versionId ? (
            <option value="">
              {item.version ? `v${item.version}` : "Pick version…"}
            </option>
          ) : null}
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.version_number}
              {v.version_type && v.version_type !== "release"
                ? ` (${v.version_type})`
                : ""}
            </option>
          ))}
        </select>
      </label>
    </li>
  );
}

function SearchResultRow({
  hit,
  already,
  picking,
  onAdd,
  onPreview,
}: {
  hit: ModrinthHit;
  already: boolean;
  picking: boolean;
  onAdd: () => void;
  onPreview: () => void;
}) {
  return (
    <button
      type="button"
      disabled={already || picking}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          onPreview();
          return;
        }
        onAdd();
      }}
      className={cn(
        "build-search-row flex w-full items-center gap-3 border-b border-border-subtle/40 px-3 py-2.5 text-left last:border-0 cursor-pointer disabled:opacity-45",
        "hover:bg-primary-base/8",
      )}
    >
      {hit.icon_url ? (
        <img
          src={hit.icon_url}
          alt=""
          className="h-9 w-9 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <span className="h-9 w-9 shrink-0 rounded-lg bg-bg-elevated" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-text-primary">
          {hit.title}
        </span>
        <span className="block truncate text-[10px] text-text-muted">
          {(hit.downloads / 1000).toFixed(0)}k downloads
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold",
          already
            ? "bg-white/6 text-text-disabled"
            : "bg-primary-base/14 text-primary-base",
        )}
      >
        {already ? "Added" : picking ? "…" : "Add"}
      </span>
    </button>
  );
}

export function ModrinthCatalogPicker({
  label,
  projectType,
  loader,
  gameVersion,
  selected,
  onChange,
  allowOptionalToggle = false,
  compact = false,
  variant = "stack",
}: Props) {
  const [query, setQuery] = useState("");
  const [basketQuery, setBasketQuery] = useState("");
  const [hits, setHits] = useState<ModrinthHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [filterPaused, setFilterPaused] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(
    null,
  );

  const versionFilterActive =
    !filterPaused && Boolean(gameVersion?.trim());
  const loaderFilterActive =
    !filterPaused &&
    projectType === "mod" &&
    Boolean(loader?.trim()) &&
    loader !== "vanilla";

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setBusy(true);
      void searchModrinth({
        query: query.trim(),
        type: projectType,
        loader: loaderFilterActive ? loader : undefined,
        version: versionFilterActive ? gameVersion : undefined,
        limit: variant === "split" ? 20 : compact ? 8 : 12,
      })
        .then((res) => {
          if (!cancelled) setHits(res.hits);
        })
        .catch((err) => {
          if (!cancelled) {
            toast.error(
              err instanceof Error ? err.message : "Modrinth search failed",
            );
          }
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [
    query,
    projectType,
    loader,
    gameVersion,
    compact,
    variant,
    loaderFilterActive,
    versionFilterActive,
  ]);

  const openPreview = (target: PreviewTarget) => {
    setPreviewTarget(target);
  };

  const addHit = async (hit: ModrinthHit) => {
    if (
      selected.some(
        (s) => s.slug === hit.slug || s.projectId === hit.project_id,
      )
    ) {
      toast.message("Already in your pack");
      return;
    }
    setPickingId(hit.project_id);
    try {
      const versions = await getModrinthVersions(hit.project_id, {
        gameVersions: gameVersion ? [gameVersion] : undefined,
        loaders:
          projectType === "mod" && loader && loader !== "vanilla"
            ? [loader]
            : undefined,
      });
      const version = versions[0];
      if (!version) {
        toast.error(
          `No version for ${gameVersion ?? "this MC"}${loader ? ` / ${loader}` : ""}. Pause filtering to browse all, or change pack settings.`,
        );
        return;
      }
      const sourceUrl = primaryUrl(version);
      if (!sourceUrl) {
        toast.error("Modrinth version has no download file.");
        return;
      }
      onChange([
        ...selected,
        {
          name: hit.title,
          slug: hit.slug,
          version: version.version_number,
          sourceUrl,
          projectId: hit.project_id,
          versionId: version.id,
          projectType: hit.project_type || projectType,
          optional: false,
        },
      ]);
      toast.success(`Added ${hit.title}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add project");
    } finally {
      setPickingId(null);
    }
  };

  const requiredCount = selected.filter((s) => !s.optional).length;
  const optionalCount = selected.filter((s) => s.optional).length;
  const countLabel = allowOptionalToggle
    ? `${requiredCount} required · ${optionalCount} optional`
    : `${selected.length} in pack`;
  const basketNeedle = basketQuery.trim().toLowerCase();
  const filteredSelected = basketNeedle
    ? selected.filter((m) => {
        const hay = `${m.name} ${m.slug ?? ""} ${m.version ?? ""}`.toLowerCase();
        return hay.includes(basketNeedle);
      })
    : selected;

  const filterBadge =
    versionFilterActive || loaderFilterActive ? (
      <span className="rounded-full bg-primary-base/12 px-2.5 py-1 text-[10px] font-medium text-primary-base">
        {gameVersion}
        {loaderFilterActive ? ` · ${loader}` : ""}
      </span>
    ) : (
      <span className="rounded-full bg-white/6 px-2.5 py-1 text-[10px] text-text-muted">
        Showing all versions
      </span>
    );

  const filterToggle = (
    <button
      type="button"
      onClick={() => setFilterPaused((p) => !p)}
      title={
        filterPaused
          ? "Filter results to your pack's Minecraft version and loader"
          : "Show all Modrinth results regardless of version"
      }
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors",
        filterPaused
          ? "border-white/12 bg-white/5 text-text-secondary hover:bg-white/8"
          : "border-primary-base/25 bg-primary-base/8 text-primary-base hover:bg-primary-base/12",
      )}
    >
      <Icon
        icon={filterPaused ? AppIcons.Play : AppIcons.Pause}
        size={12}
      />
      {filterPaused ? "Filter to pack" : "Show all"}
    </button>
  );

  const resultsBody =
    busy && hits.length === 0 ? (
      <p className="px-4 py-8 text-center text-[12px] text-text-muted">
        Searching Modrinth…
      </p>
    ) : hits.length === 0 ? (
      <p className="px-4 py-8 text-center text-[12px] text-text-muted">
        {query.trim()
          ? "No matches — try another search or pause filtering"
          : "Type to search Modrinth"}
      </p>
    ) : (
      hits.map((hit) => {
        const already = selected.some(
          (s) => s.projectId === hit.project_id || s.slug === hit.slug,
        );
        return (
          <SearchResultRow
            key={hit.project_id}
            hit={hit}
            already={already}
            picking={pickingId === hit.project_id}
            onAdd={() => void addHit(hit)}
            onPreview={() =>
              openPreview({ id: hit.project_id, slug: hit.slug })
            }
          />
        );
      })
    );

  const basketBody =
    selected.length === 0 ? (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
        <p className="text-[13px] font-medium text-text-secondary">
          Nothing here yet
        </p>
        <p className="mt-1 max-w-[200px] text-[11px] leading-relaxed text-text-muted">
          Search and tap Add. Ctrl+click a result to preview on Modrinth.
        </p>
      </div>
    ) : filteredSelected.length === 0 ? (
      <p className="px-3 py-8 text-center text-[12px] text-text-muted">
        No mods match your filter.
      </p>
    ) : (
      <ul className="flex flex-col gap-0.5 p-1.5">
        {filteredSelected.map((item) => (
          <SelectedRow
            key={`${item.projectId}:${item.versionId || item.version}`}
            item={item}
            allowOptionalToggle={allowOptionalToggle}
            selected={selected}
            onChange={onChange}
            onView={() =>
              openPreview({ id: item.projectId, slug: item.slug })
            }
            loader={loader}
            gameVersion={gameVersion}
            projectType={projectType}
          />
        ))}
      </ul>
    );

  const previewModal = (
    <ModrinthPreviewModal
      open={Boolean(previewTarget)}
      projectIdOrSlug={previewTarget?.slug ?? previewTarget?.id ?? null}
      gameVersion={gameVersion}
      loader={projectType === "mod" ? loader : undefined}
      onClose={() => setPreviewTarget(null)}
    />
  );

  if (variant === "split") {
    return (
      <>
        <div className="build-picker-split flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[14px] font-semibold text-text-primary">
              {label}
            </p>
            <span className="text-[11px] text-text-muted">{countLabel}</span>
          </div>

          <div className="build-picker-grid grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="build-picker-browse flex min-h-0 flex-col gap-2.5 rounded-xl border border-border-subtle bg-black/15 p-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className={fieldClass}
                placeholder={`Search ${projectType}s on Modrinth…`}
                autoFocus
              />
              <div className="flex flex-wrap items-center gap-2">
                {filterBadge}
                {filterToggle}
                <span className="text-[10px] text-text-disabled">
                  Ctrl+click to preview
                </span>
              </div>
              <div className="scrollbar-cultforge min-h-0 flex-1 overflow-y-auto rounded-lg border border-border-subtle/60 bg-bg-app/40">
                {resultsBody}
              </div>
            </div>

            <div className="build-picker-basket flex min-h-[200px] flex-col rounded-xl border border-border-subtle bg-black/20 lg:min-h-0">
              <div className="shrink-0 border-b border-border-subtle/60 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  In your pack
                </p>
                <p className="text-[10px] text-text-disabled">{countLabel}</p>
                <input
                  type="search"
                  value={basketQuery}
                  onChange={(e) => setBasketQuery(e.target.value)}
                  placeholder="Filter mods in pack…"
                  className="mt-2 w-full rounded-lg border border-border-subtle bg-bg-base px-2.5 py-1.5 text-[12px] text-text-primary placeholder:text-text-muted outline-none focus:border-primary-base/45"
                />
              </div>
              <div className="scrollbar-cultforge flex min-h-0 flex-1 flex-col overflow-y-auto">
                {basketBody}
              </div>
            </div>
          </div>

          {projectType === "mod" && selected.length > 0 ? (
            <ModDependencyPanel
              selected={selected}
              gameVersion={gameVersion}
              loader={loader}
            />
          ) : null}
        </div>
        {previewModal}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            {label}
          </span>
          <span className="text-[9px] text-text-disabled">{countLabel}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {filterBadge}
          {filterToggle}
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={fieldClass}
          placeholder={`Search Modrinth ${projectType}s…`}
        />

        <div
          className={cn(
            "scrollbar-cultforge overflow-y-auto rounded-lg border border-border-subtle",
            compact ? "max-h-44" : "max-h-52",
          )}
        >
          {resultsBody}
        </div>

        {selected.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {selected.map((item) => (
              <SelectedRow
                key={`${item.projectId}:${item.versionId || item.version}`}
                item={item}
                allowOptionalToggle={allowOptionalToggle}
                selected={selected}
                onChange={onChange}
                onView={() =>
                  openPreview({ id: item.projectId, slug: item.slug })
                }
                loader={loader}
                gameVersion={gameVersion}
                projectType={projectType}
              />
            ))}
          </ul>
        ) : null}
      </div>
      {previewModal}
    </>
  );
}
