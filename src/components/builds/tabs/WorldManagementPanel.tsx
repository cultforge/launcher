import { useEffect, useMemo, useState } from "react";
import { Chip } from "@heroui/react";
import { toast } from "sonner";
import { Icon } from "../../ico";
import { AppIcons } from "../../icons";
import { worldItemFrom, type WorldItem } from "../../../data/buildContent";
import { useBuildStore } from "../../../stores/build";
import { useLibraryContentStore } from "../../../stores/libraryContent";
import { cn } from "../../../lib/cn";
import { createBuildBackup, openInstanceSubdir } from "../../../lib/buildMeta";
import { ImportUrlModal } from "../../modals/ImportUrlModal";
import { ManagedBuildBanner } from "./ManagedBuildBanner";
import {
  importWorldFromFolder,
  importWorldFromUrl,
  importWorldFromZip,
  isImportCancelled,
  toastWorldImport,
} from "../../../lib/contentImport";

function hasValue(value: string | undefined): boolean {
  return Boolean(value && value !== "—");
}

function joinMeta(parts: Array<string | undefined>): string {
  return parts.filter(hasValue).join(" · ");
}

function WorldListItem({
  world,
  selected,
  onSelect,
}: {
  world: WorldItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left px-3 py-2.5 rounded-lg cursor-pointer transition-colors flex items-center gap-2.5",
        selected ? "bg-primary-base/10" : "hover:bg-bg-elevated",
      )}
    >
      {world.image ? (
        <img
          src={world.image}
          alt=""
          className="h-9 w-9 rounded-lg shrink-0 border border-border-subtle object-cover"
        />
      ) : (
        <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 border border-border-subtle bg-white/4 text-text-secondary">
          <Icon icon={AppIcons.Worlds} size={15} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-text-primary truncate">
          {world.name}
        </div>
        <div className="text-[10px] text-text-muted mt-0.5 truncate">
          {joinMeta([world.mode, world.lastPlayed, world.size])}
        </div>
      </div>
    </button>
  );
}

function WorldImportBar({
  managed,
  onFolder,
  onZip,
  onUrl,
}: {
  managed: boolean;
  onFolder: () => void;
  onZip: () => void;
  onUrl: () => void;
}) {
  if (managed) return <ManagedBuildBanner />;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onFolder}
        className="cf-btn-primary px-3.5 py-2 rounded-lg text-[11px] cursor-pointer"
      >
        Import folder
      </button>
      <button
        type="button"
        onClick={onZip}
        className="px-3 py-2 text-[11px] font-semibold rounded-lg border border-white/10 text-text-secondary hover:text-text-primary cursor-pointer"
      >
        Import zip
      </button>
      <button
        type="button"
        onClick={onUrl}
        className="px-3 py-2 text-[11px] font-semibold rounded-lg border border-white/10 text-text-secondary hover:text-text-primary cursor-pointer"
      >
        Import URL
      </button>
    </div>
  );
}

export function WorldManagementPanel() {
  const buildId = useBuildStore((s) => s.activeId);
  const managed = useBuildStore((s) => s.active().managed);
  const buildMc = useBuildStore((s) => s.active().mc);
  const buildLoader = useBuildStore((s) => s.active().loader);
  const location = useBuildStore((s) => s.active().location);
  const items = useLibraryContentStore((s) => s.items);
  const scanning = useLibraryContentStore((s) => s.scanning);
  const scan = useLibraryContentStore((s) => s.scan);
  const worlds = useMemo(
    () =>
      items
        .filter((item) => item.kind === "world")
        .map((item) => worldItemFrom(item, buildId)),
    [items, buildId],
  );
  const [selectedId, setSelectedId] = useState(worlds[0]?.id ?? "");
  const [copied, setCopied] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);

  useEffect(() => {
    if (location) void scan(location);
  }, [location, scan]);

  useEffect(() => {
    if (!worlds.some((world) => world.id === selectedId)) {
      setSelectedId(worlds[0]?.id ?? "");
    }
  }, [worlds, selectedId]);

  const selected = worlds.find((w) => w.id === selectedId) ?? worlds[0];
  const canCopySeed = hasValue(selected?.seed);

  const worldCompatLine = (world: WorldItem): string | null => {
    if (!hasValue(world.mcVersion) || !buildMc?.trim()) return null;
    if (world.mcVersion === buildMc) {
      return `Matches active build (${buildLoader || "MC"} ${buildMc}).`;
    }
    return `World reports Minecraft ${world.mcVersion}; active build is ${buildLoader || "unknown"} ${buildMc}.`;
  };

  const runImport = async (fn: () => Promise<unknown>) => {
    try {
      const result = await fn();
      if (result && typeof result === "object" && "worldName" in result) {
        toastWorldImport(result as Parameters<typeof toastWorldImport>[0]);
      }
    } catch (err) {
      if (!isImportCancelled(err)) {
        toast.error(err instanceof Error ? err.message : "Import failed");
      }
    }
  };

  const copySeed = async () => {
    if (!selected || !canCopySeed) return;
    try {
      await navigator.clipboard.writeText(selected.seed);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error("Could not copy seed");
    }
  };

  if (worlds.length === 0) {
    return (
      <>
        <div className="cf-panel rounded-xl flex flex-col items-center justify-center gap-4 min-h-55 px-4 py-8">
          <p className="text-[13px] text-text-muted">
            {scanning ? "Reading worlds…" : "No worlds in this build"}
          </p>
          <WorldImportBar
            managed={managed}
            onFolder={() => void runImport(importWorldFromFolder)}
            onZip={() => void runImport(importWorldFromZip)}
            onUrl={() => setUrlOpen(true)}
          />
        </div>
        <ImportUrlModal
          open={urlOpen}
          title="Import world from URL"
          onClose={() => setUrlOpen(false)}
          onSubmit={async (url) => {
            toastWorldImport(await importWorldFromUrl(url));
          }}
        />
      </>
    );
  }

  const compat = selected ? worldCompatLine(selected) : null;

  return (
    <>
      <div className="flex flex-col gap-3">
        <WorldImportBar
          managed={managed}
          onFolder={() => void runImport(importWorldFromFolder)}
          onZip={() => void runImport(importWorldFromZip)}
          onUrl={() => setUrlOpen(true)}
        />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-80">
          <aside className="lg:col-span-4 cf-panel rounded-xl p-1.5 flex flex-col gap-0.5">
            <div className="px-2.5 py-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              Worlds ({worlds.length})
            </div>
            {worlds.map((w) => (
              <WorldListItem
                key={w.id}
                world={w}
                selected={selected?.id === w.id}
                onSelect={() => setSelectedId(w.id)}
              />
            ))}
          </aside>

          {selected && (
            <section className="lg:col-span-8 cf-panel rounded-xl p-4 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-sora text-[16px] font-bold text-text-primary truncate">
                    {selected.name}
                  </h3>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    {joinMeta([
                      `Last played ${selected.lastPlayed}`,
                      selected.size,
                    ])}
                  </p>
                  {compat && (
                    <p
                      className={cn(
                        "text-[11px] mt-1.5",
                        hasValue(selected.mcVersion) &&
                          selected.mcVersion !== buildMc
                          ? "text-amber-400/90"
                          : "text-text-muted",
                      )}
                    >
                      {compat}
                    </p>
                  )}
                </div>
                {selected.image ? (
                  <img
                    src={selected.image}
                    alt=""
                    className="h-14 w-14 rounded-lg shrink-0 border border-border-subtle object-cover"
                  />
                ) : (
                  <Icon
                    icon={AppIcons.Worlds}
                    size={20}
                    className="text-text-muted shrink-0"
                  />
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                  Seed
                </span>
                <div className="flex items-center gap-2">
                  <code className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-black/30 border border-white/8 text-[12px] font-mono text-text-primary truncate">
                    {selected.seed}
                  </code>
                  <button
                    type="button"
                    onClick={copySeed}
                    disabled={!canCopySeed}
                    className="shrink-0 px-3 py-2 text-[11px] font-semibold rounded-lg border border-white/10 text-text-secondary hover:text-text-primary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <Chip size="sm" variant="soft" color="default">
                  <Chip.Label>{selected.mode}</Chip.Label>
                </Chip>
                <Chip size="sm" variant="soft" color="default">
                  <Chip.Label>{selected.difficulty}</Chip.Label>
                </Chip>
                <Chip size="sm" variant="soft" color="default">
                  <Chip.Label>
                    Cheats {selected.cheats ? "on" : "off"}
                  </Chip.Label>
                </Chip>
                {hasValue(selected.mcVersion) && (
                  <Chip size="sm" variant="soft" color="default">
                    <Chip.Label>MC {selected.mcVersion}</Chip.Label>
                  </Chip>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-3 text-[12px]">
                <div>
                  <dt className="text-[9px] uppercase tracking-[0.14em] text-text-muted">
                    Spawn
                  </dt>
                  <dd className="text-text-primary font-mono mt-0.5">
                    {selected.spawn}
                  </dd>
                </div>
                <div>
                  <dt className="text-[9px] uppercase tracking-[0.14em] text-text-muted">
                    Size on disk
                  </dt>
                  <dd className="text-text-primary mt-0.5">{selected.size}</dd>
                </div>
              </dl>

              <div className="flex flex-wrap gap-2 mt-auto pt-2">
                <button
                  type="button"
                  onClick={() => {
                    void openInstanceSubdir(buildId, "saves").catch((err) => {
                      toast.error(
                        err instanceof Error
                          ? err.message
                          : "Could not open folder",
                      );
                    });
                  }}
                  className="px-3.5 py-2 text-[11px] font-semibold rounded-lg border border-white/10 text-text-secondary hover:text-text-primary cursor-pointer"
                >
                  Open folder
                </button>
                <button
                  type="button"
                  disabled={backingUp}
                  onClick={() => {
                    setBackingUp(true);
                    void createBuildBackup(buildId, true)
                      .then((info) => {
                        const mb = (info.sizeBytes / (1024 * 1024)).toFixed(1);
                        toast.success("Worlds backup created", {
                          description: `${mb} MB`,
                        });
                      })
                      .catch((err) => {
                        toast.error(
                          err instanceof Error ? err.message : "Backup failed",
                        );
                      })
                      .finally(() => setBackingUp(false));
                  }}
                  className="cf-btn-primary px-3.5 py-2 rounded-lg text-[11px] cursor-pointer disabled:opacity-50"
                >
                  {backingUp ? "Backing up…" : "Backup world"}
                </button>
                <button
                  type="button"
                  disabled
                  className="px-3.5 py-2 text-[11px] font-semibold rounded-lg border border-white/8 text-text-disabled cursor-not-allowed opacity-50"
                  title="Confirm"
                >
                  Delete
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
      <ImportUrlModal
        open={urlOpen}
        title="Import world from URL"
        onClose={() => setUrlOpen(false)}
        onSubmit={async (url) => {
          toastWorldImport(await importWorldFromUrl(url));
        }}
      />
    </>
  );
}
