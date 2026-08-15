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

const fieldClass =
  "h-9 w-full rounded-lg border border-border-subtle bg-black/25 px-3 text-[12px] text-text-primary outline-none placeholder:text-text-disabled focus:border-primary-base/45";

export type ModrinthPickWithOptional = ModrinthPickResult & {
  optional?: boolean;
};

type Props = {
  label: string;
  projectType: "mod" | "resourcepack" | "shader" | "datapack";
  loader?: string;
  gameVersion?: string;
  selected: ModrinthPickWithOptional[];
  onChange: (next: ModrinthPickWithOptional[]) => void;
  /** When true, each selected mod can be marked optional instead of a second picker. */
  allowOptionalToggle?: boolean;
  /** Shorter results list for denser layouts. */
  compact?: boolean;
};

function primaryUrl(version: ModrinthVersion): string {
  const file =
    version.files.find((f) => f.primary) ?? version.files[0] ?? null;
  return file?.url ?? "";
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
}: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ModrinthHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [pickingId, setPickingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setBusy(true);
      void searchModrinth({
        query: query.trim(),
        type: projectType,
        loader: projectType === "mod" ? loader : undefined,
        version: gameVersion || undefined,
        limit: compact ? 8 : 12,
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
  }, [query, projectType, loader, gameVersion, compact]);

  const addHit = async (hit: ModrinthHit) => {
    if (selected.some((s) => s.slug === hit.slug || s.projectId === hit.project_id)) {
      toast.message("Already added");
      return;
    }
    setPickingId(hit.project_id);
    try {
      const versions = await getModrinthVersions(hit.project_id, {
        gameVersions: gameVersion ? [gameVersion] : undefined,
        loaders:
          projectType === "mod" && loader
            ? [loader]
            : undefined,
      });
      const version = versions[0];
      if (!version) {
        toast.error("No compatible Modrinth version for this MC/loader.");
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add project");
    } finally {
      setPickingId(null);
    }
  };

  const requiredCount = selected.filter((s) => !s.optional).length;
  const optionalCount = selected.filter((s) => s.optional).length;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {label}
        </span>
        <span className="text-[9px] text-text-disabled">
          {allowOptionalToggle
            ? `${requiredCount} required · ${optionalCount} optional`
            : `${selected.length} selected`}
        </span>
      </div>

      {selected.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {selected.map((item) => (
            <li
              key={`${item.projectId}:${item.versionId}`}
              className="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-elevated/35 px-2.5 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate text-[11px] text-text-primary">
                {item.name}{" "}
                <span className="text-text-muted">v{item.version}</span>
              </span>
              {allowOptionalToggle && (
                <label className="flex shrink-0 items-center gap-1.5 text-[9px] text-text-muted cursor-pointer select-none">
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
                  Optional
                </label>
              )}
              <button
                type="button"
                className="shrink-0 text-[9px] text-state-error cursor-pointer"
                onClick={() =>
                  onChange(selected.filter((s) => s.projectId !== item.projectId))
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

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
        {busy && hits.length === 0 ? (
          <p className="px-3 py-4 text-center text-[10px] text-text-muted">
            Searching…
          </p>
        ) : hits.length === 0 ? (
          <p className="px-3 py-4 text-center text-[10px] text-text-muted">
            No results
          </p>
        ) : (
          hits.map((hit) => {
            const already = selected.some(
              (s) => s.projectId === hit.project_id || s.slug === hit.slug,
            );
            return (
              <button
                key={hit.project_id}
                type="button"
                disabled={already || pickingId === hit.project_id}
                onClick={() => void addHit(hit)}
                className={cn(
                  "flex w-full items-center gap-2 border-b border-border-subtle/50 px-2.5 py-2 text-left last:border-0 cursor-pointer disabled:opacity-40",
                  "hover:bg-primary-base/8",
                )}
              >
                {hit.icon_url ? (
                  <img
                    src={hit.icon_url}
                    alt=""
                    className="h-7 w-7 rounded-md object-cover"
                  />
                ) : (
                  <span className="h-7 w-7 rounded-md bg-bg-elevated" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-medium text-text-primary">
                    {hit.title}
                  </span>
                  <span className="block truncate text-[9px] text-text-muted">
                    {hit.slug} · {(hit.downloads / 1000).toFixed(0)}k downloads
                  </span>
                </span>
                <span className="text-[9px] font-medium text-primary-base">
                  {already
                    ? "Added"
                    : pickingId === hit.project_id
                      ? "…"
                      : "Add"}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
