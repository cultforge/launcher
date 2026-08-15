import { useEffect, useState, type ReactElement } from "react";
import { toast } from "sonner";
import { ModalShell } from "./ModalShell";
import {
  useBuildModalsStore,
  type BuildModalId,
} from "../../stores/buildModals";
import { useBuildStore, type BuildConfig } from "../../stores/build";
import { useBuildUiStore } from "../../stores/buildUi";
import { useNavigationStore } from "../../typlibs";
import { cn } from "../../lib/cn";
import {
  ensureBuildInstance,
  exportBuildPack,
  openInstanceFolder,
} from "../../lib/localContent";
import { logger } from "../../lib/logger";
import {
  createBuildBackup,
  listDisplayResolutions,
  type DuplicateIncludes,
} from "../../lib/buildMeta";
import { CfSelect } from "../ui/CfSelect";

const FALLBACK_RESOLUTIONS = ["1280x720", "1600x900", "1920x1080", "2560x1440"];

function FieldLabel({ children }: { children: string }) {
  return (
    <label className="text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
      {children}
    </label>
  );
}

function MemoryStepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(2, value - 1))}
          className="h-8 w-8 rounded-lg border border-white/10 text-text-secondary hover:bg-white/4 cursor-pointer"
        >
          −
        </button>
        <span className="flex-1 text-center text-[13px] font-semibold text-text-primary tabular-nums">
          {value} GB
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(16, value + 1))}
          className="h-8 w-8 rounded-lg border border-white/10 text-text-secondary hover:bg-white/4 cursor-pointer"
        >
          +
        </button>
      </div>
    </div>
  );
}

function CompactToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-4 w-full text-left px-2 py-3 rounded-lg hover:bg-white/3 cursor-pointer"
    >
      <span className="min-w-0">
        <span className="block text-[12px] text-text-primary font-medium">
          {label}
        </span>
        {description && (
          <span className="block text-[9px] text-text-muted mt-0.5">
            {description}
          </span>
        )}
      </span>
      <span
        className={cn(
          "relative h-5 w-9 rounded-full border transition-colors shrink-0",
          checked
            ? "bg-primary-base/30 border-primary-base/50"
            : "bg-white/6 border-white/12",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all",
            checked ? "left-4.5 bg-primary-base" : "left-0.5 bg-text-muted",
          )}
        />
      </span>
    </button>
  );
}

function CancelBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3.5 py-2 text-[11px] font-semibold rounded-lg border border-white/10 text-text-secondary hover:text-text-primary cursor-pointer"
    >
      Cancel
    </button>
  );
}

function PrimaryBtn({
  onClick,
  children,
  disabled = false,
}: {
  onClick: () => void;
  children: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="cf-btn-primary px-4 py-2 rounded-lg text-[12px] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function SettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const active = useBuildStore((s) => s.active());
  const setConfig = useBuildStore((s) => s.setConfig);
  const setActiveTab = useBuildUiStore((s) => s.setActiveTab);
  const setPrimaryTab = useNavigationStore((s) => s.setPrimaryTab);
  const [draft, setDraft] = useState<BuildConfig>(active.config);
  const [category, setCategory] = useState<"runtime" | "game" | "advanced">(
    "runtime",
  );
  const [resolutions, setResolutions] = useState<string[]>(FALLBACK_RESOLUTIONS);

  useEffect(() => {
    if (open) {
      setDraft(active.config);
      setCategory("runtime");
    }
  }, [open, active.id, active.config]);

  useEffect(() => {
    if (!open) return;
    void listDisplayResolutions()
      .then((info) => {
        const next = [...info.presets];
        if (active.config.resolution && !next.includes(active.config.resolution)) {
          next.unshift(active.config.resolution);
        }
        if (next.length) setResolutions(next);
      })
      .catch(() => undefined);
  }, [open, active.config.resolution]);

  const patch = (partial: Partial<BuildConfig>) =>
    setDraft((d) => ({ ...d, ...partial }));

  const onSave = () => {
    const next = {
      ...draft,
      memoryMinGb: Math.min(draft.memoryMinGb, draft.memoryMaxGb),
      memoryMaxGb: Math.max(draft.memoryMinGb, draft.memoryMaxGb),
    };
    setConfig(active.id, next);
    onClose();
  };

  const openConfigTab = () => {
    setPrimaryTab("Builds");
    setActiveTab("Configuration");
    onClose();
  };

  return (
    <ModalShell
      open={open}
      title="Edit Instance Settings"
      onClose={onClose}
      wide
      footer={
        <>
          <button
            type="button"
            onClick={openConfigTab}
            className="mr-auto px-3 py-2 text-[11px] font-semibold rounded-lg border border-white/10 text-text-muted hover:text-text-primary cursor-pointer"
          >
            Open Configuration tab
          </button>
          <CancelBtn onClick={onClose} />
          <PrimaryBtn onClick={onSave}>Save</PrimaryBtn>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] text-text-primary font-semibold truncate">
              {active.name}
            </div>
            <div className="text-[9px] text-text-muted mt-0.5">
              MC {active.mc} · {active.loader}
            </div>
          </div>
          <span className="text-[9px] uppercase tracking-[0.14em] text-primary-base shrink-0">
            Instance override
          </span>
        </div>

        <div className="grid grid-cols-[132px_minmax(0,1fr)] gap-3 min-h-70">
          <nav className="rounded-xl border border-white/8 bg-black/20 p-1.5 flex flex-col gap-1">
            {(
              [
                ["runtime", "Runtime", "Memory & Java"],
                ["game", "Game", "Display & launch"],
                ["advanced", "Advanced", "JVM & wrapper"],
              ] as const
            ).map(([id, label, description]) => (
              <button
                key={id}
                type="button"
                onClick={() => setCategory(id)}
                className={cn(
                  "px-3 py-2.5 rounded-lg border text-left cursor-pointer",
                  category === id
                    ? "border-primary-base/25 bg-primary-base/10"
                    : "border-transparent hover:bg-white/3",
                )}
              >
                <span
                  className={cn(
                    "block text-[11px] font-semibold",
                    category === id
                      ? "text-primary-base"
                      : "text-text-primary",
                  )}
                >
                  {label}
                </span>
                <span className="block text-[8px] text-text-disabled mt-0.5">
                  {description}
                </span>
              </button>
            ))}
          </nav>

          <section className="rounded-xl border border-white/8 bg-black/15 p-3.5 flex flex-col gap-4">
            {category === "runtime" && (
              <>
                <div>
                  <h3 className="font-sora text-[13px] font-bold text-text-primary">
                    Runtime
                  </h3>
                  <p className="text-[9px] text-text-muted mt-0.5">
                    Memory allocation and Java runtime.
                  </p>
                </div>
                <div className="rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2.5 flex items-center justify-between">
                  <div>
                    <FieldLabel>Java runtime</FieldLabel>
                    <div className="text-[12px] text-text-primary mt-1">
                      Java {active.java}
                    </div>
                  </div>
                  <span className="text-[9px] text-text-disabled">read-only</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <MemoryStepper
                    label="Memory min"
                    value={draft.memoryMinGb}
                    onChange={(v) => patch({ memoryMinGb: v })}
                  />
                  <MemoryStepper
                    label="Memory max"
                    value={draft.memoryMaxGb}
                    onChange={(v) => patch({ memoryMaxGb: v })}
                  />
                </div>
              </>
            )}

            {category === "game" && (
              <>
                <div>
                  <h3 className="font-sora text-[13px] font-bold text-text-primary">
                    Game
                  </h3>
                  <p className="text-[9px] text-text-muted mt-0.5">
                    Display and launcher behavior for this build.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Resolution</FieldLabel>
                  <CfSelect
                    value={draft.resolution}
                    onChange={(v) => patch({ resolution: v })}
                    options={resolutions.map((resolution) => ({
                      value: resolution,
                      label: resolution,
                    }))}
                    aria-label="Resolution"
                  />
                </div>
                <div className="divide-y divide-white/6">
                  <CompactToggle
                    label="Fullscreen"
                    checked={draft.fullscreen}
                    onChange={(value) => patch({ fullscreen: value })}
                  />
                  <CompactToggle
                    label="Minimize to tray on launch"
                    description="Hide CultForge to the tray and idle while the game runs"
                    checked={draft.closeOnLaunch}
                    onChange={(value) => patch({ closeOnLaunch: value })}
                  />
                </div>
              </>
            )}

            {category === "advanced" && (
              <>
                <div>
                  <h3 className="font-sora text-[13px] font-bold text-text-primary">
                    Advanced
                  </h3>
                  <p className="text-[9px] text-text-muted mt-0.5">
                    JVM flags, wrapper command, and GPU preference.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>JVM arguments</FieldLabel>
                  <textarea
                    value={draft.jvmArgs}
                    onChange={(e) => patch({ jvmArgs: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg text-[10px] font-mono bg-black/30 border border-white/10 text-text-primary outline-none focus:border-primary-base/40 resize-y"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Wrapper command</FieldLabel>
                  <input
                    type="text"
                    value={draft.wrapper}
                    onChange={(e) => patch({ wrapper: e.target.value })}
                    placeholder="Optional"
                    className="w-full px-3 py-2 rounded-lg text-[11px] bg-black/30 border border-white/10 text-text-primary placeholder:text-text-disabled outline-none focus:border-primary-base/40"
                  />
                </div>
                <CompactToggle
                  label="Dedicated GPU"
                  description="Prefer discrete graphics when available"
                  checked={draft.dedicatedGpu}
                  onChange={(value) => patch({ dedicatedGpu: value })}
                />
              </>
            )}
          </section>
        </div>
      </div>
    </ModalShell>
  );
}

function FolderModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const active = useBuildStore((s) => s.active());
  const patchBuild = useBuildStore((s) => s.patchBuild);
  const [copied, setCopied] = useState(false);
  const [path, setPath] = useState(active.location);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    setError(null);
    setBusy(false);
    let cancelled = false;
    void (async () => {
      let next = active.location.trim();
      if (!next && active.id !== "none") {
        try {
          const ensured = await ensureBuildInstance(active.id, active.loader);
          if (ensured?.path) {
            next = ensured.path;
            patchBuild(active.id, { location: ensured.path });
          }
        } catch {
          // keep empty
        }
      }
      if (!cancelled) setPath(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, active.id, active.loader, active.location, patchBuild]);

  const copyPath = async () => {
    if (!path) return;
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const onOpen = async () => {
    if (!path.trim()) {
      setError("Instance folder path is missing.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await openInstanceFolder(path);
      toast.success("Opened instance folder");
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error("Could not open folder", { description: msg });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      open={open}
      title="Open Folder"
      onClose={onClose}
      footer={
        <>
          <CancelBtn onClick={onClose} />
          <PrimaryBtn onClick={() => void onOpen()} disabled={busy || !path}>
            {busy ? "Opening…" : "Open"}
          </PrimaryBtn>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[12px] text-text-secondary">
          Instance folder for{" "}
          <span className="text-text-primary font-semibold">{active.name}</span>
        </p>
        <code className="block px-3 py-2.5 rounded-lg text-[11px] font-mono bg-black/40 border border-white/8 text-text-primary break-all">
          {path || "Preparing instance folder…"}
        </code>
        <button
          type="button"
          onClick={() => void copyPath()}
          disabled={!path}
          className="w-fit px-3 py-2 text-[11px] font-semibold rounded-lg border border-white/10 text-text-secondary hover:text-text-primary cursor-pointer disabled:opacity-40"
        >
          {copied ? "Copied" : "Copy path"}
        </button>
        {error && (
          <p className="text-[11px] text-state-error">{error}</p>
        )}
      </div>
    </ModalShell>
  );
}

function BackupModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const active = useBuildStore((s) => s.active());
  const [type, setType] = useState<"full" | "worlds">("full");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setType("full");
      setBusy(false);
    }
  }, [open]);

  const onCreate = async () => {
    setBusy(true);
    try {
      const info = await createBuildBackup(active.id, type === "worlds");
      const mb = (info.sizeBytes / (1024 * 1024)).toFixed(1);
      toast.success("Backup created", { description: `${mb} MB` });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Backup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      open={open}
      title="Create Backup"
      onClose={onClose}
      footer={
        <>
          <CancelBtn onClick={onClose} />
          <PrimaryBtn onClick={() => void onCreate()} disabled={busy}>
            {busy ? "Creating…" : "Create"}
          </PrimaryBtn>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[12px] text-text-secondary">
          Backup{" "}
          <span className="text-text-primary font-semibold">{active.name}</span>
        </p>
        <div className="flex flex-col gap-2">
          {(
            [
              { id: "full" as const, label: "Full instance" },
              { id: "worlds" as const, label: "Worlds only" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setType(opt.id)}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left cursor-pointer",
                type === opt.id
                  ? "border-primary-base/40 bg-primary-base/10"
                  : "border-white/10 hover:bg-white/3",
              )}
            >
              <span
                className={cn(
                  "h-3.5 w-3.5 rounded-full border shrink-0",
                  type === opt.id
                    ? "border-primary-base bg-primary-base"
                    : "border-white/30",
                )}
              />
              <span className="text-[13px] text-text-primary">{opt.label}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-text-muted">
          {type === "full"
            ? "Copies the instance (skips logs, natives, crash-reports). Keeps last 5."
            : "Zips only the saves/ folder. Keeps last 5."}
        </p>
      </div>
    </ModalShell>
  );
}

function ExportModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const active = useBuildStore((s) => s.active());
  const patchBuild = useBuildStore((s) => s.patchBuild);
  const [name, setName] = useState("");
  const [mods, setMods] = useState(true);
  const [config, setConfig] = useState(true);
  const [worlds, setWorlds] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(`${active.name} Pack`);
      setMods(true);
      setConfig(true);
      setWorlds(false);
      setBusy(false);
      setError(null);
    }
  }, [open, active.name]);

  const toggle = (
    label: string,
    value: boolean,
    set: (v: boolean) => void,
  ) => (
    <button
      type="button"
      onClick={() => set(!value)}
      className="flex items-center gap-2.5 py-2 cursor-pointer text-left w-full"
    >
      <span
        className={cn(
          "h-4 w-4 rounded border flex items-center justify-center text-[10px] shrink-0",
          value
            ? "border-primary-base bg-primary-base/20 text-primary-base"
            : "border-white/25 text-transparent",
        )}
      >
        ✓
      </span>
      <span className="text-[13px] text-text-primary">{label}</span>
    </button>
  );

  const onExport = async () => {
    if (!mods && !config && !worlds) {
      setError("Select at least one of Mods, Config, or Worlds.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!active.location) {
        const ensured = await ensureBuildInstance(active.id, active.loader);
        if (ensured?.path) {
          patchBuild(active.id, { location: ensured.path });
        }
      }
      const result = await exportBuildPack({
        buildId: active.id,
        packName: name.trim() || `${active.name} Pack`,
        includeMods: mods,
        includeConfig: config,
        includeWorlds: worlds,
      });
      const mb = (result.bytes / (1024 * 1024)).toFixed(2);
      logger.success(`Exported pack to ${result.path} (${mb} MB)`);
      toast.success("Pack exported", {
        description: `${mb} MB · ${result.path}`,
        action: {
          label: "Open folder",
          onClick: () => {
            const dir = result.path.replace(/[\\/][^\\/]+$/, "");
            void openInstanceFolder(dir).catch(() => {});
          },
        },
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error("Export failed", { description: msg });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      open={open}
      title="Export Pack"
      onClose={onClose}
      footer={
        <>
          <CancelBtn onClick={onClose} />
          <PrimaryBtn onClick={() => void onExport()} disabled={busy}>
            {busy ? "Exporting…" : "Export"}
          </PrimaryBtn>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Pack name</FieldLabel>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-[13px] bg-black/30 border border-white/10 text-text-primary outline-none focus:border-primary-base/40"
          />
        </div>
        <div className="flex flex-col divide-y divide-white/6">
          {toggle("Mods", mods, setMods)}
          {toggle("Config", config, setConfig)}
          {toggle("Worlds", worlds, setWorlds)}
        </div>
        {error && <p className="text-[11px] text-state-error">{error}</p>}
      </div>
    </ModalShell>
  );
}

function DuplicateModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const active = useBuildStore((s) => s.active());
  const duplicateBuild = useBuildStore((s) => s.duplicateBuild);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"full" | "custom">("full");
  const [mods, setMods] = useState(true);
  const [resourcepacks, setResourcepacks] = useState(true);
  const [shaderpacks, setShaderpacks] = useState(true);
  const [config, setConfigInc] = useState(true);
  const [worlds, setWorlds] = useState(true);

  useEffect(() => {
    if (open) {
      setName(`Copy of ${active.name}`);
      setBusy(false);
      setMode("full");
      setMods(true);
      setResourcepacks(true);
      setShaderpacks(true);
      setConfigInc(true);
      setWorlds(true);
    }
  }, [open, active.name]);

  const toggle = (
    label: string,
    value: boolean,
    set: (v: boolean) => void,
  ) => (
    <button
      type="button"
      onClick={() => set(!value)}
      className="flex items-center gap-2.5 py-2 cursor-pointer text-left w-full"
    >
      <span
        className={cn(
          "h-4 w-4 rounded border flex items-center justify-center text-[10px] shrink-0",
          value
            ? "border-primary-base bg-primary-base/20 text-primary-base"
            : "border-white/25 text-transparent",
        )}
      >
        ✓
      </span>
      <span className="text-[13px] text-text-primary">{label}</span>
    </button>
  );

  const onDuplicate = () => {
    if (active.managed) {
      toast.message("Cannot duplicate", {
        description: "Guild-managed builds can’t be duplicated.",
      });
      return;
    }
    const trimmed = name.trim() || `Copy of ${active.name}`;
    const includes: DuplicateIncludes =
      mode === "full"
        ? {
            full: true,
            mods: true,
            resourcepacks: true,
            shaderpacks: true,
            config: true,
            worlds: true,
          }
        : {
            full: false,
            mods,
            resourcepacks,
            shaderpacks,
            config,
            worlds,
          };
    setBusy(true);
    try {
      const id = duplicateBuild(active.id, trimmed, includes);
      toast.success("Build duplicated", {
        description: `Created ${trimmed}`,
      });
      logger.info(`Duplicated build ${active.id} → ${id}`);
      onClose();
    } catch (err) {
      toast.error("Duplicate failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      open={open}
      title="Duplicate Build"
      onClose={onClose}
      footer={
        <>
          <CancelBtn onClick={onClose} />
          <PrimaryBtn onClick={onDuplicate} disabled={busy}>
            {busy ? "Duplicating…" : "Duplicate"}
          </PrimaryBtn>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[12px] text-text-secondary">
          Clone{" "}
          <span className="text-text-primary font-semibold">{active.name}</span>{" "}
          into a new instance.
        </p>
        <div className="flex flex-col gap-1.5">
          <FieldLabel>New name</FieldLabel>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-[13px] bg-black/30 border border-white/10 text-text-primary outline-none focus:border-primary-base/40"
          />
        </div>
        <div className="flex gap-2">
          {(
            [
              ["full", "Full clone"],
              ["custom", "Custom"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={cn(
                "flex-1 px-3 py-2 rounded-lg border text-[12px] cursor-pointer",
                mode === id
                  ? "border-primary-base/40 bg-primary-base/10 text-primary-base"
                  : "border-white/10 text-text-secondary",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === "custom" && (
          <div className="flex flex-col divide-y divide-white/6">
            {toggle("Mods", mods, setMods)}
            {toggle("Resource packs", resourcepacks, setResourcepacks)}
            {toggle("Shaders", shaderpacks, setShaderpacks)}
            {toggle("Config", config, setConfigInc)}
            {toggle("Worlds", worlds, setWorlds)}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function AddModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const setPrimaryTab = useNavigationStore((s) => s.setPrimaryTab);
  const setSideItem = useNavigationStore((s) => s.setSideItem);

  return (
    <ModalShell open={open} onClose={onClose} title="Add Minecraft version">
      <p className="text-[12px] text-text-secondary leading-relaxed">
        Install a vanilla Minecraft version from Mojang, then link it to a CultForge build.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-white/10 px-4 py-2 text-[11px] font-semibold text-text-secondary hover:bg-white/6 cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            setPrimaryTab("Builds");
            setSideItem("Builds");
            onClose();
          }}
          className="cf-btn-primary rounded-lg px-4 py-2 text-[11px] font-semibold cursor-pointer"
        >
          Open Builds catalog
        </button>
      </div>
    </ModalShell>
  );
}

const MODAL_MAP: Record<
  BuildModalId,
  (p: { open: boolean; onClose: () => void }) => ReactElement
> = {
  settings: SettingsModal,
  folder: FolderModal,
  backup: BackupModal,
  export: ExportModal,
  duplicate: DuplicateModal,
  add: AddModal,
};

export function BuildActionModalsHost() {
  const open = useBuildModalsStore((s) => s.open);
  const closeModal = useBuildModalsStore((s) => s.closeModal);

  return (
    <>
      {(Object.keys(MODAL_MAP) as BuildModalId[]).map((id) => {
        const Modal = MODAL_MAP[id];
        return (
          <Modal key={id} open={open === id} onClose={closeModal} />
        );
      })}
    </>
  );
}
