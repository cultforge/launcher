import type { BuildInstance } from "../../stores/build";
import type { ModrinthVersion } from "../../lib/modrinth";
import { cn } from "../../lib/cn";
import { Icon } from "../ico";
import { AppIcons } from "../icons";
import { CfSelect } from "../ui/CfSelect";

function versionSummary(v: ModrinthVersion | null): string {
  if (!v) return "Pick a version";
  const mc = v.game_versions[0] ?? "—";
  const loader = v.loaders[0] ?? "";
  return `${v.version_number} · ${mc}${loader ? ` / ${loader}` : ""}`;
}

export function StoreInstallBar({
  builds,
  buildId,
  onBuildChange,
  selectedVersion,
  versionsLoading,
  onOpenVersions,
  installing,
  disabledReason,
  onInstall,
}: {
  builds: BuildInstance[];
  buildId: string;
  onBuildChange: (id: string) => void;
  selectedVersion: ModrinthVersion | null;
  versionsLoading: boolean;
  onOpenVersions: () => void;
  installing: boolean;
  disabledReason: string | null;
  onInstall: () => void;
}) {
  const canInstall =
    !installing &&
    !disabledReason &&
    Boolean(buildId) &&
    Boolean(selectedVersion);

  return (
    <div className="shrink-0 border-t border-white/8 bg-black/45 px-3 py-2.5">
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_minmax(0,1.1fr)_auto] sm:items-end">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Install to
            </span>
            <CfSelect
              value={buildId}
              onChange={onBuildChange}
              disabled={builds.length === 0}
              placeholder="No eligible builds"
              options={
                builds.length === 0
                  ? []
                  : builds.map((b) => ({
                      value: b.id,
                      label: `${b.name} · ${b.mc} / ${b.loader}`,
                    }))
              }
              aria-label="Install to build"
            />
          </label>

          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Version
            </span>
            <button
              type="button"
              onClick={onOpenVersions}
              disabled={versionsLoading}
              className={cn(
                "flex h-9 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/30 px-2.5 text-left text-[11px] text-text-primary outline-none hover:border-white/20 focus:border-primary-base/40 disabled:opacity-50",
                !selectedVersion && "text-text-muted",
              )}
            >
              <span className="truncate">
                {versionsLoading
                  ? "Loading versions…"
                  : versionSummary(selectedVersion)}
              </span>
              <Icon
                icon={AppIcons.ChevronDown}
                size={14}
                className="shrink-0 opacity-60"
              />
            </button>
          </div>

          <button
            type="button"
            disabled={!canInstall}
            onClick={onInstall}
            className={cn(
              "h-[38px] cursor-pointer rounded-lg px-4 text-[12px] font-bold transition-colors sm:min-w-[6.5rem]",
              canInstall
                ? "bg-primary-base text-bg-app hover:bg-primary-soft"
                : "cursor-default bg-white/8 text-text-disabled",
            )}
          >
            {installing ? "Resolving…" : "Install"}
          </button>
        </div>

        {disabledReason && (
          <p className="text-[10px] leading-snug text-state-warning">
            {disabledReason}
          </p>
        )}
      </div>
    </div>
  );
}
