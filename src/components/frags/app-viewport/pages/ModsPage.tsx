import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useNavigationStore } from "../../../../typlibs";
import { goHomeBuilds } from "../../../../lib/homeNav";
import { useBuildStore } from "../../../../stores/build";
import {
  useLibraryContentStore,
  type LibraryContentItem,
  type LibraryKind,
} from "../../../../stores/libraryContent";
import {
  useBuildUiStore,
  type BuildTabId,
} from "../../../../stores/buildUi";
import { EntityImage } from "../../../EntityImage";
import type { VisualEntityKind } from "../../../../lib/entityVisuals";
import { ImportUrlModal } from "../../../modals/ImportUrlModal";
import {
  importContentFiles,
  importContentFromUrl,
  importWorldFromFolder,
  importWorldFromUrl,
  importWorldFromZip,
  isImportCancelled,
  toastWorldImport,
  type ContentImportKind,
} from "../../../../lib/contentImport";

const TABS = [
  "Mods",
  "Shaders",
  "Resource Packs",
  "Datapacks",
  "Worlds",
] as const;

type LibraryTab = (typeof TABS)[number];

function kindForTab(tab: LibraryTab): LibraryKind {
  if (tab === "Shaders") return "shader";
  if (tab === "Resource Packs") return "resource-pack";
  if (tab === "Datapacks") return "datapack";
  if (tab === "Worlds") return "world";
  return "mod";
}

function visualKind(tab: LibraryTab): VisualEntityKind {
  if (tab === "Shaders") return "shader";
  if (tab === "Resource Packs" || tab === "Datapacks") return "resource-pack";
  if (tab === "Worlds") return "world";
  return "mod";
}

function destinationTab(tab: LibraryTab): BuildTabId {
  if (tab === "Shaders") return "Shaders";
  if (tab === "Resource Packs" || tab === "Datapacks") return "Packs";
  if (tab === "Worlds") return "World Management";
  return "Mods";
}

function contentKindForTab(tab: LibraryTab): ContentImportKind | null {
  if (tab === "Mods") return "mods";
  if (tab === "Shaders") return "shaderpacks";
  if (tab === "Resource Packs") return "resourcepacks";
  if (tab === "Datapacks") return "datapacks";
  return null;
}

function typeLabel(item: LibraryContentItem): string {
  switch (item.kind) {
    case "shader":
      return "Shader pack";
    case "resource-pack":
      return "Resource pack";
    case "datapack":
      return "Datapack";
    case "world":
      return "World";
    default:
      return "Mod";
  }
}

function sizeLabel(sizeMb: number): string {
  if (sizeMb <= 0) return "";
  if (sizeMb >= 1024) return `${(sizeMb / 1024).toFixed(1)} GB`;
  return `${sizeMb.toFixed(sizeMb < 10 ? 1 : 0)} MB`;
}

function itemMatchesQuery(item: LibraryContentItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    item.title,
    item.name,
    item.fileName,
    item.description,
    item.versionNumber,
    item.slug,
    typeLabel(item),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function searchPlaceholder(tab: LibraryTab): string {
  switch (tab) {
    case "Shaders":
      return "Search shaders…";
    case "Resource Packs":
      return "Search resource packs…";
    case "Datapacks":
      return "Search datapacks…";
    case "Worlds":
      return "Search worlds…";
    default:
      return "Search mods…";
  }
}

function ModsPage() {
  const sideItem = useNavigationStore((state) => state.sideItem);
  const setPrimaryTab = useNavigationStore((state) => state.setPrimaryTab);
  const setSideItem = useNavigationStore((state) => state.setSideItem);
  const setBuildTab = useBuildUiStore((state) => state.setActiveTab);
  const activeBuild = useBuildStore((state) => state.active());
  const items = useLibraryContentStore((state) => state.items);
  const scanning = useLibraryContentStore((state) => state.scanning);
  const enriching = useLibraryContentStore((state) => state.enriching);
  const [tab, setTab] = useState<LibraryTab>("Mods");
  const [search, setSearch] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);

  useEffect(() => {
    if (sideItem === "Library" || sideItem === "Installed Mods") setTab("Mods");
    else if (sideItem === "Shaders") setTab("Shaders");
    else if (sideItem === "Resource Packs") setTab("Resource Packs");
    else if (sideItem === "Datapacks") setTab("Datapacks");
    else if (sideItem === "Worlds") setTab("Worlds");
  }, [sideItem]);

  const inTab = useMemo(
    () => items.filter((item) => item.kind === kindForTab(tab)),
    [items, tab],
  );

  const visible = useMemo(
    () => inTab.filter((item) => itemMatchesQuery(item, search)),
    [inTab, search],
  );

  const canImport =
    Boolean(activeBuild?.id && activeBuild.id !== "none" && activeBuild.location) &&
    !activeBuild.managed &&
    !importBusy;

  const importBlockedReason = !activeBuild?.location
    ? "Select a build with an instance folder"
    : activeBuild.managed
      ? "Guild-managed builds are locked for local import"
      : undefined;

  const manage = (destination: LibraryTab) => {
    setBuildTab(destinationTab(destination));
    goHomeBuilds();
  };

  const selectTab = (next: LibraryTab) => {
    setTab(next);
    setSearch("");
  };

  const runImport = async (fn: () => Promise<void>) => {
    setImportBusy(true);
    try {
      await fn();
    } catch (err) {
      if (!isImportCancelled(err)) {
        toast.error(err instanceof Error ? err.message : "Import failed");
      }
    } finally {
      setImportBusy(false);
    }
  };

  const onImportFiles = () => {
    const kind = contentKindForTab(tab);
    if (!kind) return;
    void runImport(async () => {
      const n = await importContentFiles(kind);
      toast.success(
        n ? `Imported ${n} file${n === 1 ? "" : "s"}` : "No files imported",
      );
    });
  };

  const onImportWorldFolder = () => {
    void runImport(async () => {
      toastWorldImport(await importWorldFromFolder());
    });
  };

  const onImportWorldZip = () => {
    void runImport(async () => {
      toastWorldImport(await importWorldFromZip());
    });
  };

  const emptyLabel = scanning
    ? "Scanning…"
    : inTab.length === 0
      ? `No ${tab.toLowerCase()} found in this build`
      : `No ${tab.toLowerCase()} match “${search.trim()}”`;

  return (
    <div className="h-full flex flex-col min-h-0 p-4 gap-3">
      <div className="flex items-end justify-between gap-3 shrink-0">
        <div>
          <h2 className="font-sora text-[17px] font-bold text-text-primary">
            Library
          </h2>
          <p className="text-[11px] text-text-muted mt-0.5">
            {scanning
              ? "Scanning this build’s instance folder…"
              : enriching
                ? "Matching content against Modrinth…"
                : activeBuild.managed
                  ? `Guild-managed content for ${activeBuild.name}`
                  : activeBuild.location
                    ? `Content for ${activeBuild.name}`
                    : "Select a build to manage its mods and packs"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {tab === "Worlds" ? (
            <>
              <button
                type="button"
                disabled={!canImport}
                title={importBlockedReason}
                onClick={onImportWorldFolder}
                className="px-3 py-2 text-[11px] font-semibold rounded-lg border border-white/10 text-text-secondary hover:text-text-primary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Import folder
              </button>
              <button
                type="button"
                disabled={!canImport}
                title={importBlockedReason}
                onClick={onImportWorldZip}
                className="px-3 py-2 text-[11px] font-semibold rounded-lg border border-white/10 text-text-secondary hover:text-text-primary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Import zip
              </button>
              <button
                type="button"
                disabled={!canImport}
                title={importBlockedReason}
                onClick={() => setUrlOpen(true)}
                className="px-3 py-2 text-[11px] font-semibold rounded-lg border border-white/10 text-text-secondary hover:text-text-primary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Import URL
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={!canImport}
                title={importBlockedReason}
                onClick={onImportFiles}
                className="px-3 py-2 text-[11px] font-semibold rounded-lg border border-white/10 text-text-secondary hover:text-text-primary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Import files
              </button>
              <button
                type="button"
                disabled={!canImport}
                title={importBlockedReason}
                onClick={() => setUrlOpen(true)}
                className="px-3 py-2 text-[11px] font-semibold rounded-lg border border-white/10 text-text-secondary hover:text-text-primary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Import URL
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setPrimaryTab("Store")}
            className="cf-btn-primary text-[11px] uppercase tracking-wide px-4 py-2 rounded-lg cursor-pointer"
          >
            Find content
          </button>
        </div>
      </div>

      <nav
        aria-label="Library categories"
        className="flex gap-1 shrink-0 border-b border-border-subtle overflow-x-auto scroll-hidden"
      >
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={tab === item}
            onClick={() => selectTab(item)}
            className={`px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] whitespace-nowrap cursor-pointer transition-colors ${
              tab === item
                ? "text-primary-soft border-b-2 border-primary-base"
                : "text-text-muted hover:text-text-secondary border-b-2 border-transparent"
            }`}
          >
            {item}
            {item === tab && inTab.length > 0 ? (
              <span className="ml-1.5 text-text-disabled normal-case tracking-normal">
                {search.trim()
                  ? `${visible.length}/${inTab.length}`
                  : inTab.length}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="shrink-0 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder(tab)}
          aria-label={`Search ${tab.toLowerCase()}`}
          className="w-full sm:max-w-sm px-3.5 py-2.5 rounded-xl text-[13px] bg-black/30 border border-white/10 text-text-primary placeholder:text-text-disabled outline-none focus:border-primary-base/40"
        />
        {search.trim() ? (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="self-start sm:self-auto px-2.5 py-1.5 rounded-lg border border-white/10 text-[11px] font-semibold text-text-muted hover:text-text-primary hover:border-white/20 cursor-pointer"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scroll-hidden flex flex-col gap-1.5">
        {visible.length === 0 ? (
          <div className="cf-panel rounded-xl flex items-center justify-center min-h-40 text-[12px] text-text-muted">
            {emptyLabel}
          </div>
        ) : (
          visible.map((item, index) => (
            <motion.article
              key={item.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index, 12) * 0.04, duration: 0.25 }}
              whileHover={{ y: -1 }}
              className="cf-panel flex items-center gap-3 rounded-lg px-3 py-2.5"
            >
              <EntityImage
                kind={visualKind(tab)}
                entityId={item.id}
                source={item.iconDataUrl}
                alt={`${item.title ?? item.name} icon`}
                className="h-10 w-10 shrink-0 rounded-lg border border-border-subtle"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-text-primary font-medium truncate">
                  {item.title ?? item.name}
                </div>
                <div className="mt-0.5 text-[10px] text-text-muted truncate">
                  {typeLabel(item)}
                  {item.versionNumber ? ` · ${item.versionNumber}` : ""}
                  {sizeLabel(item.sizeMb) ? ` · ${sizeLabel(item.sizeMb)}` : ""}
                  {!item.enabled ? " · Disabled" : ""}
                </div>
                {item.description ? (
                  <div className="mt-0.5 text-[9px] text-text-disabled truncate">
                    {item.description}
                  </div>
                ) : (
                  <div className="mt-0.5 text-[9px] text-text-disabled truncate">
                    {item.fileName}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => manage(tab)}
                className="shrink-0 rounded-lg border border-border-subtle px-3 py-1.5 text-[9px] font-semibold text-primary-soft hover:border-primary-base/35 hover:bg-primary-base/7 cursor-pointer"
              >
                Manage in {activeBuild.name}
              </button>
            </motion.article>
          ))
        )}
      </div>

      <ImportUrlModal
        open={urlOpen}
        title={
          tab === "Worlds" ? "Import world from URL" : `Import ${tab} from URL`
        }
        onClose={() => setUrlOpen(false)}
        onSubmit={async (url) => {
          if (tab === "Worlds") {
            toastWorldImport(await importWorldFromUrl(url));
            return;
          }
          const kind = contentKindForTab(tab);
          if (!kind) throw new Error("Unsupported import tab");
          await importContentFromUrl(kind, url);
          toast.success("Imported from URL");
        }}
      />
    </div>
  );
}

export default ModsPage;
