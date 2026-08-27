import { useEffect } from "react";
import { useBuildCatalogStore } from "../../../../stores/buildCatalog";
import { EntityImage } from "../../../EntityImage";
import { CopyButton } from "../../../CopyButton";
import type { CatalogBuildRecord } from "../../../../types/catalog";

function loaderBadge(loader: string) {
  const label = loader.charAt(0).toUpperCase() + loader.slice(1);
  return (
    <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-text-muted">
      {label}
    </span>
  );
}

function BuildCard({
  build,
  onOpen,
}: {
  build: CatalogBuildRecord;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="cf-panel group flex flex-col overflow-hidden rounded-xl text-left cursor-pointer"
    >
      <EntityImage
        kind="build"
        entityId={build.id}
        source={build.coverUrl || build.iconUrl}
        alt=""
        className="aspect-16/9 w-full border-b border-border-subtle transition-transform duration-300 group-hover:scale-[1.015]"
        fit="cover"
      />
      <div className="flex flex-col gap-1.5 p-3">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-semibold text-text-primary">
            {build.name}
          </span>
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider ${
              build.buildScope === "guild"
                ? "bg-primary-base/12 text-primary-base"
                : "bg-state-info/12 text-state-info"
            }`}
          >
            {build.buildScope === "guild" ? "Guild" : "Community"}
          </span>
        </div>
        {build.tagline && (
          <p className="text-[10px] text-text-muted line-clamp-2">
            {build.tagline}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-[9px] text-text-muted">
          {loaderBadge(build.loader)}
          {build.minecraftVersion && (
            <span>MC {build.minecraftVersion}</span>
          )}
          {build.isInstallable && (
            <span className="text-primary-base font-semibold">
              Ready to install
            </span>
          )}
        </div>
        {build.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {build.keywords.slice(0, 5).map((k) => (
              <span
                key={k}
                className="rounded-md bg-white/5 px-1.5 py-0.5 text-[8px] text-text-disabled"
              >
                {k}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

function BuildDetailDrawer({
  build,
  onClose,
}: {
  build: CatalogBuildRecord;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
      <button
        type="button"
        aria-label="Close"
        className="flex-1 cursor-pointer"
        onClick={onClose}
      />
      <aside className="flex h-full w-full max-w-lg flex-col border-l border-white/10 bg-bg-app shadow-2xl overflow-y-auto">
        <EntityImage
          kind="build"
          entityId={build.id}
          source={build.coverUrl || build.iconUrl}
          alt=""
          className="aspect-16/9 w-full border-b border-border-subtle"
          fit="cover"
        />
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-3">
            {build.iconUrl && (
              <EntityImage
                kind="build"
                entityId={build.id}
                source={build.iconUrl}
                alt=""
                className="h-12 w-12 rounded-xl border border-white/10 shrink-0"
              />
            )}
            <div className="min-w-0">
              <h2 className="font-sora text-xl font-bold text-text-primary truncate">
                {build.name}
              </h2>
              {build.tagline && (
                <p className="text-[11px] text-text-secondary mt-0.5">
                  {build.tagline}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-[10px]">
            {loaderBadge(build.loader)}
            {build.minecraftVersion && (
              <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-text-muted">
                MC {build.minecraftVersion}
              </span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 font-semibold ${
                build.buildScope === "guild"
                  ? "bg-primary-base/12 text-primary-base"
                  : "bg-state-info/12 text-state-info"
              }`}
            >
              {build.buildScope === "guild" ? "Guild build" : "Community build"}
            </span>
            {build.isInstallable && (
              <span className="rounded-full bg-state-success/12 px-2 py-0.5 font-semibold text-state-success">
                Installable
              </span>
            )}
          </div>

          {build.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {build.keywords.map((k) => (
                <span
                  key={k}
                  className="rounded-md bg-white/6 border border-white/8 px-2 py-0.5 text-[9px] text-text-muted"
                >
                  {k}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2 mt-2">
            <CopyButton
              text={build.id}
              label="Copy build ID"
              successMessage="Build ID copied!"
              className="cf-btn-primary justify-center border-0 px-5 py-2.5 text-[12px] font-bold text-white hover:bg-primary-base/90"
            />
            <p className="text-[9px] text-text-disabled text-center">
              Install this build from the Builds tab using the copied ID.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-4 rounded-lg border border-white/12 px-4 py-2 text-[11px] text-text-secondary cursor-pointer self-start"
          >
            Close
          </button>
        </div>
      </aside>
    </div>
  );
}

export default function BuildCatalogPage() {
  const query = useBuildCatalogStore((s) => s.query);
  const setQuery = useBuildCatalogStore((s) => s.setQuery);
  const keywords = useBuildCatalogStore((s) => s.keywords);
  const setKeywords = useBuildCatalogStore((s) => s.setKeywords);
  const loader = useBuildCatalogStore((s) => s.loader);
  const setLoader = useBuildCatalogStore((s) => s.setLoader);
  const mcVer = useBuildCatalogStore((s) => s.minecraftVersion);
  const setMcVer = useBuildCatalogStore((s) => s.setMinecraftVersion);
  const results = useBuildCatalogStore((s) => s.results);
  const loading = useBuildCatalogStore((s) => s.loading);
  const error = useBuildCatalogStore((s) => s.error);
  const search = useBuildCatalogStore((s) => s.search);
  const detail = useBuildCatalogStore((s) => s.detail);
  const openDetail = useBuildCatalogStore((s) => s.openDetail);
  const closeDetail = useBuildCatalogStore((s) => s.closeDetail);

  useEffect(() => {
    void search();
  }, []);

  return (
    <div className="h-full overflow-y-auto scroll-hidden p-4 pb-24 flex flex-col gap-4">
      <div>
        <h1 className="font-sora text-xl font-bold text-text-primary">
          Build Catalog
        </h1>
        <p className="text-[11px] text-text-muted mt-1">
          Browse published Minecraft builds from the community and guilds.
          Install builds to your library from here.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search builds…"
          className="min-w-0 flex-1 rounded-lg border border-border-strong bg-black/20 px-3 py-2 text-[11px] text-text-primary outline-none placeholder:text-text-disabled focus:border-primary-base/45"
        />
        <input
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="Keywords (comma-separated)"
          className="w-48 rounded-lg border border-border-strong bg-black/20 px-3 py-2 text-[11px] text-text-primary outline-none placeholder:text-text-disabled focus:border-primary-base/45"
        />
        <select
          value={loader}
          onChange={(e) => setLoader(e.target.value)}
          className="rounded-lg border border-border-strong bg-black/20 px-3 py-2 text-[11px] text-text-primary outline-none cursor-pointer"
        >
          <option value="">Any loader</option>
          <option value="fabric">Fabric</option>
          <option value="forge">Forge</option>
          <option value="neoforge">NeoForge</option>
          <option value="quilt">Quilt</option>
          <option value="vanilla">Vanilla</option>
        </select>
        <input
          value={mcVer}
          onChange={(e) => setMcVer(e.target.value)}
          placeholder="MC version"
          className="w-28 rounded-lg border border-border-strong bg-black/20 px-3 py-2 text-[11px] text-text-primary outline-none placeholder:text-text-disabled focus:border-primary-base/45"
        />
        <button
          type="button"
          onClick={() => void search()}
          disabled={loading}
          className="cf-btn-primary rounded-lg px-4 py-2 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-state-error/20 bg-state-error/6 px-3 py-2.5 text-[11px] text-state-error">
          {error}
        </div>
      )}

      {!loading && results.length === 0 && !error && (
        <div className="cf-panel rounded-xl flex items-center justify-center min-h-50 text-[13px] text-text-muted">
          No builds found. Try a different search or check back later.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((build) => (
          <BuildCard
            key={build.id}
            build={build}
            onOpen={() => void openDetail(build.id)}
          />
        ))}
      </div>

      {detail && (
        <BuildDetailDrawer build={detail} onClose={closeDetail} />
      )}
    </div>
  );
}
