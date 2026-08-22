import { useEffect, useMemo, useState } from "react";
import {
  guildBuildInstallState,
  managedInstanceIdForRelease,
} from "../../../data/guildBuilds";
import { cn } from "../../../lib/cn";
import { installGuildRelease, syncManagedBuild } from "../../../lib/guildBuildSync";
import {
  estimateGuildBuildSizes,
  formatBuildSizeBytes,
} from "../../../lib/guildBuildSize";
import { useBuildStore } from "../../../stores/build";
import { useGuildStore } from "../../../stores/guilds";
import type {
  GuildBuildInstallState,
  GuildBuildRelease,
} from "../../../types/buildManifest";
import { useDownloadStore, useNavigationStore } from "../../../typlibs";
import { goHomeBuilds } from "../../../lib/homeNav";
import { EntityImage } from "../../EntityImage";
import type { GuildServer } from "../../../data/guilds";
import { toast } from "sonner";
import { CfSelect } from "../../ui/CfSelect";

const PAGE_SIZE = 20;
type StatusFilter = "all" | GuildBuildInstallState["state"];
type SortMode = "newest" | "name" | "size";

function formatBytes(bytes: number, estimated?: boolean) {
  return formatBuildSizeBytes(bytes, { estimated });
}

function stateLabel(state: GuildBuildInstallState) {
  if (state.state === "installed") return "Installed";
  if (state.state === "installing") return "Installing";
  if (state.state === "update-available") return "Update available";
  return "Not installed";
}

function stateClass(state: GuildBuildInstallState) {
  if (state.state === "installed") return "text-primary-base";
  if (state.state === "installing") return "text-primary-base";
  if (state.state === "update-available") return "text-state-warning";
  return "text-text-muted";
}

function actionLabel(state: GuildBuildInstallState, busy: boolean) {
  if (busy || state.state === "installing") return "Installing…";
  if (state.state === "installed") return "Open installed build";
  if (state.state === "update-available") return "Sync / repair";
  return "Install build";
}

function CompactReleaseRow({
  release,
  state,
  selected,
  serverName,
  onSelect,
}: {
  release: GuildBuildRelease;
  state: GuildBuildInstallState;
  selected: boolean;
  serverName: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg border p-2 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70",
        selected
          ? "border-primary-base/45 bg-primary-base/8"
          : "border-transparent hover:border-border-subtle hover:bg-bg-elevated",
      )}
    >
      <EntityImage
        kind="build"
        entityId={release.buildId}
        source={release.image}
        alt={`${release.name} cover`}
        className="h-12 w-18 shrink-0 rounded-md border border-border-subtle bg-cover bg-center"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-semibold text-text-primary">
          {release.name}
        </span>
        <span className="mt-0.5 block truncate text-[9px] text-text-muted">
          {serverName} · {release.version}
        </span>
        <span className={cn("mt-1 block text-[8px] font-semibold", stateClass(state))}>
          {stateLabel(state)}
        </span>
      </span>
      <span className="text-[9px] text-text-disabled">
        {formatBytes(release.sizes.downloadBytes, release.sizes.estimated)}
      </span>
    </button>
  );
}

function ReleaseDetail({
  release,
  state,
  notice,
  server,
  busy,
  progressPct,
  progressLabel,
  progressBytes,
  progressTotal,
  onPrimaryAction,
  onDismissNotice,
}: {
  release: GuildBuildRelease;
  state: GuildBuildInstallState;
  notice: string | null;
  server: GuildServer | undefined;
  busy: boolean;
  progressPct: number;
  progressLabel: string | null;
  progressBytes: number;
  progressTotal: number;
  onPrimaryAction: () => void;
  onDismissNotice: () => void;
}) {
  const content = [
    `${release.content.mods} mods`,
    `${release.content.resourcePacks} resource packs`,
    `${release.content.shaders} shaders`,
    `${release.content.configs} configs`,
  ].join(" · ");
  const showProgress = busy || state.state === "installing" || progressPct > 0;

  return (
    <div className="h-full overflow-y-auto scroll-hidden">
      <div
        className="relative min-h-40 overflow-hidden border-b border-border-subtle p-4"
      >
        <EntityImage
          kind="build"
          entityId={release.buildId}
          source={release.image}
          alt={`${release.name} release artwork`}
          className="absolute inset-0 h-full w-full"
        />
        <div className="absolute inset-0 bg-linear-to-r from-bg-app via-bg-app/88 to-bg-app/30" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <div className={cn("text-[9px] font-bold uppercase tracking-wider", stateClass(state))}>
              {stateLabel(state)}
            </div>
            <h3 className="mt-1 font-sora text-[19px] font-bold text-text-primary">
              {release.name}
            </h3>
            <p className="mt-1 text-[10px] text-text-muted">
              {server?.name ?? "Guild server"} · Release {release.version}
            </p>
            <p className="mt-2 text-[10px] leading-relaxed text-text-secondary">
              {release.summary}
            </p>
          </div>
          <button
            type="button"
            onClick={onPrimaryAction}
            disabled={busy || state.state === "installing"}
            className="cf-btn-primary rounded-lg px-4 py-2.5 text-[11px] font-semibold cursor-pointer disabled:opacity-55 disabled:cursor-wait"
          >
            {actionLabel(state, busy)}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-4">
        {(notice || showProgress) && (
          <div
            role="status"
            className="rounded-xl border border-border-subtle bg-black/20 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold text-text-primary">
                  {showProgress ? "Install progress" : "Status"}
                </div>
                <p className="mt-1 text-[9px] leading-relaxed text-text-muted">
                  {progressLabel ||
                    notice ||
                    (showProgress ? "Preparing files…" : null)}
                </p>
              </div>
              {notice && !showProgress ? (
                <button
                  type="button"
                  onClick={onDismissNotice}
                  className="text-[9px] text-text-muted hover:text-text-primary cursor-pointer shrink-0"
                >
                  Dismiss
                </button>
              ) : null}
            </div>
            {showProgress ? (
              <div className="mt-3">
                <div className="flex items-center justify-between gap-2 text-[9px] text-text-muted tabular-nums">
                  <span>{Math.min(100, Math.max(0, progressPct))}%</span>
                  <span>
                    {progressBytes > 0
                      ? formatBytes(progressBytes)
                      : progressTotal > 0
                        ? "0 MB"
                        : "—"}
                    {progressTotal > 0 ? ` / ${formatBytes(progressTotal)}` : ""}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full bg-primary-base transition-[width] duration-300 ease-out"
                    style={{
                      width: `${Math.min(100, Math.max(showProgress ? 2 : 0, progressPct))}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {[
            ["Minecraft", release.dependencies.minecraft],
            ["Loader", release.dependencies.loader],
            ["Download", formatBytes(release.sizes.downloadBytes, release.sizes.estimated)],
            ["Installed", formatBytes(release.sizes.installedBytes, release.sizes.estimated)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-border-subtle bg-black/15 p-3">
              <div className="text-[8px] uppercase tracking-wider text-text-disabled">
                {label}
              </div>
              <div className="mt-1 truncate text-[11px] font-semibold text-text-primary">
                {value}
              </div>
            </div>
          ))}
        </div>

        <section className="rounded-xl border border-border-subtle bg-black/15 p-3">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">
            Included content
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-text-secondary">{content}</p>
          <div className="mt-3 rounded-lg border border-primary-base/20 bg-primary-base/6 px-3 py-2">
            <div className="text-[9px] font-semibold text-primary-base">
              Worlds and saves are never included
            </div>
            <p className="mt-1 text-[8px] text-text-disabled">
              Your existing worlds remain outside build ownership and updates.
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-border-subtle bg-black/15 p-3">
          <div className="flex items-center justify-between">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">
              Release notes
            </div>
            <span className="text-[8px] text-text-disabled">{release.publishedAt}</span>
          </div>
          <ul className="mt-2 flex flex-col gap-2">
            {release.changelog.slice(0, 3).map((entry) => (
              <li key={entry} className="flex gap-2 text-[9px] text-text-secondary">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-base" />
                {entry}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

export function BuildsPanel() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortMode>("newest");
  const [latestOnly, setLatestOnly] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [installJobId, setInstallJobId] = useState<string | null>(null);
  const guildId = useGuildStore((state) => state.activeGuildId);
  const buildReleases = useGuildStore((state) => state.buildReleases);
  const hydrateGuildBuilds = useGuildStore((state) => state.hydrateGuildBuilds);
  const patchBuildReleaseSizes = useGuildStore(
    (state) => state.patchBuildReleaseSizes,
  );
  const storeServers = useGuildStore((state) => state.servers);
  const builds = useBuildStore((state) => state.builds);
  const setActiveBuild = useBuildStore((state) => state.setActive);
  const setPrimaryTab = useNavigationStore((state) => state.setPrimaryTab);
  const setSideItem = useNavigationStore((state) => state.setSideItem);
  const downloadQueue = useDownloadStore((state) => state.queue);

  const releases = useMemo(
    () => buildReleases.filter((release) => release.guildId === guildId),
    [buildReleases, guildId],
  );
  const servers = useMemo(
    () => new Map(storeServers.map((server) => [server.id, server])),
    [storeServers],
  );
  const states = useMemo(
    () =>
      new Map(
        releases.map((release) => [
          release.id,
          guildBuildInstallState(release, builds),
        ]),
      ),
    [builds, releases],
  );

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    let items = releases.filter((release) => {
      const installState = states.get(release.id)!;
      if (status !== "all" && installState.state !== status) return false;
      if (!normalized) return true;
      const server = servers.get(release.serverId);
      return [
        release.name,
        release.version,
        release.dependencies.minecraft,
        release.dependencies.loader,
        server?.name ?? "",
      ].some((value) => value.toLowerCase().includes(normalized));
    });

    items = [...items].sort((left, right) => {
      if (sort === "name") return left.name.localeCompare(right.name);
      if (sort === "size") return right.sizes.downloadBytes - left.sizes.downloadBytes;
      return right.publishedAtIso.localeCompare(left.publishedAtIso);
    });

    if (latestOnly) {
      const seen = new Set<string>();
      items = items.filter((release) => {
        const key = `${release.serverId}:${release.buildId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    return items;
  }, [latestOnly, query, releases, servers, sort, states, status]);

  useEffect(() => {
    setPage(1);
    setNotice(null);
  }, [guildId, latestOnly, query, sort, status]);

  useEffect(() => {
    if (guildId) void hydrateGuildBuilds(guildId);
  }, [guildId, hydrateGuildBuilds]);

  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = results.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const selected =
    pageItems.find((release) => release.id === selectedId) ??
    pageItems[0] ??
    results[0];

  const activeDownload = useMemo(() => {
    if (installJobId) {
      return (
        downloadQueue.find(
          (item) => item.id === installJobId || item.jobId === installJobId,
        ) ?? null
      );
    }
    if (!selected) return null;
    return (
      downloadQueue.find(
        (item) =>
          (item.status === "active" || item.status === "queued") &&
          item.name === selected.name,
      ) ?? null
    );
  }, [downloadQueue, installJobId, selected]);

  const progressPct = activeDownload?.progress ?? (busy ? 2 : 0);
  const progressBytes = activeDownload?.downloadedBytes ?? 0;
  const progressTotal =
    activeDownload?.totalBytes ??
    selected?.sizes.downloadBytes ??
    0;
  const progressLabel = activeDownload
    ? `${activeDownload.phase || activeDownload.status} · ${activeDownload.name}`
    : busy
      ? "Resolving install manifest…"
      : null;

  useEffect(() => {
    if (!selected) return;
    // Refine heuristic sizes with manifest / Modrinth when a build is focused.
    if (selected.sizes.downloadBytes > 0 && !selected.sizes.estimated) return;
    let cancelled = false;
    void estimateGuildBuildSizes(selected, { allowModrinth: true })
      .then((sizes) => {
        if (cancelled) return;
        patchBuildReleaseSizes(selected.id, {
          downloadBytes: sizes.downloadBytes,
          installedBytes: sizes.installedBytes,
          estimated: sizes.estimated,
        });
      })
      .catch(() => {
        /* keep heuristic */
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.id, patchBuildReleaseSizes]);

  if (!releases.length) {
    return (
      <div className="cf-panel rounded-xl flex min-h-70 items-center justify-center text-[12px] text-text-muted">
        No build releases are published for this guild.
      </div>
    );
  }

  const primaryAction = () => {
    if (!selected || busy) return;
    const installState = states.get(selected.id)!;
    if (installState.state === "installing") return;
    if (installState.state === "installed") {
      setActiveBuild(managedInstanceIdForRelease(selected));
      goHomeBuilds();
      return;
    }

    setBusy(true);
    setInstallJobId(null);
    setNotice(
      installState.state === "update-available"
        ? `Syncing ${selected.name} ${selected.version}…`
        : `Installing ${selected.name} ${selected.version} (${formatBytes(selected.sizes.downloadBytes, selected.sizes.estimated)})…`,
    );

    void (async () => {
      try {
        if (installState.state === "update-available") {
          const id = managedInstanceIdForRelease(selected);
          const existing = builds.find((b) => b.id === id);
          if (existing?.managed) {
            await syncManagedBuild(id, { force: true, onJob: setInstallJobId });
          } else {
            await installGuildRelease(selected, { onJob: setInstallJobId });
          }
        } else {
          await installGuildRelease(selected, { onJob: setInstallJobId });
        }
        setNotice(`${selected.name} is installed and matches the guild catalog.`);
        setActiveBuild(managedInstanceIdForRelease(selected));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Guild build sync failed";
        setNotice(message);
        toast.error("Guild install failed", {
          description: message,
        });
      } finally {
        setBusy(false);
        setInstallJobId(null);
      }
    })();
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="font-sora text-[15px] font-bold text-text-primary">
          Server-ready builds
        </h3>
        <p className="mt-1 text-[10px] text-text-muted">
          Complete server-tailored environments. Worlds are always excluded.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(200px,1fr)_auto_auto]">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search builds, servers, versions…"
          className="rounded-lg border border-border-subtle bg-black/25 px-3 py-2 text-[10px] text-text-primary outline-none placeholder:text-text-disabled focus:border-primary-base/40"
        />
        <CfSelect
          value={status}
          onChange={(v) => setStatus(v as StatusFilter)}
          options={[
            { value: "all", label: "All states" },
            { value: "installed", label: "Installed" },
            { value: "installing", label: "Installing" },
            { value: "update-available", label: "Updates" },
            { value: "not-installed", label: "Not installed" },
          ]}
          aria-label="Filter by install state"
          className="min-w-[9.5rem]"
        />
        <CfSelect
          value={sort}
          onChange={(v) => setSort(v as SortMode)}
          options={[
            { value: "newest", label: "Newest" },
            { value: "name", label: "Name" },
            { value: "size", label: "Size" },
          ]}
          aria-label="Sort builds"
          className="min-w-[8rem]"
        />
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-pressed={latestOnly}
          onClick={() => setLatestOnly((value) => !value)}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-[9px] font-semibold cursor-pointer",
            latestOnly
              ? "border-primary-base/35 bg-primary-base/10 text-primary-base"
              : "border-border-subtle text-text-muted",
          )}
        >
          {latestOnly ? "Latest releases" : "All versions"}
        </button>
        <span className="text-[9px] text-text-disabled">
          {results.length} results · 20 per page
        </span>
      </div>

      {results.length ? (
        <div className="cf-panel grid min-h-130 overflow-hidden rounded-xl xl:h-140 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-b border-border-subtle xl:border-b-0 xl:border-r">
            <div className="min-h-0 flex-1 overflow-y-auto scroll-hidden p-1.5">
              <div className="flex flex-col gap-0.5">
                {pageItems.map((release) => (
                  <CompactReleaseRow
                    key={release.id}
                    release={release}
                    state={states.get(release.id)!}
                    selected={selected?.id === release.id}
                    serverName={servers.get(release.serverId)?.name ?? "Guild server"}
                    onSelect={() => {
                      setSelectedId(release.id);
                      setNotice(null);
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-border-subtle p-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="rounded-md border border-border-subtle px-2 py-1 text-[9px] text-text-muted disabled:opacity-35 cursor-pointer"
              >
                Previous
              </button>
              <span className="text-[9px] text-text-disabled">
                {currentPage} / {pageCount}
              </span>
              <button
                type="button"
                disabled={currentPage >= pageCount}
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                className="rounded-md border border-border-subtle px-2 py-1 text-[9px] text-text-muted disabled:opacity-35 cursor-pointer"
              >
                Next
              </button>
            </div>
          </aside>
          {selected && (
            <ReleaseDetail
              release={selected}
              state={states.get(selected.id)!}
              notice={notice}
              server={servers.get(selected.serverId)}
              busy={busy}
              progressPct={progressPct}
              progressLabel={progressLabel}
              progressBytes={progressBytes}
              progressTotal={progressTotal}
              onPrimaryAction={primaryAction}
              onDismissNotice={() => setNotice(null)}
            />
          )}
        </div>
      ) : (
        <div className="cf-panel rounded-xl p-10 text-center text-[11px] text-text-muted">
          No build releases match these filters.
        </div>
      )}
    </div>
  );
}
