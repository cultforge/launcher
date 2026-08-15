import {
  formatDownloads,
  formatRelativeDate,
  type ModrinthHit,
} from "../../lib/modrinth";
import { cn } from "../../lib/cn";
import { ThemeLogo } from "../ThemeLogo";
import { CfSelect } from "../ui/CfSelect";

export function StoreBrowse({
  query,
  onQueryChange,
  onSearch,
  type,
  onTypeChange,
  loader,
  onLoaderChange,
  version,
  onVersionChange,
  hits,
  loading,
  error,
  selectedId,
  onSelect,
  totalHits,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  onSearch: () => void;
  type: string;
  onTypeChange: (v: string) => void;
  loader: string;
  onLoaderChange: (v: string) => void;
  version: string;
  onVersionChange: (v: string) => void;
  hits: ModrinthHit[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (hit: ModrinthHit) => void;
  totalHits?: number;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="cf-panel shrink-0 rounded-xl px-4 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-sora text-[18px] font-bold text-text-primary">
              Store
            </h2>
            <p className="mt-1 text-[12px] text-text-muted">
              Browse Modrinth mods, packs, and shaders — pick a build before
              installing.
            </p>
          </div>
          {!loading && !error && (
            <span className="text-[10px] uppercase tracking-wider text-text-muted tabular-nums">
              {typeof totalHits === "number"
                ? `${totalHits.toLocaleString()} results`
                : `${hits.length} shown`}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
            placeholder="Search Modrinth…"
            className="min-w-48 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-text-primary outline-none focus:border-primary-base/40"
          />
          <CfSelect
            value={type}
            onChange={onTypeChange}
            options={[
              { value: "mod", label: "Mods" },
              { value: "modpack", label: "Modpacks" },
              { value: "resourcepack", label: "Resource Packs" },
              { value: "shader", label: "Shaders" },
              { value: "datapack", label: "Datapacks" },
            ]}
            aria-label="Content type"
            className="w-[9.5rem]"
          />
          <CfSelect
            value={loader}
            onChange={onLoaderChange}
            options={[
              { value: "", label: "Any loader" },
              { value: "forge", label: "Forge" },
              { value: "fabric", label: "Fabric" },
              { value: "neoforge", label: "NeoForge" },
              { value: "quilt", label: "Quilt" },
            ]}
            aria-label="Loader"
            className="w-[8.5rem]"
          />
          <CfSelect
            value={version}
            onChange={onVersionChange}
            options={[
              { value: "", label: "Any version" },
              { value: "1.21.1", label: "1.21.1" },
              { value: "1.21", label: "1.21" },
              { value: "1.20.1", label: "1.20.1" },
              { value: "1.19.2", label: "1.19.2" },
            ]}
            aria-label="Minecraft version"
            className="w-[8.5rem]"
          />
          <button
            type="button"
            onClick={onSearch}
            className="cursor-pointer rounded-lg bg-primary-base/20 px-4 py-2 text-[11px] font-bold text-primary-soft transition-colors hover:bg-primary-base hover:text-bg-app"
          >
            Search
          </button>
        </div>
      </header>

      {loading && (
        <div className="flex flex-1 items-center justify-center text-[13px] text-text-muted">
          Searching Modrinth…
        </div>
      )}
      {error && (
        <div className="cf-panel rounded-xl px-4 py-8 text-center text-[13px] text-state-error">
          {error}
        </div>
      )}
      {!loading && !error && (
        <div className="cf-panel min-h-0 flex-1 overflow-y-auto scroll-hidden rounded-xl p-1.5">
          {hits.length === 0 ? (
            <div className="px-3 py-16 text-center text-[13px] text-text-muted">
              No projects found.
            </div>
          ) : (
            <ul className="flex flex-col">
              {hits.map((hit) => {
                const selected = selectedId === hit.project_id;
                const cats =
                  hit.display_categories?.slice(0, 3) ??
                  hit.categories.slice(0, 3);
                return (
                  <li key={hit.project_id}>
                    <button
                      type="button"
                      onClick={() => onSelect(hit)}
                      className={cn(
                        "flex w-full cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                        selected
                          ? "bg-primary-base/12 ring-1 ring-primary-base/30"
                          : "hover:bg-white/[0.04]",
                      )}
                    >
                      {hit.icon_url ? (
                        <img
                          src={hit.icon_url}
                          alt=""
                          className="h-11 w-11 shrink-0 rounded-md object-cover bg-black/30"
                        />
                      ) : (
                        <div className="h-11 w-11 shrink-0 rounded-md bg-black/30 p-1.5">
                          <ThemeLogo
                            className="h-full w-full"
                            glow={false}
                            label="CultForge fallback artwork"
                          />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[13px] font-semibold text-text-primary">
                            {hit.title}
                          </span>
                          <span className="shrink-0 text-[10px] text-text-muted tabular-nums">
                            {formatDownloads(hit.downloads)} dl
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-text-muted">
                          {hit.description}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-text-disabled">
                          {hit.author && (
                            <span className="text-text-secondary">
                              by {hit.author}
                            </span>
                          )}
                          {cats.map((c) => (
                            <span
                              key={c}
                              className="rounded bg-white/5 px-1.5 py-0.5 capitalize"
                            >
                              {c}
                            </span>
                          ))}
                          {typeof hit.follows === "number" && (
                            <span>
                              {formatDownloads(hit.follows)} follows
                            </span>
                          )}
                          {hit.date_modified && (
                            <span>
                              Updated {formatRelativeDate(hit.date_modified)}
                            </span>
                          )}
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
    </div>
  );
}
