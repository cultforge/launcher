import { motion } from "framer-motion";
import { Chip } from "@heroui/react";
import { toast } from "sonner";
import { Icon } from "../ico";
import { AppIcons } from "../icons";
import { BuildSwitcher } from "../BuildSwitcher";
import type { BuildInstance } from "../../stores/build";
import { SpotlightCard } from "../magic/spotlight-card";
import { lift } from "../../lib/motion";
import { cn } from "../../lib/cn";
import { EntityImage } from "../EntityImage";
import { canLaunchBuild } from "../../lib/launchGate";
import { launchMinecraft } from "../../lib/launchMinecraft";
import { syncManagedBuild, reinstallGuildBuild } from "../../lib/guildBuildSync";
import { ShareDeepLinkButton } from "../CopyButton";
import { useLaunchStore } from "../../stores/launch";
import { useBuildModalsStore } from "../../stores/buildModals";

type BuildHeroHeaderProps = {
  active: BuildInstance;
  onCyclePrev: () => void;
  onCycleNext: () => void;
};

export function BuildHeroHeader({
  active,
  onCyclePrev,
  onCycleNext,
}: BuildHeroHeaderProps) {
  const launch = canLaunchBuild(active);
  const starting = useLaunchStore((s) => s.starting);
  const runningBuildId = useLaunchStore((s) => s.runningBuildId);
  const openModal = useBuildModalsStore((s) => s.openModal);
  const busy = starting || runningBuildId === active.id;

  const onPlay = () => {
    if (!launch.ok) {
      toast.message("Cannot launch yet", {
        description: launch.reason,
        action:
          active.managed && active.syncStatus !== "syncing"
            ? {
                label: "Repair",
                onClick: () => {
                  void syncManagedBuild(active.id).catch((err) =>
                    toast.error(
                      err instanceof Error ? err.message : "Repair failed",
                    ),
                  );
                },
              }
            : undefined,
      });
      return;
    }
    void launchMinecraft(active);
  };

  return (
    <motion.div variants={lift} initial="rest" whileHover="hover">
      <SpotlightCard className="cf-panel rounded-xl overflow-hidden relative min-h-50 max-h-55">
        <EntityImage
          kind="build"
          entityId={active.id}
          source={active.image ?? active.heroLandscape}
          alt={`${active.name} build artwork`}
          className="absolute inset-0 h-full w-full"
        />
        <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/45 to-black/30" />
        <div className="absolute inset-0 bg-linear-to-r from-black/60 via-transparent to-black/20" />

        <div className="relative z-10 flex flex-col h-full min-h-50 max-h-55">
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 border-b border-white/8 bg-black/40">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={onCyclePrev}
                  aria-label="Previous build"
                  className="h-7 w-7 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-white/8 cursor-pointer"
                >
                  <Icon icon={AppIcons.ChevronLeft} size={16} />
                </button>
                <button
                  type="button"
                  onClick={onCycleNext}
                  aria-label="Next build"
                  className="h-7 w-7 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-white/8 cursor-pointer"
                >
                  <Icon icon={AppIcons.ChevronRight} size={16} />
                </button>
              </div>

              <div className="h-8 w-px bg-white/12 shrink-0" />

              <div className="min-w-0 shrink-0">
                <BuildSwitcher showLabel titleClassName="text-[14px] text-white" />
              </div>

              <div className="hidden lg:flex items-center gap-1.5 ml-2 min-w-0 flex-wrap text-[10px] text-text-secondary">
                <span>MC {active.mc}</span>
                <span className="opacity-30">·</span>
                <span>{active.loader}</span>
                <span className="opacity-30">·</span>
                <span>Java {active.java}</span>
                <span className="opacity-30">·</span>
                <span>{active.mods} mods</span>
                <span className="opacity-30">·</span>
                <span>Last played {active.lastPlayed}</span>
                {active.managed && (
                  <>
                    <span className="opacity-30">·</span>
                    <span className="text-primary-base">Guild</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {active.managed ? (
                <button
                  type="button"
                  disabled={active.syncStatus === "syncing"}
                  onClick={() => {
                    void reinstallGuildBuild(active.id).catch((err) =>
                      toast.error(
                        err instanceof Error ? err.message : "Reinstall failed",
                      ),
                    );
                  }}
                  title="Re-download all guild manifest files"
                  className="hidden sm:flex items-center gap-1 rounded-lg border border-white/12 px-2.5 py-1.5 text-[10px] font-semibold text-text-secondary hover:text-text-primary hover:bg-white/6 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <Icon icon={AppIcons.Swap} size={12} />
                  {active.syncStatus === "syncing" ? "Syncing…" : "Reinstall"}
                </button>
              ) : null}
              {active.guildId ? (
                <ShareDeepLinkButton
                  link={{ kind: "guild", guildId: active.guildId }}
                  label="Share"
                  className="hidden sm:inline-flex border-white/12"
                />
              ) : null}
              <button
                type="button"
                onClick={() => openModal("add")}
                title="Add a Minecraft version from Mojang"
                className="hidden sm:flex items-center gap-1 rounded-lg border border-white/12 px-2.5 py-1.5 text-[10px] font-semibold text-text-secondary hover:text-text-primary hover:bg-white/6 cursor-pointer"
              >
                <Icon icon={AppIcons.Plus} size={12} />
                Add
              </button>
              <Chip color="default" size="sm" variant="soft" className="hidden sm:flex">
                <Chip.Label>
                  {active.managed && active.syncStatus !== "synced"
                    ? active.syncStatus
                    : active.status}
                </Chip.Label>
              </Chip>

              <div className="flex items-stretch">
                <button
                  type="button"
                  onClick={onPlay}
                  disabled={!launch.ok || starting}
                  title={
                    runningBuildId === active.id
                      ? "Minecraft is running"
                      : launch.reason
                  }
                  className="cf-btn-primary flex items-center gap-1.5 px-5 py-2 rounded-l-lg rounded-r-none text-[12px] font-semibold tracking-wide cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <Icon icon={AppIcons.Play} size={14} />
                  {busy && runningBuildId === active.id
                    ? "RUNNING"
                    : starting
                      ? "STARTING…"
                      : "PLAY"}
                </button>
                <button
                  type="button"
                  aria-label="Launch options"
                  className="cf-btn-primary flex items-center justify-center px-2.5 py-2 rounded-r-lg rounded-l-none border-l border-black/25 cursor-pointer"
                >
                  <Icon icon={AppIcons.ChevronDown} size={14} className="opacity-80" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 flex items-end gap-3 px-4 pb-4 pt-2 min-h-0">
            <div
              className={cn(
                "h-14 w-14 rounded-xl bg-linear-to-br flex items-center justify-center shrink-0 border border-white/10 shadow-lg overflow-hidden",
                active.accent,
              )}
            >
              {active.image ? (
                <EntityImage
                  kind="build"
                  entityId={active.id}
                  source={active.image}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <Icon icon={AppIcons.Builds} size={24} className="text-white/90" />
              )}
            </div>
            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="font-sora text-[18px] font-bold text-text-primary truncate">
                  {active.name}
                </h2>
                <Icon
                  icon={AppIcons.Star}
                  size={14}
                  className="text-text-muted shrink-0"
                />
              </div>
              <p className="text-[10px] text-text-secondary">
                Minecraft {active.mc} · {active.loader} · {active.mods} Mods
                {active.managed ? " · Guild-managed" : ""}
              </p>
              <div className="flex flex-wrap gap-1">
                {active.tags.slice(0, 5).map((tag) => (
                  <Chip key={tag} size="sm" variant="soft" color="default">
                    <Chip.Label className="text-[9px]">{tag}</Chip.Label>
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        </div>
      </SpotlightCard>
    </motion.div>
  );
}
