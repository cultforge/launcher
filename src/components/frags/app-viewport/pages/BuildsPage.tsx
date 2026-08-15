import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Chip, Tabs } from "@heroui/react";
import { Icon } from "../../../ico";
import { AppIcons } from "../../../icons";
import PerformanceChart from "../../../../widgets/performance";
import { QUICK_ACTIONS } from "../../../../data/homeActivity";
import { useRecentActivity } from "../../../../hooks/useRecentActivity";
import { useUpdatesStore } from "../../../../stores/updates";
import { useBuildStore } from "../../../../stores/build";
import {
  useBuildModalsStore,
  type BuildModalId,
} from "../../../../stores/buildModals";
import {
  BUILD_TAB_IDS,
  useBuildUiStore,
  type BuildTabId,
} from "../../../../stores/buildUi";
import { BuildHeroHeader } from "../../../builds/BuildHeroHeader";
import { SpotlightCard } from "../../../magic/spotlight-card";
import {
  staggerContainer,
  fadeUp,
  pageSwap,
} from "../../../../lib/motion";
import { ModsPanel } from "../../../builds/tabs/ModsPanel";
import { ConfigurationPanel } from "../../../builds/tabs/ConfigurationPanel";
import { PerformancePanel } from "../../../builds/tabs/PerformancePanel";
import { PacksPanel } from "../../../builds/tabs/PacksPanel";
import { WorldManagementPanel } from "../../../builds/tabs/WorldManagementPanel";
import { ShadersPanel } from "../../../builds/tabs/ShadersPanel";
import { NotesPanel } from "../../../builds/tabs/NotesPanel";
import { BackupsPanel } from "../../../builds/tabs/BackupsPanel";
import { EntityImage } from "../../../EntityImage";

function BuildsPage() {
  const tab = useBuildUiStore((s) => s.activeTab);
  const setTab = useBuildUiStore((s) => s.setActiveTab);
  const [shotIndex, setShotIndex] = useState(0);

  const active = useBuildStore((s) => s.active());
  const cyclePrev = useBuildStore((s) => s.cyclePrev);
  const cycleNext = useBuildStore((s) => s.cycleNext);
  const openModal = useBuildModalsStore((s) => s.openModal);
  const activity = useRecentActivity(5);
  const updates = useUpdatesStore((s) => s.items);
  const lastChecked = useUpdatesStore((s) => s.lastChecked);
  const latestUpdate = updates[0];

  useEffect(() => {
    setShotIndex(0);
  }, [active.id]);

  const tabLabels: Record<BuildTabId, string> = {
    Overview: "Overview",
    Mods: `Mods (${active.mods})`,
    Configuration: "Configuration",
    Performance: "Performance",
    Packs: "Packs",
    "World Management": "World Management",
    Shaders: "Shaders",
    Notes: "Notes",
    Backups: "Backups",
  };

  const aboutMeta = [
    ["Created", active.created],
    ["Last played", active.lastPlayed],
    ["Playtime", active.playtime],
    ["Location", active.location],
  ] as const;

  const instanceDetails = [
    ["Loader", active.loader],
    ["Java", active.java],
    ["Worlds", active.worlds],
    ["Size", active.size],
    ["Version", active.version],
  ] as const;

  const visibleShots = 4;
  const maxShotStart = Math.max(0, active.screenshots.length - visibleShots);

  return (
    <div className="h-full overflow-y-auto scroll-hidden p-4 pb-24 flex flex-col gap-3">
      <BuildHeroHeader
        active={active}
        onCyclePrev={cyclePrev}
        onCycleNext={cycleNext}
      />

      <div className="lg:hidden flex flex-wrap gap-x-2 text-[10px] text-text-muted px-0.5">
        <span>MC {active.mc}</span>
        <span className="opacity-30">·</span>
        <span>{active.loader}</span>
        <span className="opacity-30">·</span>
        <span>{active.mods} mods</span>
        <span className="opacity-30">·</span>
        <span>Last played {active.lastPlayed}</span>
      </div>

      <Tabs
        selectedKey={tab}
        onSelectionChange={(key) => setTab(String(key) as BuildTabId)}
        className="w-full"
        variant="secondary"
      >
        <Tabs.ListContainer className="overflow-x-auto scroll-hidden border-b border-white/8">
          <Tabs.List className="flex gap-0.5 min-w-max">
            {BUILD_TAB_IDS.map((id) => (
              <Tabs.Tab
                key={id}
                id={id}
                className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] whitespace-nowrap cursor-pointer text-text-muted data-[selected=true]:text-text-primary"
              >
                {tabLabels[id]}
                <Tabs.Indicator className="bg-primary-base/50 h-0.5 rounded-full" />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>

      <AnimatePresence mode="wait">
        {tab === "Overview" && (
          <motion.div
            key="overview"
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            exit={pageSwap.exit}
            className="flex flex-col gap-3"
          >
            {/* Row 1: About | Activity | Performance */}
            <div className="grid grid-cols-12 gap-3 items-stretch">
              <motion.div variants={fadeUp} className="col-span-12 md:col-span-4">
                <SpotlightCard className="cf-panel rounded-xl p-3.5 flex flex-col h-full min-h-60">
                  <h3 className="text-[9px] font-semibold uppercase tracking-[0.16em] text-text-muted mb-2.5">
                    About This Build
                  </h3>
                  <p className="text-[11px] text-text-secondary leading-relaxed flex-1">
                    {active.description}
                  </p>
                  <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-white/6">
                    {aboutMeta.map(([k, v]) => (
                      <div key={k} className="flex flex-col gap-0.5">
                        <span className="text-[8px] uppercase tracking-[0.12em] text-text-muted font-semibold">
                          {k}
                        </span>
                        <span className="text-[11px] text-text-primary font-medium truncate">
                          {v}
                        </span>
                      </div>
                    ))}
                  </div>
                </SpotlightCard>
              </motion.div>

              <motion.div variants={fadeUp} className="col-span-12 md:col-span-4">
                <SpotlightCard className="cf-panel rounded-xl p-3.5 flex flex-col h-full min-h-60 overflow-hidden">
                  <h3 className="text-[9px] font-semibold uppercase tracking-[0.16em] text-text-muted mb-2.5 shrink-0">
                    Recent Activity
                  </h3>
                  <div className="flex flex-col gap-0 flex-1 min-h-0 overflow-y-auto scroll-hidden">
                    {activity.length === 0 && (
                      <div className="flex-1 flex items-center justify-center text-[10px] text-text-muted">
                        No local activity yet
                      </div>
                    )}
                    {activity.map((item) => (
                      <motion.div
                        key={item.id}
                        whileHover={{ y: -1 }}
                        className="flex items-center gap-2 px-1 py-1.5 rounded-md hover:bg-white/3"
                      >
                        <div className="h-7 w-7 rounded-md bg-white/4 border border-border-subtle flex items-center justify-center text-text-secondary shrink-0">
                          <Icon
                            icon={
                              item.kind === "downloads"
                                ? AppIcons.Download
                                : item.kind === "system"
                                  ? AppIcons.Database
                                  : AppIcons.Play
                            }
                            size={12}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-medium text-text-primary truncate">
                            {item.title}
                          </div>
                          <div className="text-[9px] text-text-muted truncate">
                            {item.meta}
                          </div>
                        </div>
                        <span className="text-[9px] text-text-disabled shrink-0">
                          {item.time}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="mt-2 shrink-0 text-[9px] font-semibold uppercase tracking-wide text-text-muted hover:text-primary-base cursor-pointer text-left"
                  >
                    View full history
                  </button>
                </SpotlightCard>
              </motion.div>

              <motion.div variants={fadeUp} className="col-span-12 md:col-span-4">
                <PerformanceChart variant="compact" />
              </motion.div>
            </div>

            {/* Row 2: Update | Quick Actions | Instance Details */}
            <div className="grid grid-cols-12 gap-3 items-stretch">
              <motion.div variants={fadeUp} className="col-span-12 md:col-span-4">
                <SpotlightCard className="cf-panel rounded-xl p-3.5 flex flex-col h-full min-h-50">
                  <h3 className="text-[9px] font-semibold uppercase tracking-[0.16em] text-text-muted mb-2.5">
                    Latest Update
                  </h3>
                  {latestUpdate ? (
                    <>
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span className="text-[13px] font-sora font-bold text-text-primary truncate">
                          {latestUpdate.name}
                        </span>
                        <span className="text-[9px] text-text-muted font-mono shrink-0">
                          {latestUpdate.from} → {latestUpdate.to}
                        </span>
                      </div>
                      <p className="text-[10px] text-text-secondary leading-snug flex-1">
                        {latestUpdate.changelog}
                      </p>
                    </>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center gap-1 text-center">
                      <span className="text-[11px] text-text-primary font-medium">
                        You’re up to date
                      </span>
                      <span className="text-[9px] text-text-muted">
                        Last checked {lastChecked}
                      </span>
                    </div>
                  )}
                </SpotlightCard>
              </motion.div>

              <motion.div variants={fadeUp} className="col-span-12 md:col-span-4">
                <SpotlightCard className="cf-panel rounded-xl p-3.5 flex flex-col h-full min-h-50">
                  <h3 className="text-[9px] font-semibold uppercase tracking-[0.16em] text-text-muted mb-2">
                    Quick Actions
                  </h3>
                  <div className="flex flex-col gap-0 flex-1">
                    {QUICK_ACTIONS.map((a) => (
                      <motion.button
                        key={a.id}
                        type="button"
                        whileHover={{ x: 2 }}
                        onClick={() => openModal(a.id as BuildModalId)}
                        className="flex items-center gap-2 px-1.5 py-2 rounded-md text-left cursor-pointer hover:bg-white/4 group w-full"
                      >
                        <Icon
                          icon={AppIcons[a.icon]}
                          size={13}
                          className="text-text-muted group-hover:text-text-primary shrink-0"
                        />
                        <span className="flex-1 text-[11px] text-text-secondary group-hover:text-text-primary truncate">
                          {a.label}
                        </span>
                        <Icon
                          icon={AppIcons.ChevronRight}
                          size={12}
                          className="text-text-disabled shrink-0"
                        />
                      </motion.button>
                    ))}
                  </div>
                </SpotlightCard>
              </motion.div>

              <motion.div variants={fadeUp} className="col-span-12 md:col-span-4">
                <SpotlightCard className="cf-panel rounded-xl p-3.5 flex flex-col h-full min-h-50">
                  <h3 className="text-[9px] font-semibold uppercase tracking-[0.16em] text-text-muted mb-2.5">
                    Instance Details
                  </h3>
                  <div className="flex flex-col gap-2.5 flex-1">
                    {instanceDetails.map(([k, v]) => (
                      <div key={k} className="flex flex-col gap-0.5">
                        <span className="text-[8px] uppercase tracking-[0.12em] text-text-muted font-semibold">
                          {k}
                        </span>
                        <span className="text-[11px] text-text-primary font-medium truncate">
                          {v}
                        </span>
                      </div>
                    ))}
                    <div className="flex flex-col gap-0.5 pt-2 border-t border-white/6">
                      <span className="text-[8px] uppercase tracking-[0.12em] text-text-muted font-semibold">
                        Install path
                      </span>
                      <span className="text-[10px] text-text-secondary font-mono truncate">
                        {active.location}
                      </span>
                    </div>
                  </div>
                </SpotlightCard>
              </motion.div>
            </div>

            {/* Row 3: Screenshots */}
            <motion.section variants={fadeUp} className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-0.5">
                <h3 className="text-[9px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Screenshots
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Previous screenshots"
                    disabled={shotIndex <= 0}
                    onClick={() => setShotIndex((i) => Math.max(0, i - 1))}
                    className="h-6 w-6 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-white/6 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Icon icon={AppIcons.ChevronLeft} size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="Next screenshots"
                    disabled={shotIndex >= maxShotStart}
                    onClick={() =>
                      setShotIndex((i) => Math.min(maxShotStart, i + 1))
                    }
                    className="h-6 w-6 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-white/6 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Icon icon={AppIcons.ChevronRight} size={14} />
                  </button>
                  <Chip size="sm" variant="soft" color="default">
                    <Chip.Label className="text-[9px]">
                      {active.screenshots.length}
                    </Chip.Label>
                  </Chip>
                </div>
              </div>
              <div className="flex gap-2.5 overflow-hidden">
                {active.screenshots
                  .slice(shotIndex, shotIndex + visibleShots)
                  .map((shot) => (
                    <EntityImage
                      key={shot.id}
                      kind="build"
                      entityId={active.id}
                      source={shot.thumb}
                      alt={`${active.name} screenshot ${shot.id}`}
                      className="flex-1 min-w-0 h-25 rounded-xl overflow-hidden border border-white/8 cf-panel-inset cursor-pointer hover:border-white/[0.14] transition-colors"
                    />
                  ))}
              </div>
            </motion.section>
          </motion.div>
        )}

        {tab === "Performance" && (
          <motion.div
            key="perf"
            initial={pageSwap.initial}
            animate={pageSwap.animate}
            exit={pageSwap.exit}
            transition={pageSwap.transition}
          >
            <PerformancePanel />
          </motion.div>
        )}

        {tab === "Mods" && (
          <motion.div
            key="mods"
            initial={pageSwap.initial}
            animate={pageSwap.animate}
            exit={pageSwap.exit}
            transition={pageSwap.transition}
          >
            <ModsPanel />
          </motion.div>
        )}

        {tab === "Configuration" && (
          <motion.div
            key="config"
            initial={pageSwap.initial}
            animate={pageSwap.animate}
            exit={pageSwap.exit}
            transition={pageSwap.transition}
          >
            <ConfigurationPanel />
          </motion.div>
        )}

        {tab === "Packs" && (
          <motion.div
            key="packs"
            initial={pageSwap.initial}
            animate={pageSwap.animate}
            exit={pageSwap.exit}
            transition={pageSwap.transition}
          >
            <PacksPanel />
          </motion.div>
        )}

        {tab === "World Management" && (
          <motion.div
            key="worlds"
            initial={pageSwap.initial}
            animate={pageSwap.animate}
            exit={pageSwap.exit}
            transition={pageSwap.transition}
          >
            <WorldManagementPanel />
          </motion.div>
        )}

        {tab === "Shaders" && (
          <motion.div
            key="shaders"
            initial={pageSwap.initial}
            animate={pageSwap.animate}
            exit={pageSwap.exit}
            transition={pageSwap.transition}
          >
            <ShadersPanel />
          </motion.div>
        )}

        {tab === "Notes" && (
          <motion.div
            key="notes"
            initial={pageSwap.initial}
            animate={pageSwap.animate}
            exit={pageSwap.exit}
            transition={pageSwap.transition}
          >
            <NotesPanel />
          </motion.div>
        )}

        {tab === "Backups" && (
          <motion.div
            key="backups"
            initial={pageSwap.initial}
            animate={pageSwap.animate}
            exit={pageSwap.exit}
            transition={pageSwap.transition}
          >
            <BackupsPanel />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default BuildsPage;
