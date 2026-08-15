import { useEffect, useMemo, useState } from "react";
import { Chip } from "@heroui/react";
import { toast } from "sonner";
import {
  DEFAULT_BUILD_CONFIG,
  useBuildStore,
  type BuildConfig,
} from "../../../stores/build";
import { useLibraryContentStore } from "../../../stores/libraryContent";
import {
  writeMinecraftOptions,
  type OptionsEntry,
} from "../../../lib/localContent";
import {
  enumOptionsForKey,
  getOptionValue,
  humanizeOptionKey,
  inferOptionControl,
  parseResourcePacksList,
  serializeResourcePacksList,
  setEntriesKey,
} from "../../../lib/minecraftOptions";
import { cn } from "../../../lib/cn";
import { listDisplayResolutions } from "../../../lib/buildMeta";
import { CfSelect } from "../../ui/CfSelect";

const FALLBACK_RESOLUTIONS = ["1280x720", "1600x900", "1920x1080", "2560x1440"];

function FieldLabel({ children }: { children: string }) {
  return (
    <label className="text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
      {children}
    </label>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 w-full text-left py-2 cursor-pointer"
    >
      <div className="min-w-0">
        <div className="text-[13px] text-text-primary font-medium">{label}</div>
        {description && (
          <div className="text-[10px] text-text-muted mt-0.5">{description}</div>
        )}
      </div>
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
            checked
              ? "left-4.5 bg-primary-base"
              : "left-0.5 bg-text-muted",
          )}
        />
      </span>
    </button>
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
        <span className="min-w-10 text-center text-[13px] text-text-primary font-medium">
          {value} GB
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(64, value + 1))}
          className="h-8 w-8 rounded-lg border border-white/10 text-text-secondary hover:bg-white/4 cursor-pointer"
        >
          +
        </button>
      </div>
    </div>
  );
}

function OptionControl({
  entry,
  shaderNames,
  onChange,
}: {
  entry: OptionsEntry;
  shaderNames: string[];
  onChange: (value: string) => void;
}) {
  const kind = inferOptionControl(entry.key, entry.value);
  const enums = enumOptionsForKey(entry.key);

  if (kind === "toggle") {
    const checked = entry.value.trim().toLowerCase() === "true";
    return (
      <ToggleRow
        label={humanizeOptionKey(entry.key)}
        description={entry.key}
        checked={checked}
        onChange={(v) => onChange(v ? "true" : "false")}
      />
    );
  }

  if (kind === "resourcePacks") {
    const packs = parseResourcePacksList(entry.value);
    return (
      <div className="flex flex-col gap-2 py-2">
        <div>
          <div className="text-[13px] text-text-primary font-medium">
            Resource packs
          </div>
          <div className="text-[10px] text-text-muted mt-0.5">{entry.key}</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {packs.length === 0 ? (
            <span className="text-[11px] text-text-disabled">Empty list</span>
          ) : (
            packs.map((pack) => (
              <button
                key={pack}
                type="button"
                title="Remove from list"
                onClick={() =>
                  onChange(
                    serializeResourcePacksList(
                      packs.filter((p) => p !== pack),
                    ),
                  )
                }
                className="px-2 py-1 rounded-md border border-white/10 text-[10px] text-text-secondary hover:border-state-error/40 hover:text-state-error cursor-pointer"
              >
                {pack} ×
              </button>
            ))
          )}
        </div>
        <input
          type="text"
          placeholder='Add entry (e.g. file/MyPack.zip) and press Enter'
          className="w-full px-3 py-2 rounded-lg text-[11px] font-mono bg-black/30 border border-white/10 text-text-primary placeholder:text-text-disabled outline-none focus:border-primary-base/40"
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const value = (e.target as HTMLInputElement).value.trim();
            if (!value) return;
            if (packs.includes(value)) return;
            onChange(serializeResourcePacksList([...packs, value]));
            (e.target as HTMLInputElement).value = "";
          }}
        />
      </div>
    );
  }

  if (kind === "shaderPack") {
    return (
      <div className="flex flex-col gap-1.5 py-2">
        <div>
          <div className="text-[13px] text-text-primary font-medium">
            Shader pack
          </div>
          <div className="text-[10px] text-text-muted mt-0.5">{entry.key}</div>
        </div>
        <CfSelect
          value={entry.value}
          onChange={onChange}
          options={[
            { value: "", label: "None" },
            ...(entry.value &&
            !shaderNames.some(
              (n) => n.toLowerCase() === entry.value.toLowerCase(),
            )
              ? [{ value: entry.value, label: entry.value }]
              : []),
            ...shaderNames.map((name) => ({ value: name, label: name })),
          ]}
          aria-label="Shader pack"
        />
      </div>
    );
  }

  if (kind === "enum" && enums) {
    const options = enums.includes(entry.value)
      ? enums
      : [entry.value, ...enums];
    return (
      <div className="flex flex-col gap-1.5 py-2">
        <div>
          <div className="text-[13px] text-text-primary font-medium">
            {humanizeOptionKey(entry.key)}
          </div>
          <div className="text-[10px] text-text-muted mt-0.5">{entry.key}</div>
        </div>
        <CfSelect
          value={entry.value}
          onChange={onChange}
          options={options.map((opt) => ({ value: opt, label: opt }))}
          aria-label={humanizeOptionKey(entry.key)}
        />
      </div>
    );
  }

  if (kind === "int" || kind === "float") {
    return (
      <div className="flex flex-col gap-1.5 py-2">
        <div>
          <div className="text-[13px] text-text-primary font-medium">
            {humanizeOptionKey(entry.key)}
          </div>
          <div className="text-[10px] text-text-muted mt-0.5">{entry.key}</div>
        </div>
        <input
          type="number"
          step={kind === "float" ? "any" : "1"}
          value={entry.value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-[12px] bg-black/30 border border-white/10 text-text-primary outline-none focus:border-primary-base/40"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 py-2">
      <div>
        <div className="text-[13px] text-text-primary font-medium">
          {humanizeOptionKey(entry.key)}
        </div>
        <div className="text-[10px] text-text-muted mt-0.5">{entry.key}</div>
      </div>
      <input
        type="text"
        value={entry.value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-[12px] font-mono bg-black/30 border border-white/10 text-text-primary outline-none focus:border-primary-base/40"
      />
    </div>
  );
}

export function ConfigurationPanel() {
  const active = useBuildStore((s) => s.active());
  const setConfig = useBuildStore((s) => s.setConfig);
  const root = useLibraryContentStore((s) => s.root);
  const optionsPath = useLibraryContentStore((s) => s.optionsPath);
  const optionsExists = useLibraryContentStore((s) => s.optionsExists);
  const optionsEntries = useLibraryContentStore((s) => s.optionsEntries);
  const optionsLoading = useLibraryContentStore((s) => s.optionsLoading);
  const loadOptions = useLibraryContentStore((s) => s.loadOptions);
  const applyOptionsFile = useLibraryContentStore((s) => s.applyOptionsFile);
  const libraryItems = useLibraryContentStore((s) => s.items);

  const [draft, setDraft] = useState<BuildConfig>(active.config);
  const [savedFlash, setSavedFlash] = useState(false);
  const [optionsDraft, setOptionsDraft] = useState<OptionsEntry[]>([]);
  const [optionsDirty, setOptionsDirty] = useState(false);
  const [optionsSaving, setOptionsSaving] = useState(false);
  const [optionsSearch, setOptionsSearch] = useState("");
  const [resolutions, setResolutions] = useState<string[]>(FALLBACK_RESOLUTIONS);

  useEffect(() => {
    setDraft(active.config);
  }, [active.id, active.config]);

  useEffect(() => {
    void listDisplayResolutions()
      .then((info) => {
        const next = [...info.presets];
        if (active.config.resolution && !next.includes(active.config.resolution)) {
          next.unshift(active.config.resolution);
        }
        if (next.length) setResolutions(next);
      })
      .catch(() => undefined);
  }, [active.config.resolution]);

  useEffect(() => {
    void loadOptions(root);
  }, [loadOptions, root]);

  useEffect(() => {
    if (!optionsDirty) {
      setOptionsDraft(optionsEntries.map((e) => ({ ...e })));
    }
  }, [optionsEntries, optionsDirty]);

  const shaderNames = useMemo(
    () =>
      libraryItems
        .filter((i) => i.kind === "shader")
        .map((i) => i.fileName.replace(/\.disabled$/i, "")),
    [libraryItems],
  );

  const visibleOptions = useMemo(() => {
    const q = optionsSearch.trim().toLowerCase();
    return optionsDraft
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => {
        if (entry.kind !== "entry" || !entry.key) return false;
        if (!q) return true;
        return (
          entry.key.toLowerCase().includes(q) ||
          entry.value.toLowerCase().includes(q) ||
          humanizeOptionKey(entry.key).toLowerCase().includes(q)
        );
      });
  }, [optionsDraft, optionsSearch]);

  const patch = (partial: Partial<BuildConfig>) =>
    setDraft((d) => ({ ...d, ...partial }));

  const onSaveLauncher = () => {
    const next = {
      ...draft,
      memoryMinGb: Math.min(draft.memoryMinGb, draft.memoryMaxGb),
      memoryMaxGb: Math.max(draft.memoryMinGb, draft.memoryMaxGb),
    };
    setDraft(next);
    setConfig(active.id, next);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1500);
  };

  const onResetLauncher = () => setDraft({ ...DEFAULT_BUILD_CONFIG });

  const updateOptionAt = (index: number, value: string) => {
    setOptionsDraft((prev) => {
      const next = prev.map((e) => ({ ...e }));
      if (!next[index] || next[index].kind !== "entry") return prev;
      next[index] = { ...next[index], value };
      return next;
    });
    setOptionsDirty(true);
  };

  const onReloadOptions = async () => {
    setOptionsDirty(false);
    await loadOptions(root);
  };

  const onSaveOptions = async () => {
    if (active.managed) {
      toast.error("options.txt is read-only on guild-managed builds.");
      return;
    }
    setOptionsSaving(true);
    try {
      const file = await writeMinecraftOptions(optionsDraft, root);
      applyOptionsFile(file);
      setOptionsDirty(false);
      toast.success("options.txt saved", {
        description: "Close Minecraft if changes do not appear in-game.",
      });
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Could not write options.txt. Close Minecraft and try again.",
      );
    } finally {
      setOptionsSaving(false);
    }
  };

  const ensureKey = (key: string, fallback: string) => {
    if (getOptionValue(optionsDraft, key) != null) return;
    setOptionsDraft((prev) => setEntriesKey(prev, key, fallback));
    setOptionsDirty(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] text-text-muted px-0.5">
        Launcher runtime overrides apply to this build.
        {active.managed
          ? " Minecraft options.txt is read-only on guild-managed builds."
          : " Minecraft options below edit this build’s options.txt."}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <section className="cf-panel rounded-xl p-4 flex flex-col gap-4">
          <h3 className="font-sora text-[13px] font-bold text-text-primary">
            Runtime
          </h3>

          <div className="flex flex-col gap-1.5">
            <FieldLabel>Java</FieldLabel>
            <div className="flex items-center gap-2">
              <Chip size="sm" variant="soft" color="default">
                <Chip.Label>{active.java}</Chip.Label>
              </Chip>
              <span className="text-[10px] text-text-disabled">read-only</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MemoryStepper
              label="Min memory"
              value={draft.memoryMinGb}
              onChange={(v) => patch({ memoryMinGb: v })}
            />
            <MemoryStepper
              label="Max memory"
              value={draft.memoryMaxGb}
              onChange={(v) => patch({ memoryMaxGb: v })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <FieldLabel>JVM arguments</FieldLabel>
            <textarea
              value={draft.jvmArgs}
              onChange={(e) => patch({ jvmArgs: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 rounded-lg text-[11px] font-mono bg-black/30 border border-white/10 text-text-primary outline-none focus:border-primary-base/40 resize-y min-h-18"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <FieldLabel>Wrapper command</FieldLabel>
            <input
              type="text"
              value={draft.wrapper}
              onChange={(e) => patch({ wrapper: e.target.value })}
              placeholder="Optional"
              className="w-full px-3 py-2 rounded-lg text-[12px] bg-black/30 border border-white/10 text-text-primary placeholder:text-text-disabled outline-none focus:border-primary-base/40"
            />
          </div>
        </section>

        <section className="cf-panel rounded-xl p-4 flex flex-col gap-4">
          <h3 className="font-sora text-[13px] font-bold text-text-primary">
            Launcher game
          </h3>

          <div className="flex flex-col gap-1.5">
            <FieldLabel>Resolution</FieldLabel>
            <CfSelect
              value={draft.resolution}
              onChange={(v) => patch({ resolution: v })}
              options={resolutions.map((r) => ({ value: r, label: r }))}
              aria-label="Resolution"
            />
          </div>

          <div className="flex flex-col divide-y divide-white/6">
            <ToggleRow
              label="Fullscreen"
              checked={draft.fullscreen}
              onChange={(v) => patch({ fullscreen: v })}
            />
            <ToggleRow
              label="Minimize to tray on launch"
              description="Hide CultForge to the tray and idle while the game runs"
              checked={draft.closeOnLaunch}
              onChange={(v) => patch({ closeOnLaunch: v })}
            />
            <ToggleRow
              label="Dedicated GPU"
              description="Prefer discrete graphics when available"
              checked={draft.dedicatedGpu}
              onChange={(v) => patch({ dedicatedGpu: v })}
            />
          </div>
        </section>
      </div>

      <div className="flex items-center justify-end gap-2">
        {savedFlash && (
          <span className="text-[11px] text-primary-base mr-auto">
            Launcher settings saved
          </span>
        )}
        <button
          type="button"
          onClick={onResetLauncher}
          className="px-3.5 py-2 text-[11px] font-semibold rounded-lg border border-white/10 text-text-secondary hover:text-text-primary cursor-pointer"
        >
          Reset launcher defaults
        </button>
        <button
          type="button"
          onClick={onSaveLauncher}
          className="cf-btn-primary px-4 py-2 rounded-lg text-[12px] cursor-pointer"
        >
          Save launcher
        </button>
      </div>

      <section className="cf-panel rounded-xl p-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="font-sora text-[13px] font-bold text-text-primary">
              Minecraft options.txt
            </h3>
            <p className="text-[10px] text-text-muted mt-0.5 truncate">
              {optionsLoading
                ? "Loading…"
                : optionsExists
                  ? optionsPath || "options.txt"
                  : "No options.txt yet — saving will create one"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => ensureKey("shaderPack", "")}
              className="px-2.5 py-1.5 text-[10px] font-semibold rounded-lg border border-white/10 text-text-muted hover:text-text-primary cursor-pointer"
            >
              Ensure shaderPack
            </button>
            <button
              type="button"
              onClick={() => ensureKey("resourcePacks", '["vanilla"]')}
              className="px-2.5 py-1.5 text-[10px] font-semibold rounded-lg border border-white/10 text-text-muted hover:text-text-primary cursor-pointer"
            >
              Ensure resourcePacks
            </button>
          </div>
        </div>

        <input
          type="search"
          value={optionsSearch}
          onChange={(e) => setOptionsSearch(e.target.value)}
          placeholder="Search options keys…"
          className="w-full sm:max-w-sm px-3 py-2 rounded-lg text-[12px] bg-black/30 border border-white/10 text-text-primary placeholder:text-text-disabled outline-none focus:border-primary-base/40"
        />

        <div className="flex flex-col divide-y divide-white/6 max-h-[28rem] overflow-y-auto scroll-hidden">
          {visibleOptions.length === 0 ? (
            <div className="py-8 text-center text-[12px] text-text-muted">
              {optionsLoading
                ? "Loading options…"
                : optionsSearch.trim()
                  ? "No keys match your search"
                  : "No options entries yet"}
            </div>
          ) : (
            visibleOptions.map(({ entry, index }) => (
              <OptionControl
                key={`${entry.key}:${index}`}
                entry={entry}
                shaderNames={shaderNames}
                onChange={(value) => updateOptionAt(index, value)}
              />
            ))
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          {optionsDirty && (
            <span className="text-[11px] text-text-muted mr-auto">
              Unsaved changes
            </span>
          )}
          <button
            type="button"
            onClick={() => void onReloadOptions()}
            className="px-3.5 py-2 text-[11px] font-semibold rounded-lg border border-white/10 text-text-secondary hover:text-text-primary cursor-pointer"
          >
            Reload
          </button>
          <button
            type="button"
            disabled={optionsSaving || !optionsDirty || active.managed}
            onClick={() => void onSaveOptions()}
            className="cf-btn-primary px-4 py-2 rounded-lg text-[12px] cursor-pointer disabled:opacity-50"
          >
            {optionsSaving ? "Saving…" : "Save options.txt"}
          </button>
        </div>
      </section>
    </div>
  );
}
