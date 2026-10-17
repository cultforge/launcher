import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useGuildModalsStore } from "../../../stores/guildModals";
import { useGuildStore } from "../../../stores/guilds";
import {
  backfillGuildBuildInstallManifests,
  refreshGuildBuildInstallManifest,
} from "../../../lib/guildBuildApi";

function formatMib(bytes: number) {
  if (!bytes) return "—";
  return `${Math.round((bytes / 1024 ** 2) * 10) / 10} MiB`;
}

export function ManageBuilds() {
  const guildId = useGuildStore((state) => state.activeGuildId);
  const builds = useGuildStore((state) => state.buildReleases);
  const hydrateGuildBuilds = useGuildStore((state) => state.hydrateGuildBuilds);
  const servers = useGuildStore((state) => state.servers);
  const deleteBuildRelease = useGuildStore((state) => state.deleteBuildRelease);
  const open = useGuildModalsStore((state) => state.open);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const rows = builds.filter((release) => release.guildId === guildId);
  const serverName = (id: string) =>
    id ? (servers.find((server) => server.id === id)?.name ?? id) : "—";

  useEffect(() => {
    if (guildId) void hydrateGuildBuilds(guildId);
  }, [guildId, hydrateGuildBuilds]);

  const onRefreshManifest = async (buildId: string, name: string) => {
    setBusyId(`manifest-${buildId}`);
    try {
      const { manifest, unresolved } = await refreshGuildBuildInstallManifest(
        guildId,
        buildId,
      );
      if (unresolved.length) {
        toast.message(`Install plan has ${unresolved.length} unresolved pin(s)`, {
          description: unresolved
            .slice(0, 3)
            .map(
              (u) =>
                `${u.slug || u.name || "?"}${u.version ? `@${u.version}` : ""}${
                  u.reason ? `: ${u.reason}` : ""
                }`,
            )
            .join(" · "),
        });
      } else {
        toast.success(`Manifest refreshed for ${name}`, {
          description: `${manifest.files.length} files ready for install.`,
        });
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not refresh install manifest",
      );
    } finally {
      setBusyId(null);
    }
  };

  const onBackfill = async () => {
    setBackfilling(true);
    try {
      await backfillGuildBuildInstallManifests(guildId, { force: false });
      toast.success("Install manifests backfill started", {
        description: "Published builds without a manifest will be resolved.",
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not backfill manifests",
      );
    } finally {
      setBackfilling(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-sora text-[14px] font-bold text-text-primary">
            Builds
          </h3>
          <p className="text-[10px] text-text-muted">
            Live guild catalog on guilds.cultforge.com. Install uses the server
            install-manifest (with Modrinth fallback).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={backfilling || rows.length === 0}
            onClick={() => void onBackfill()}
            className="rounded-lg border border-border-subtle px-3 py-2 text-[10px] text-text-secondary cursor-pointer disabled:opacity-40"
          >
            {backfilling ? "Backfilling…" : "Backfill manifests"}
          </button>
          <button
            type="button"
            onClick={() => open("build")}
            className="cf-btn-primary rounded-lg px-3 py-2 text-[10px] font-semibold cursor-pointer"
          >
            Add release
          </button>
        </div>
      </div>
      <div className="cf-panel overflow-hidden rounded-xl">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[11px] text-text-muted">
            No published builds.
          </p>
        ) : (
          <table className="w-full text-left">
            <thead className="border-b border-border-subtle text-[8px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Release</th>
                <th className="px-3 py-2 font-medium">Server</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((release) => (
                <tr
                  key={release.id}
                  className="border-b border-border-subtle/60 last:border-0"
                >
                  <td className="px-3 py-2">
                    <div className="text-[11px] text-text-primary">
                      {release.name}
                    </div>
                    <div className="text-[9px] text-text-muted">
                      v{release.version} · {release.dependencies.minecraft} ·{" "}
                      {release.dependencies.loader}
                      {release.sizes.downloadBytes
                        ? ` · ${formatMib(release.sizes.downloadBytes)}${
                            release.sizes.estimated ? " est." : ""
                          }`
                        : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[10px] text-text-secondary">
                    {serverName(release.serverId)}
                  </td>
                  <td className="px-3 py-2 text-[10px] text-text-muted">
                    {release.isPublished === false ? "Draft" : "Published"}
                    {release.isFeatured ? " · Featured" : ""}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      disabled={busyId === `manifest-${release.id}`}
                      onClick={() =>
                        void onRefreshManifest(release.id, release.name)
                      }
                      className="mr-2 text-[9px] text-text-secondary cursor-pointer disabled:opacity-40"
                    >
                      {busyId === `manifest-${release.id}`
                        ? "…"
                        : "Refresh install plan"}
                    </button>
                    <button
                      type="button"
                      onClick={() => open("build", release.id)}
                      className="mr-2 text-[9px] text-primary-base cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busyId === release.id}
                      onClick={() => {
                        setBusyId(release.id);
                        void deleteBuildRelease(guildId, release.id)
                          .then((result) => {
                            if (result.ok) toast.success(result.message);
                            else toast.error(result.message);
                          })
                          .finally(() => setBusyId(null));
                      }}
                      className="text-[9px] text-state-error cursor-pointer disabled:opacity-40"
                    >
                      {busyId === release.id ? "…" : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
