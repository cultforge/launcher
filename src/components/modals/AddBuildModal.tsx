import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ModalShell } from "./ModalShell";
import { useBuildModalsStore } from "../../stores/buildModals";
import { useBuildStore } from "../../stores/build";
import { logger } from "../../lib/logger";
import {
  installMojangVersion,
  listMojangVersions,
  type MojangVersionInfo,
} from "../../lib/mojangInstall";
import {
  CLIENT_LOADERS,
  installLoaderBuild,
  listLoaderVersions,
  loaderLabel,
  sortLoaderVersions,
  type ClientLoader,
  type LoaderKind,
  type LoaderVersionInfo,
} from "../../lib/loaderInstall";
import { javaMajorFromMinecraft } from "../../lib/javaRuntime";
import { cn } from "../../lib/cn";

type KindFilter = "release" | "snapshot" | "all";

function formatReleaseTime(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso || "";
  return new Date(t).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function AddBuildModal() {
  const open = useBuildModalsStore((s) => s.open === "add");
  const closeModal = useBuildModalsStore((s) => s.closeModal);
  const hydrate = useBuildStore((s) => s.hydrate);
  const setActive = useBuildStore((s) => s.setActive);

  const [versions, setVersions] = useState<MojangVersionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("release");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loader, setLoader] = useState<LoaderKind>("vanilla");
  const [loaderQuery, setLoaderQuery] = useState("");
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersionInfo[]>([]);
  const [loaderLoading, setLoaderLoading] = useState(false);
  const [loaderError, setLoaderError] = useState<string | null>(null);
  const [selectedLoaderVersion, setSelectedLoaderVersion] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setKind("release");
    setSelectedId(null);
    setError(null);
    setLoader("vanilla");
    setLoaderQuery("");
    setLoaderVersions([]);
    setLoaderError(null);
    setSelectedLoaderVersion(null);
    setLoading(true);
    void listMojangVersions()
      .then((rows) => {
        setVersions(rows);
        const latest = rows.find((row) => row.latestRelease) ?? rows[0];
        setSelectedId(latest?.id ?? null);
      })
      .catch((err) => {
        const message =
          err instanceof Error ? err.message : "Could not load Mojang versions.";
        setError(message);
        logger.error(`Mojang catalog failed: ${message}`);
      })
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open || loader === "vanilla" || !selectedId) {
      setLoaderVersions([]);
      setLoaderError(null);
      setSelectedLoaderVersion(null);
      setLoaderLoading(false);
      return;
    }
    let cancelled = false;
    setLoaderLoading(true);
    setLoaderError(null);
    setSelectedLoaderVersion(null);
    setLoaderVersions([]);
    void listLoaderVersions(loader as ClientLoader, selectedId)
      .then((rows) => {
        if (cancelled) return;
        const sorted = sortLoaderVersions(rows);
        setLoaderVersions(sorted);
        const pick =
          sorted.find((row) => row.recommended) ??
          sorted.find((row) => row.latest) ??
          sorted.find((row) => row.stable) ??
          sorted[0];
        setSelectedLoaderVersion(pick?.version ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : `Could not load ${loaderLabel(loader)} versions.`;
        setLoaderError(message);
        logger.error(`${loaderLabel(loader)} catalog failed: ${message}`);
      })
      .finally(() => {
        if (!cancelled) setLoaderLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, loader, selectedId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return versions.filter((row) => {
      if (kind === "release" && row.type !== "release") return false;
      if (kind === "snapshot" && row.type === "release") return false;
      if (q && !row.id.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [versions, query, kind]);

  const filteredLoaderVersions = useMemo(() => {
    const q = loaderQuery.trim().toLowerCase();
    if (!q) return loaderVersions;
    return loaderVersions.filter((row) =>
      row.version.toLowerCase().includes(q),
    );
  }, [loaderVersions, loaderQuery]);

  const selected =
    filtered.find((row) => row.id === selectedId) ??
    versions.find((row) => row.id === selectedId) ??
    null;

  const canCreate =
    !!selected &&
    !installing &&
    !loading &&
    (loader === "vanilla" ||
      (!!selectedLoaderVersion && !loaderLoading && !loaderError));

  const onInstall = () => {
    if (!selected || installing) return;
    if (loader !== "vanilla" && !selectedLoaderVersion) return;
    setInstalling(true);
    const javaMajor = javaMajorFromMinecraft(selected.id);
    if (loader === "vanilla") {
      toast.message(`Installing Minecraft ${selected.id}…`, {
        description: "Client, libraries, and assets from Mojang.",
      });
      void installMojangVersion(selected.id)
        .then(async (result) => {
          logger.success(
            `Minecraft ${result.versionId} installed (${result.downloadedFiles} new, ${result.skippedFiles} cached)`,
          );
          await hydrate();
          setActive(result.versionId);
          toast.success(`Build ${result.versionId} ready`, {
            description: result.javaMajor
              ? `Instance created · Java ${result.javaMajor}`
              : "Instance created from Mojang assets.",
          });
          closeModal();
        })
        .catch((err) => {
          const message =
            err instanceof Error ? err.message : "Install failed.";
          logger.error(`Mojang install failed: ${message}`);
          toast.error("Could not add build", { description: message });
        })
        .finally(() => setInstalling(false));
      return;
    }

    const label = loaderLabel(loader);
    toast.message(`Installing ${label} ${selectedLoaderVersion}…`, {
      description: `Vanilla ${selected.id} first, then ${label}. Java ${javaMajor}.`,
    });
    void installLoaderBuild(
      selected.id,
      loader as ClientLoader,
      selectedLoaderVersion!,
    )
      .then(async (result) => {
        logger.success(
          `${result.loader} ${result.versionId} installed (${result.downloadedFiles} new, ${result.skippedFiles} cached)`,
        );
        await hydrate();
        setActive(result.versionId);
        toast.success(`Build ${result.versionId} ready`, {
          description: result.javaMajor
            ? `${result.loader} instance · Java ${result.javaMajor}`
            : `${result.loader} instance created.`,
        });
        closeModal();
      })
      .catch((err) => {
        const message =
          err instanceof Error ? err.message : "Install failed.";
        logger.error(`${label} install failed: ${message}`);
        toast.error("Could not add build", { description: message });
      })
      .finally(() => setInstalling(false));
  };

  const footerHint = (() => {
    if (!selected) return "Pick a Minecraft version from Mojang.";
    const java = `Java ${javaMajorFromMinecraft(selected.id)}`;
    if (loader === "vanilla") {
      return `${selected.id} · Vanilla · ${java}`;
    }
    if (loaderLoading) {
      return `${selected.id} · ${loaderLabel(loader)} · loading versions…`;
    }
    if (selectedLoaderVersion) {
      return `${selected.id} · ${loaderLabel(loader)} ${selectedLoaderVersion} · ${java}`;
    }
    return `${selected.id} · ${loaderLabel(loader)} · pick a loader version`;
  })();

  return (
    <ModalShell
      open={open}
      title="Add build"
      onClose={installing ? () => undefined : closeModal}
      confirmClose={!installing}
      confirmCloseMessage="Close add-build dialog? Progress will be discarded."
      wide
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] text-text-muted min-w-0 truncate">
            {footerHint}
          </p>
          <button
            type="button"
            disabled={!canCreate}
            onClick={onInstall}
            className="cf-btn-primary rounded-lg px-4 py-2 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
          >
            {installing ? "Installing…" : "Create instance"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 min-h-0">
        <p className="text-[11px] text-text-muted">
          Downloads the official client into{" "}
          <span className="font-mono text-text-secondary">.minecraft</span>,
          optionally installs Forge, NeoForge, Fabric, or Quilt, then creates a
          CultForge instance. Worlds stay local to that instance.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {CLIENT_LOADERS.map((row) => {
            const active = loader === row.id;
            return (
              <button
                key={row.id}
                type="button"
                disabled={installing}
                onClick={() => {
                  setLoader(row.id);
                  setLoaderQuery("");
                }}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[11px] font-semibold cursor-pointer border",
                  active
                    ? "border-primary-base/50 bg-primary-base/15 text-text-primary"
                    : "border-white/10 bg-black/20 text-text-muted hover:text-text-secondary hover:bg-white/5",
                )}
              >
                {row.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Minecraft versions…"
            className="flex-1 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-[12px] text-text-primary outline-none focus:border-primary-base/45"
          />
          <div className="flex rounded-lg border border-white/10 p-0.5">
            {(["release", "snapshot", "all"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setKind(value)}
                className={cn(
                  "px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider rounded-md cursor-pointer",
                  kind === value
                    ? "bg-white/10 text-text-primary"
                    : "text-text-muted hover:text-text-secondary",
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        {error ? (
          <p className="text-[11px] text-state-error">{error}</p>
        ) : loading ? (
          <p className="text-[11px] text-text-muted py-8 text-center">
            Loading Mojang catalog…
          </p>
        ) : (
          <div
            className={cn(
              "overflow-y-auto rounded-xl border border-white/8",
              loader === "vanilla"
                ? "max-h-[min(48vh,360px)]"
                : "max-h-[min(28vh,220px)]",
            )}
          >
            {filtered.length === 0 ? (
              <p className="px-3 py-8 text-center text-[11px] text-text-muted">
                No versions match that filter.
              </p>
            ) : (
              filtered.map((row) => {
                const active = row.id === selectedId;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className={cn(
                      "w-full flex items-center justify-between gap-3 px-3 py-2 text-left border-b border-white/6 last:border-0 cursor-pointer",
                      active ? "bg-primary-base/12" : "hover:bg-white/4",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-text-primary truncate">
                        {row.id}
                        {row.latestRelease ? (
                          <span className="ml-2 text-[9px] uppercase tracking-wider text-primary-base">
                            Latest
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[10px] text-text-muted">
                        {row.type} · {formatReleaseTime(row.releaseTime)}
                      </div>
                    </div>
                    <span className="text-[10px] text-text-disabled shrink-0">
                      Java {javaMajorFromMinecraft(row.id)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
        {loader !== "vanilla" ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-text-secondary">
                {loaderLabel(loader)} version
              </p>
              <input
                value={loaderQuery}
                onChange={(event) => setLoaderQuery(event.target.value)}
                placeholder="Search loader versions…"
                className="w-[min(100%,220px)] rounded-lg border border-white/10 bg-black/25 px-3 py-1.5 text-[11px] text-text-primary outline-none focus:border-primary-base/45"
              />
            </div>
            {loaderError ? (
              <p className="text-[11px] text-state-error">{loaderError}</p>
            ) : loaderLoading ? (
              <p className="text-[11px] text-text-muted py-6 text-center">
                Loading {loaderLabel(loader)} versions for {selectedId}…
              </p>
            ) : (
              <div className="max-h-[min(28vh,220px)] overflow-y-auto rounded-xl border border-white/8">
                {filteredLoaderVersions.length === 0 ? (
                  <p className="px-3 py-8 text-center text-[11px] text-text-muted">
                    No {loaderLabel(loader)} builds for {selectedId}.
                  </p>
                ) : (
                  filteredLoaderVersions.map((row) => {
                    const active = row.version === selectedLoaderVersion;
                    return (
                      <button
                        key={row.version}
                        type="button"
                        onClick={() => setSelectedLoaderVersion(row.version)}
                        className={cn(
                          "w-full flex items-center justify-between gap-3 px-3 py-2 text-left border-b border-white/6 last:border-0 cursor-pointer",
                          active ? "bg-primary-base/12" : "hover:bg-white/4",
                        )}
                      >
                        <span className="text-[12px] font-semibold text-text-primary truncate">
                          {row.version}
                        </span>
                        <span className="flex items-center gap-1.5 shrink-0 text-[9px] uppercase tracking-wider">
                          {row.recommended ? (
                            <span className="text-primary-base">Recommended</span>
                          ) : null}
                          {row.latest && !row.recommended ? (
                            <span className="text-text-secondary">Latest</span>
                          ) : null}
                          {row.stable && !row.recommended && !row.latest ? (
                            <span className="text-text-muted">Stable</span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </ModalShell>
  );
}
