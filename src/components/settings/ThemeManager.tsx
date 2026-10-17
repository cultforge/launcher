import { useEffect, useMemo, useRef, useState } from "react";
import {
  BUILTIN_THEMES,
  MAX_CUSTOM_THEMES,
  type LauncherTheme,
  type ThemeTokens,
} from "../../data/themes";
import {
  LOGO_VARIANTS,
  LOGO_VARIANT_LABELS,
  SHELL_VARIANTS,
  SHELL_VARIANT_META,
  type LogoMode,
  type ShellVariant,
} from "../../data/branding";
import { contrastRatio, hexToOklch, isHexColor, oklchToHex } from "../../lib/color";
import { cn } from "../../lib/cn";
import { useThemeStore } from "../../stores/theme";
import { ThemeLogo } from "../ThemeLogo";

const EDITABLE_ROLES: {
  key: keyof ThemeTokens;
  label: string;
  group: "Surfaces" | "Brand" | "Text" | "States";
}[] = [
  { key: "bgApp", label: "Background", group: "Surfaces" },
  { key: "bgSurface", label: "Surface", group: "Surfaces" },
  { key: "bgCard", label: "Card", group: "Surfaces" },
  { key: "bgElevated", label: "Elevated", group: "Surfaces" },
  { key: "primaryBase", label: "Primary", group: "Brand" },
  { key: "primarySoft", label: "Primary soft", group: "Brand" },
  { key: "primaryMuted", label: "Primary muted", group: "Brand" },
  { key: "accent", label: "Accent", group: "Brand" },
  { key: "textPrimary", label: "Text", group: "Text" },
  { key: "textSecondary", label: "Text secondary", group: "Text" },
  { key: "textMuted", label: "Text muted", group: "Text" },
  { key: "borderStrong", label: "Border", group: "Text" },
  { key: "success", label: "Success", group: "States" },
  { key: "warning", label: "Warning", group: "States" },
  { key: "error", label: "Danger", group: "States" },
  { key: "info", label: "Info", group: "States" },
];

function ThemeSwatches({ theme }: { theme: LauncherTheme }) {
  const colors = [
    theme.tokens.bgCard,
    theme.tokens.primaryBase,
    theme.tokens.accent,
    theme.tokens.textPrimary,
  ];
  return (
    <div className="flex items-center -space-x-1">
      {colors.map((color, index) => (
        <span
          key={`${color}-${index}`}
          className="h-5 w-5 rounded-full border-2 border-bg-card"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

function ThemeCard({
  theme,
  active,
  onApply,
  onCustomize,
  onEdit,
  onDelete,
  onExport,
}: {
  theme: LauncherTheme;
  active: boolean;
  onApply: () => void;
  onCustomize?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3 flex flex-col gap-3 min-w-0",
        active
          ? "border-primary-base/45 bg-primary-base/8"
          : "border-white/8 bg-black/20",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[12px] text-text-primary font-semibold truncate">
            {theme.name}
          </div>
          <div className="text-[9px] text-text-disabled mt-0.5">
            {theme.builtin ? "CultForge preset" : "Custom slot"}
          </div>
        </div>
        <ThemeSwatches theme={theme} />
      </div>
      <div
        className="h-12 rounded-lg border border-white/8 p-2 flex items-end"
        style={{
          background: `linear-gradient(135deg, ${theme.tokens.bgCard}, ${theme.tokens.bgElevated})`,
        }}
      >
        <span
          className="h-2 w-16 rounded-full"
          style={{ backgroundColor: theme.tokens.primaryBase }}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onApply}
          className={cn(
            "flex-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border cursor-pointer",
            active
              ? "border-primary-base/30 text-primary-base"
              : "border-white/10 text-text-secondary hover:text-text-primary",
          )}
        >
          {active ? "Applied" : "Apply"}
        </button>
        {onCustomize && (
          <button
            type="button"
            onClick={onCustomize}
            className="px-2.5 py-1.5 rounded-lg text-[10px] border border-white/10 text-text-muted hover:text-text-primary cursor-pointer"
          >
            Customize
          </button>
        )}
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="px-2.5 py-1.5 rounded-lg text-[10px] border border-white/10 text-text-muted hover:text-text-primary cursor-pointer"
          >
            Edit
          </button>
        )}
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            className="px-2 py-1.5 rounded-lg text-[10px] border border-white/10 text-text-muted hover:text-text-primary cursor-pointer"
          >
            ↓
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="px-2 py-1.5 rounded-lg text-[10px] border border-state-error/25 text-state-error hover:bg-state-error/10 cursor-pointer"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

function ThemeEditor({
  theme,
  onClose,
}: {
  theme: LauncherTheme;
  onClose: () => void;
}) {
  const updateTheme = useThemeStore((s) => s.updateCustomTheme);
  const setActive = useThemeStore((s) => s.setActiveTheme);
  const preview = useThemeStore((s) => s.previewTokens);
  const restore = useThemeStore((s) => s.restoreActiveTheme);
  const [name, setName] = useState(theme.name);
  const [draft, setDraft] = useState<ThemeTokens>({ ...theme.tokens });
  const [role, setRole] = useState<keyof ThemeTokens>("primaryBase");
  const selected = hexToOklch(draft[role].slice(0, 7)) ?? {
    l: 0.7,
    c: 0.12,
    h: 155,
  };

  useEffect(() => {
    setName(theme.name);
    setDraft({ ...theme.tokens });
  }, [theme.id, theme.name, theme.tokens]);

  useEffect(() => {
    preview(draft);
  }, [draft, preview]);

  useEffect(() => () => restore(), [restore]);

  const patchRole = (value: string) => {
    if (!isHexColor(value)) return;
    setDraft((current) => ({ ...current, [role]: value }));
  };

  const patchOklch = (next: Partial<typeof selected>) => {
    patchRole(oklchToHex({ ...selected, ...next }));
  };

  const textContrast = contrastRatio(draft.textPrimary, draft.bgApp);
  const cardContrast = contrastRatio(draft.textPrimary, draft.bgCard);
  const contrastSafe = textContrast >= 4.5 && cardContrast >= 4.5;

  const close = () => {
    restore();
    onClose();
  };

  const apply = () => {
    updateTheme(theme.id, { name, tokens: draft });
    setActive(theme.id);
    onClose();
  };

  return (
    <div className="rounded-xl border border-primary-base/25 bg-black/25 p-3.5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[13px] text-text-primary font-semibold">
            Theme Studio
          </div>
          <div className="text-[9px] text-text-muted mt-0.5">
            OKLCH controls update the launcher live
          </div>
        </div>
        <button
          type="button"
          onClick={close}
          className="text-[10px] text-text-muted hover:text-text-primary cursor-pointer"
        >
          Close
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_210px] gap-4">
        <div className="flex flex-col gap-3 min-w-0">
          <label className="flex flex-col gap-1.5">
            <span className="text-[9px] uppercase tracking-[0.14em] text-text-muted">
              Theme name
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="px-3 py-2 rounded-lg text-[12px] bg-bg-surface border border-border-strong text-text-primary outline-none focus:border-primary-base/40"
            />
          </label>

          <div className="flex flex-wrap gap-1.5">
            {EDITABLE_ROLES.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setRole(item.key)}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[9px] cursor-pointer",
                  role === item.key
                    ? "border-primary-base/40 text-primary-base"
                    : "border-border-subtle text-text-muted",
                )}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full border border-white/10"
                  style={{ backgroundColor: draft[item.key] }}
                />
                {item.label}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-border-subtle bg-bg-surface p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] text-text-primary font-semibold">
                  {EDITABLE_ROLES.find((item) => item.key === role)?.label}
                </div>
                <div className="text-[8px] text-text-disabled uppercase tracking-wider">
                  {EDITABLE_ROLES.find((item) => item.key === role)?.group}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={draft[role].slice(0, 7)}
                  onChange={(event) => patchRole(event.target.value)}
                  className="h-8 w-8 rounded border-0 bg-transparent cursor-pointer"
                />
                <input
                  value={draft[role].slice(0, 7)}
                  onChange={(event) => patchRole(event.target.value)}
                  className="w-24 px-2 py-1.5 rounded-lg text-[10px] font-mono bg-bg-card border border-border-strong text-text-primary uppercase"
                />
              </div>
            </div>

            {(
              [
                ["Lightness", "l", 0, 1, 0.01, selected.l],
                ["Chroma", "c", 0, 0.35, 0.005, selected.c],
                ["Hue", "h", 0, 360, 1, selected.h],
              ] as const
            ).map(([label, key, min, max, step, value]) => (
              <label key={key} className="grid grid-cols-[65px_1fr_40px] gap-2 items-center">
                <span className="text-[9px] text-text-muted">{label}</span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={value}
                  onChange={(event) =>
                    patchOklch({ [key]: Number(event.target.value) })
                  }
                  className="w-full accent-primary-base"
                />
                <span className="text-[9px] text-text-secondary tabular-nums text-right">
                  {key === "h" ? Math.round(value) : value.toFixed(2)}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div
            className="rounded-xl border p-3 flex flex-col gap-3"
            style={{
              backgroundColor: draft.bgCard,
              borderColor: draft.borderStrong,
              color: draft.textPrimary,
            }}
          >
            <div className="text-[11px] font-semibold">Live preview</div>
            <div
              className="rounded-lg border px-2.5 py-2 text-[9px]"
              style={{
                backgroundColor: draft.bgElevated,
                borderColor: draft.borderSubtle,
                color: draft.textSecondary,
              }}
            >
              Panels, controls, and status states
            </div>
            <button
              type="button"
              className="rounded-lg px-3 py-2 text-[10px] font-bold"
              style={{
                backgroundColor: draft.primaryBase,
                color: draft.bgApp,
              }}
            >
              Primary action
            </button>
            <div className="flex gap-1.5">
              {[draft.success, draft.warning, draft.error, draft.info].map(
                (color) => (
                  <span
                    key={color}
                    className="h-2 flex-1 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                ),
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border-subtle p-3 flex flex-col gap-2">
            <div className="text-[9px] uppercase tracking-wider text-text-muted">
              Contrast check
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-text-secondary">App text</span>
              <span className={textContrast >= 4.5 ? "text-state-success" : "text-state-error"}>
                {textContrast.toFixed(2)}:1
              </span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-text-secondary">Card text</span>
              <span className={cardContrast >= 4.5 ? "text-state-success" : "text-state-error"}>
                {cardContrast.toFixed(2)}:1
              </span>
            </div>
            <p className={cn("text-[9px]", contrastSafe ? "text-state-success" : "text-state-warning")}>
              {contrastSafe
                ? "WCAG AA normal-text contrast passes."
                : "Raise text lightness or darken surfaces to reach 4.5:1."}
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-border-subtle">
        <button
          type="button"
          onClick={close}
          className="px-3 py-2 rounded-lg border border-border-strong text-[10px] text-text-secondary cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={!contrastSafe || !name.trim()}
          className="cf-btn-primary px-4 py-2 rounded-lg text-[10px] disabled:opacity-40 cursor-pointer"
        >
          Save & apply
        </button>
      </div>
    </div>
  );
}

function BrandingControls() {
  const logoMode = useThemeStore((s) => s.logoMode);
  const activeThemeId = useThemeStore((s) => s.activeThemeId);
  const assignments = useThemeStore((s) => s.logoAssignments);
  const setLogoMode = useThemeStore((s) => s.setLogoMode);
  const automaticVariant = assignments[activeThemeId] ?? "disc";
  const choices: { id: LogoMode; label: string }[] = [
    { id: "auto", label: "Auto" },
    ...LOGO_VARIANTS.map((variant) => ({
      id: variant,
      label: LOGO_VARIANT_LABELS[variant],
    })),
  ];

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h4 className="font-sora text-[13px] font-bold text-text-primary">
          Branding
        </h4>
        <p className="text-[10px] text-text-muted mt-1">
          Auto assigns a stable random mark to each theme. A manual choice
          overrides it everywhere.
        </p>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
        {choices.map((choice) => {
          const active = logoMode === choice.id;
          const variant =
            choice.id === "auto" ? automaticVariant : choice.id;
          return (
            <button
              key={choice.id}
              type="button"
              onClick={() => setLogoMode(choice.id)}
              className={cn(
                "rounded-xl border p-3 flex flex-col items-center gap-2 cursor-pointer transition-colors",
                active
                  ? "border-primary-base/40 bg-primary-base/8"
                  : "border-border-subtle bg-black/20 hover:border-border-strong",
              )}
            >
              <ThemeLogo
                variant={variant}
                className="h-16 w-full"
                glow={active}
                label={`${choice.label} CultForge logo`}
              />
              <span
                className={cn(
                  "text-[10px] font-semibold",
                  active ? "text-primary-base" : "text-text-secondary",
                )}
              >
                {choice.label}
              </span>
              {choice.id === "auto" && (
                <span className="text-[8px] text-text-disabled">
                  Assigned: {LOGO_VARIANT_LABELS[automaticVariant]}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function HeaderMiniPreview({
  variant,
  compact = false,
}: {
  variant: ShellVariant;
  compact?: boolean;
}) {
  return (
    <div
      data-preview-header={variant}
      className={cn("cf-preview-header", compact && "is-compact")}
      aria-hidden
    >
      <ThemeLogo className="cf-preview-header-logo" glow={false} />
      <div className="cf-preview-header-nav">
        {[0, 1, 2, 3, 4].map((item) => (
          <span key={item} data-active={item === 0} />
        ))}
      </div>
      <div className="cf-preview-header-actions">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function SideNavMiniPreview({
  variant,
  collapsed = false,
  compact = false,
}: {
  variant: ShellVariant;
  collapsed?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      data-preview-side={variant}
      data-collapsed={collapsed}
      className={cn("cf-preview-side", compact && "is-compact")}
      aria-hidden
    >
      <div className="cf-preview-side-toggle" />
      <div className="cf-preview-side-items">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <span key={item} data-active={item === 0}>
            <i />
            {!collapsed && <b />}
          </span>
        ))}
      </div>
      <div className="cf-preview-side-footer" />
    </div>
  );
}

function ShellStage({
  header,
  sideNav,
  collapsed,
}: {
  header: ShellVariant;
  sideNav: ShellVariant;
  collapsed: boolean;
}) {
  return (
    <div className="rounded-xl border border-border-strong bg-bg-app/90 p-2 shadow-[inset_0_0_28px_color-mix(in_srgb,var(--color-primary-base)_3%,transparent)]">
      <HeaderMiniPreview variant={header} />
      <div className="mt-1.5 h-36 flex overflow-hidden rounded-lg border border-border-subtle bg-bg-surface/50">
        <SideNavMiniPreview variant={sideNav} collapsed={collapsed} />
        <div className="flex-1 min-w-0 p-3">
          <div className="flex items-center justify-between">
            <span className="h-2.5 w-24 rounded-full bg-text-muted/15" />
            <span className="h-5 w-12 rounded-md border border-border-subtle bg-bg-card" />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[0, 1, 2].map((item) => (
              <span
                key={item}
                className="h-16 rounded-lg border border-border-subtle bg-bg-card/70"
              />
            ))}
          </div>
          <span className="block h-2 w-2/3 rounded-full bg-text-disabled/10 mt-3" />
        </div>
      </div>
    </div>
  );
}

function ShellOptionCard({
  kind,
  variant,
  selected,
  onSelect,
}: {
  kind: "header" | "sideNav";
  variant: ShellVariant;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = SHELL_VARIANT_META[variant];
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "group rounded-xl border p-2.5 text-left cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70",
        selected
          ? "border-primary-base/50 bg-primary-base/8"
          : "border-border-subtle bg-black/15 hover:border-border-strong hover:bg-bg-card/60",
      )}
    >
      {kind === "header" ? (
        <HeaderMiniPreview variant={variant} compact />
      ) : (
        <div className="h-18 flex justify-center rounded-lg border border-border-subtle bg-bg-app/60 p-1">
          <SideNavMiniPreview
            variant={variant}
            collapsed={meta.compactPreferred}
            compact
          />
        </div>
      )}
      <span className="mt-2 flex items-center gap-2">
        <span
          className={cn(
            "h-3.5 w-3.5 rounded-full border grid place-items-center shrink-0",
            selected
              ? "border-primary-base bg-primary-base"
              : "border-border-strong",
          )}
        >
          {selected && <span className="h-1.5 w-1.5 rounded-full bg-bg-app" />}
        </span>
        <span className="text-[11px] font-semibold text-text-primary">
          {meta.name}
        </span>
        {variant === "current" && (
          <span className="ml-auto rounded px-1.5 py-0.5 text-[8px] uppercase tracking-wider bg-bg-elevated text-text-muted">
            Default
          </span>
        )}
      </span>
      <span className="block mt-1 text-[9px] leading-relaxed text-text-muted min-h-6">
        {kind === "header"
          ? meta.headerDescription
          : meta.sideNavDescription}
      </span>
    </button>
  );
}

function ShellControls() {
  const [collapsedPreview, setCollapsedPreview] = useState(false);
  const [picker, setPicker] = useState<"header" | "sideNav">("header");
  const savedHeader = useThemeStore((s) => s.headerVariant);
  const savedSideNav = useThemeStore((s) => s.sideNavVariant);
  const headerPreview = useThemeStore((s) => s.headerPreview);
  const sideNavPreview = useThemeStore((s) => s.sideNavPreview);
  const previewHeader = useThemeStore((s) => s.previewHeaderVariant);
  const previewSideNav = useThemeStore((s) => s.previewSideNavVariant);
  const commit = useThemeStore((s) => s.commitShellVariants);
  const cancel = useThemeStore((s) => s.cancelShellPreview);
  const effectiveHeader = headerPreview ?? savedHeader;
  const effectiveSideNav = sideNavPreview ?? savedSideNav;
  const dirty =
    (headerPreview !== null && headerPreview !== savedHeader) ||
    (sideNavPreview !== null && sideNavPreview !== savedSideNav);

  useEffect(() => () => cancel(), [cancel]);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="shell-studio-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4
            id="shell-studio-title"
            className="font-sora text-[13px] font-bold text-text-primary"
          >
            Launcher layout studio
          </h4>
          <p className="text-[10px] leading-relaxed text-text-muted mt-1">
            Compose the header and navigation independently. Changes preview
            live and remain temporary until applied.
          </p>
        </div>
        <div
          className="flex shrink-0 rounded-lg border border-border-subtle bg-bg-surface p-0.5"
          aria-label="Side navigation preview width"
        >
          {(["Expanded", "Collapsed"] as const).map((label) => {
            const value = label === "Collapsed";
            return (
              <button
                key={label}
                type="button"
                aria-pressed={collapsedPreview === value}
                onClick={() => setCollapsedPreview(value)}
                className={cn(
                  "px-2.5 py-1.5 rounded-md text-[9px] font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70",
                  collapsedPreview === value
                    ? "bg-primary-base/15 text-primary-base"
                    : "text-text-muted hover:text-text-primary",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <ShellStage
        header={effectiveHeader}
        sideNav={effectiveSideNav}
        collapsed={collapsedPreview}
      />

      <div
        className="flex gap-1.5 border-b border-border-subtle pb-2"
        role="tablist"
        aria-label="Layout region"
      >
        {(
          [
            ["header", "Header"],
            ["sideNav", "Side navigation"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={picker === id}
            onClick={() => setPicker(id)}
            className={cn(
              "px-3 py-1.5 rounded-lg border text-[10px] font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70",
              picker === id
                ? "border-primary-base/40 bg-primary-base/10 text-primary-base"
                : "border-border-subtle text-text-muted hover:text-text-primary",
            )}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto self-center text-[9px] text-text-disabled">
          {SHELL_VARIANT_META[
            picker === "header" ? effectiveHeader : effectiveSideNav
          ].density}{" "}
          density
        </div>
      </div>

      <div
        role="tabpanel"
        aria-label={picker === "header" ? "Header styles" : "Side navigation styles"}
      >
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
          {SHELL_VARIANTS.map((variant) => (
            <ShellOptionCard
              key={variant}
              kind={picker}
              variant={variant}
              selected={
                (picker === "header" ? effectiveHeader : effectiveSideNav) ===
                variant
              }
              onSelect={() =>
                picker === "header"
                  ? previewHeader(variant)
                  : previewSideNav(variant)
              }
            />
          ))}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 p-2.5 rounded-xl border border-border-subtle bg-bg-card/95 backdrop-blur-md shadow-lg">
        {dirty && (
          <span
            className="text-[10px] text-primary-base mr-auto"
            role="status"
            aria-live="polite"
          >
            Unsaved layout preview
          </span>
        )}
        <button
          type="button"
          onClick={cancel}
          disabled={!dirty}
          className="px-3 py-2 rounded-lg border border-border-strong text-[10px] text-text-secondary disabled:opacity-40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={commit}
          disabled={!dirty}
          className="cf-btn-primary px-4 py-2 rounded-lg text-[10px] disabled:opacity-40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70"
        >
          Apply layout
        </button>
      </div>
    </section>
  );
}

export function ThemeManager() {
  const [pane, setPane] = useState<"themes" | "branding" | "shell">("themes");
  const customThemes = useThemeStore((s) => s.customThemes);
  const activeThemeId = useThemeStore((s) => s.activeThemeId);
  const editingId = useThemeStore((s) => s.editingId);
  const setEditingId = useThemeStore((s) => s.setEditingId);
  const setActive = useThemeStore((s) => s.setActiveTheme);
  const createCustom = useThemeStore((s) => s.createCustomTheme);
  const deleteCustom = useThemeStore((s) => s.deleteCustomTheme);
  const importCustom = useThemeStore((s) => s.importCustomTheme);
  const fileRef = useRef<HTMLInputElement>(null);
  const allThemes = useMemo(
    () => [...BUILTIN_THEMES, ...customThemes],
    [customThemes],
  );
  const editingTheme =
    customThemes.find((theme) => theme.id === editingId) ?? null;

  const customize = (sourceId: string) => {
    createCustom(sourceId);
  };

  const exportTheme = (theme: LauncherTheme) => {
    const blob = new Blob(
      [JSON.stringify({ name: theme.name, tokens: theme.tokens }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${theme.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.culttheme.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      importCustom(JSON.parse(await file.text()));
    } catch {
      // Invalid files are ignored; the slot count and schema remain protected.
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-sora text-[15px] font-bold text-text-primary">
            Appearance
          </h3>
          <p className="text-[11px] text-text-muted mt-1">
            Curated OLED palettes and persistent custom themes. Appearance
            sections apply and persist their own changes.
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[11px] text-text-primary font-semibold tabular-nums">
            {customThemes.length} / {MAX_CUSTOM_THEMES}
          </div>
          <div className="text-[8px] uppercase tracking-wider text-text-disabled">
            custom slots
          </div>
        </div>
      </div>

      <div className="flex gap-1.5 border-b border-border-subtle pb-2">
        {(
          [
            ["themes", "Themes"],
            ["branding", "Branding"],
            ["shell", "Header & navigation"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPane(id)}
            className={cn(
              "px-3 py-1.5 rounded-lg border text-[10px] font-semibold cursor-pointer",
              pane === id
                ? "border-primary-base/40 bg-primary-base/10 text-primary-base"
                : "border-border-subtle text-text-muted hover:text-text-primary",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {pane === "branding" && <BrandingControls />}
      {pane === "shell" && <ShellControls />}

      {pane === "themes" &&
        (editingTheme ? (
          <ThemeEditor
            theme={editingTheme}
            onClose={() => setEditingId(null)}
          />
        ) : (
          <>
          <div>
            <div className="text-[9px] uppercase tracking-[0.15em] text-text-muted mb-2">
              Presets
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2">
              {BUILTIN_THEMES.map((theme) => (
                <ThemeCard
                  key={theme.id}
                  theme={theme}
                  active={theme.id === activeThemeId}
                  onApply={() => setActive(theme.id)}
                  onCustomize={() => customize(theme.id)}
                />
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-border-subtle">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-[9px] uppercase tracking-[0.15em] text-text-muted">
                Custom themes
              </div>
              <div className="flex gap-1.5">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,.culttheme.json"
                  onChange={(event) => void importFile(event.target.files?.[0])}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={customThemes.length >= MAX_CUSTOM_THEMES}
                  className="px-2.5 py-1.5 rounded-lg border border-border-strong text-[9px] text-text-muted hover:text-text-primary disabled:opacity-40 cursor-pointer"
                >
                  Import
                </button>
                <button
                  type="button"
                  onClick={() => customize(activeThemeId)}
                  disabled={customThemes.length >= MAX_CUSTOM_THEMES}
                  className="cf-btn-primary px-3 py-1.5 rounded-lg text-[9px] disabled:opacity-40 cursor-pointer"
                >
                  New from active
                </button>
              </div>
            </div>

            {customThemes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border-strong px-4 py-8 text-center">
                <div className="text-[11px] text-text-secondary">
                  No custom themes saved
                </div>
                <div className="text-[9px] text-text-disabled mt-1">
                  Customize a preset or create one from the active palette.
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2">
                {customThemes.map((theme) => (
                  <ThemeCard
                    key={theme.id}
                    theme={theme}
                    active={theme.id === activeThemeId}
                    onApply={() => setActive(theme.id)}
                    onEdit={() => setEditingId(theme.id)}
                    onDelete={() => deleteCustom(theme.id)}
                    onExport={() => exportTheme(theme)}
                  />
                ))}
              </div>
            )}
          </div>
          </>
        ))}

      <span className="sr-only" aria-live="polite">
        Active theme: {allThemes.find((theme) => theme.id === activeThemeId)?.name}
      </span>
    </div>
  );
}
