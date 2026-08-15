import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  searchModrinth,
  getModrinthProject,
  resolveModrinthInstallPlan,
  type ModrinthHit,
  type ModrinthProject,
} from "../../../../lib/modrinth";
import { startModrinthInstall } from "../../../../lib/nativeDownloads";
import { useDownloadStore } from "../../../../typlibs";
import { useBuildStore } from "../../../../stores/build";
import { useSettingsStore } from "../../../../stores/settings";
import { cn } from "../../../../lib/cn";
import { StoreBrowse } from "../../../store/StoreBrowse";
import { StoreProjectDetail } from "../../../store/StoreProjectDetail";

function StorePage() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("mod");
  const [loader, setLoader] = useState("");
  const [version, setVersion] = useState("");
  const [hits, setHits] = useState<ModrinthHit[]>([]);
  const [totalHits, setTotalHits] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [project, setProject] = useState<ModrinthProject | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [installing, setInstalling] = useState(false);

  const enqueue = useDownloadStore((s) => s.enqueue);
  const builds = useBuildStore((s) => s.builds);
  const activeBuild = useBuildStore((s) => s.active());
  const downloadsPath = useSettingsStore((s) => s.settings.downloadsPath);

  const eligibleBuilds = useMemo(
    () =>
      builds.filter(
        (b) => Boolean(b.location?.trim()) && !b.managed,
      ),
    [builds],
  );

  const [installBuildId, setInstallBuildId] = useState("");

  useEffect(() => {
    if (!eligibleBuilds.length) {
      setInstallBuildId("");
      return;
    }
    setInstallBuildId((prev) => {
      if (prev && eligibleBuilds.some((b) => b.id === prev)) return prev;
      if (activeBuild && eligibleBuilds.some((b) => b.id === activeBuild.id)) {
        return activeBuild.id;
      }
      return eligibleBuilds[0].id;
    });
  }, [eligibleBuilds, activeBuild]);

  // Prefer selected build's mc/loader for browse filters when user picks a build.
  useEffect(() => {
    const build = eligibleBuilds.find((b) => b.id === installBuildId);
    if (!build) return;
    if (build.mc && build.mc !== "—") setVersion(build.mc);
    const loaderToken = build.loader.trim().toLowerCase().split(/\s+/)[0];
    if (
      loaderToken &&
      loaderToken !== "—" &&
      loaderToken !== "vanilla" &&
      ["forge", "fabric", "neoforge", "quilt"].includes(loaderToken)
    ) {
      setLoader(loaderToken);
    }
  }, [installBuildId]); // eslint-disable-line react-hooks/exhaustive-deps -- only when build target changes

  const runSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await searchModrinth({
        query,
        type: type || undefined,
        loader: loader || undefined,
        version: version || undefined,
        limit: 24,
      });
      setHits(data.hits);
      setTotalHits(data.total_hits);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setHits([]);
      setTotalHits(0);
    } finally {
      setLoading(false);
    }
  }, [query, type, loader, version]);

  useEffect(() => {
    void runSearch();
    // initial + filter-driven; query applies on Enter / Search click
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, loader, version]);

  const openDetail = async (hit: ModrinthHit) => {
    setSelectedSlug(hit.slug);
    setSelectedId(hit.project_id);
    setProjectLoading(true);
    try {
      const next = await getModrinthProject(hit.slug);
      setProject(next);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not load project details",
      );
      setProject(null);
      setSelectedSlug(null);
      setSelectedId(null);
    } finally {
      setProjectLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedSlug(null);
    setSelectedId(null);
    setProject(null);
  };

  const install = async (opts: {
    build: (typeof eligibleBuilds)[number];
    versionId: string;
  }) => {
    if (!project) return;
    if (opts.build.managed) {
      toast.error("Guild-managed build", {
        description:
          "Store installs are blocked. Guild masters publish content via the guild manifest.",
      });
      return;
    }
    if (!opts.build.location.trim()) {
      toast.error("No install location", {
        description: "Selected build has no install path.",
      });
      return;
    }

    setInstalling(true);
    try {
      const plan = await resolveModrinthInstallPlan({
        projectId: project.id,
        buildId: opts.build.id,
        buildLocation: opts.build.location,
        cacheRoot: downloadsPath || opts.build.location + "/.cultforge-cache",
        gameVersion:
          opts.build.mc && opts.build.mc !== "—" ? opts.build.mc : undefined,
        loader:
          opts.build.loader && opts.build.loader !== "—"
            ? opts.build.loader
            : undefined,
        projectType: project.project_type,
        versionId: opts.versionId,
      });

      enqueue({
        id: plan.jobId,
        jobId: plan.jobId,
        name:
          plan.items.length > 1
            ? `${project.title} (+${plan.items.length - 1} deps)`
            : project.title,
        totalMb:
          Math.round(
            (plan.items.reduce((sum, item) => sum + item.sizeBytes, 0) /
              (1024 * 1024)) *
              10,
          ) / 10,
        totalBytes: plan.items.reduce((sum, item) => sum + item.sizeBytes, 0),
        downloadedBytes: 0,
        doneMb: 0,
        progress: 0,
        status: "queued",
        phase: "queued",
      });

      await startModrinthInstall(plan);
      toast.success(`Installing ${project.title}`, {
        description: `Into ${opts.build.name} · ${plan.items.length} file${plan.items.length === 1 ? "" : "s"}`,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Install failed";
      toast.error("Could not start install", { description: message });
    } finally {
      setInstalling(false);
    }
  };

  const detailOpen = Boolean(selectedSlug);

  return (
    <div className="flex h-full min-h-0 gap-0 p-3 pb-[var(--cf-dock-clear,6.5rem)]">
      <div
        className={cn(
          "min-h-0 min-w-0 flex-1",
          detailOpen && "hidden lg:block",
        )}
      >
        <StoreBrowse
          query={query}
          onQueryChange={setQuery}
          onSearch={() => void runSearch()}
          type={type}
          onTypeChange={setType}
          loader={loader}
          onLoaderChange={setLoader}
          version={version}
          onVersionChange={setVersion}
          hits={hits}
          loading={loading}
          error={error}
          selectedId={selectedId}
          onSelect={(hit) => void openDetail(hit)}
          totalHits={totalHits}
        />
      </div>

      {detailOpen && (
        <div
          className={cn(
            "min-h-0 w-full shrink-0 lg:w-[min(48%,34rem)]",
            "fixed inset-0 z-40 bg-bg-app lg:static lg:z-auto lg:bg-transparent",
          )}
        >
          <StoreProjectDetail
            project={project}
            loading={projectLoading}
            builds={eligibleBuilds}
            selectedBuildId={installBuildId}
            onSelectedBuildChange={setInstallBuildId}
            installing={installing}
            onInstall={(opts) => void install(opts)}
            onClose={closeDetail}
          />
        </div>
      )}
    </div>
  );
}

export default StorePage;
