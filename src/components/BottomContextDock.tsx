import { AnimatePresence, motion } from "framer-motion";
import { useDownloadStore, useNavigationStore } from "../typlibs";
import { useBuildStore } from "../stores/build";
import { useUpdatesStore } from "../stores/updates";
import { useLaunchStore } from "../stores/launch";
import {
  dockClearanceCss,
  useContextDockStore,
} from "../stores/contextDock";
import { cancelNativeDownload } from "../lib/nativeDownloads";
import { canLaunchBuild } from "../lib/launchGate";
import { launchMinecraft } from "../lib/launchMinecraft";
import { APP_VERSION } from "../manifest";
import { AppIcons } from "./icons";
import { Icon } from "./ico";
import { LobbyMusicControls } from "./LobbyMusicControls";
import { toast } from "sonner";
import { useEffect } from "react";
import { cn } from "../lib/cn";
import { isHomeBuildsView } from "../lib/homeNav";

const spring = { type: "spring" as const, stiffness: 420, damping: 30, mass: 0.85 };

function BottomContextDock() {
  const collapsed = useContextDockStore((s) => s.collapsed);
  const toggleCollapsed = useContextDockStore((s) => s.toggleCollapsed);

  const primaryTab = useNavigationStore((s) => s.primaryTab);
  const sideItem = useNavigationStore((s) => s.sideItem);
  const setPrimaryTab = useNavigationStore((s) => s.setPrimaryTab);
  const setSideItem = useNavigationStore((s) => s.setSideItem);
  const onHomeBuilds = isHomeBuildsView(primaryTab, sideItem);

  const activeBuild = useBuildStore((s) => s.active());
  const pendingUpdates = useUpdatesStore(
    (s) => s.items.filter((u) => u.status !== "done").length,
  );
  const starting = useLaunchStore((s) => s.starting);
  const runningBuildId = useLaunchStore((s) => s.runningBuildId);
  const launch = canLaunchBuild(activeBuild);
  const playBusy = starting || runningBuildId === activeBuild.id;

  const queue = useDownloadStore((s) => s.queue);
  const update = useDownloadStore((s) => s.update);

  const activeDownload =
    queue.find((q) => q.status === "active") ??
    queue.find((q) => q.status === "queued") ??
    queue.find((q) => q.status === "paused");

  const nextDownload = queue.find(
    (q) =>
      q.id !== activeDownload?.id &&
      (q.status === "queued" || q.status === "active"),
  );

  const activeCount = queue.filter(
    (q) => q.status === "active" || q.status === "queued" || q.status === "paused",
  ).length;

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--cf-dock-clear",
      dockClearanceCss(collapsed),
    );
  }, [collapsed]);

  return (
    <div className="absolute inset-x-[2%] bottom-[2%] z-30 flex justify-center pointer-events-none">
      <AnimatePresence mode="wait" initial={false}>
        {collapsed ? (
          <motion.button
            key="dock-collapsed"
            type="button"
            initial={{ opacity: 0, y: 18, scale: 0.82 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.88 }}
            transition={spring}
            onClick={toggleCollapsed}
            aria-label="Expand context bar"
            title="Expand context bar"
            className={cn(
              "pointer-events-auto relative flex h-11 items-center gap-2 rounded-full",
              "border border-white/10 bg-bg-card/90 px-3.5 shadow-[0_8px_28px_rgba(0,0,0,0.55)]",
              "cf-panel backdrop-blur-md cursor-pointer",
              "hover:border-primary-base/35 hover:bg-bg-card",
            )}
          >
            <Icon
              icon={AppIcons.Activity}
              size={16}
              className="text-primary-base"
            />
            <span className="text-[11px] font-semibold text-text-secondary">
              Context
            </span>
            {activeCount > 0 && (
              <span className="min-w-4.5 h-4.5 px-1.5 flex items-center justify-center text-[10px] font-bold rounded-full bg-primary-base/20 text-primary-base border border-primary-base/30">
                {activeCount}
              </span>
            )}
            <Icon
              icon={AppIcons.ChevronDown}
              size={14}
              className="rotate-180 text-text-muted"
            />
          </motion.button>
        ) : (
          <motion.div
            key="dock-expanded"
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={spring}
            className="pointer-events-auto w-full origin-bottom"
          >
            <div className="cf-panel rounded-xl border border-white/8 min-h-14 h-14 px-3 sm:px-5 flex items-center gap-2 sm:gap-3 shadow-[0_8px_28px_rgba(0,0,0,0.55)]">
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label="Minimize context bar"
                title="Minimize context bar"
                className="shrink-0 cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-white/6 hover:text-text-primary"
              >
                <Icon
                  icon={AppIcons.ChevronDown}
                  size={16}
                />
              </button>

              <div className="flex items-center gap-2.5 shrink-0">
                <span className="text-[11px] font-mono text-text-disabled">
                  {APP_VERSION}
                </span>
                {activeCount > 0 && (
                  <span className="min-w-4.5 h-4.5 px-1.5 flex items-center justify-center text-[10px] font-bold rounded-full bg-primary-base/20 text-primary-base border border-primary-base/30">
                    {activeCount}
                  </span>
                )}
              </div>

              <div className="h-6 w-px bg-white/8 shrink-0" />

              <LobbyMusicControls />

              <div className="h-6 w-px bg-white/8 shrink-0 hidden sm:block" />

              {activeDownload ? (
                <>
                  <Icon
                    icon={AppIcons.Download}
                    size={16}
                    className="text-primary-base shrink-0"
                  />
                  <button
                    type="button"
                    aria-label="Open Downloads page"
                    onClick={() => {
                      setPrimaryTab("Home");
                      setSideItem("Downloads");
                    }}
                    className="flex min-w-0 flex-1 flex-col gap-1 text-left cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70"
                  >
                    <div className="flex items-center justify-between gap-3 text-[12px]">
                      <span className="text-text-primary truncate font-medium">
                        {activeDownload.name}
                        <span className="text-text-muted font-normal ml-2">
                          {Math.round(activeDownload.progress)}% ·{" "}
                          {activeDownload.doneMb.toFixed(1)}/
                          {activeDownload.totalMb.toFixed(1)} MB
                        </span>
                      </span>
                      {nextDownload && (
                        <span className="text-text-muted shrink-0 text-[11px] hidden md:block">
                          Next: {nextDownload.name}
                        </span>
                      )}
                    </div>
                    <div className="w-full h-1.5 bg-bg-overlay rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-base rounded-full transition-all duration-300"
                        style={{ width: `${activeDownload.progress}%` }}
                      />
                    </div>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      className="p-2 text-text-secondary hover:text-state-error cursor-pointer rounded-md hover:bg-white/4"
                      title="Cancel"
                      onClick={async () => {
                        const jobId = activeDownload.jobId ?? activeDownload.id;
                        try {
                          await cancelNativeDownload(jobId);
                        } catch (e) {
                          toast.error(
                            e instanceof Error ? e.message : "Cancel failed",
                          );
                        }
                        update(activeDownload.id, {
                          status: "error",
                          phase: "cancelled",
                          error: "Cancelled",
                        });
                      }}
                    >
                      <Icon icon={AppIcons.Close} size={15} />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0 flex items-center gap-2.5">
                    {onHomeBuilds && (
                      <>
                        <Icon
                          icon={AppIcons.Builds}
                          size={16}
                          className="text-primary-base/70 shrink-0"
                        />
                        <span className="text-[12px] text-text-secondary truncate">
                          <span className="text-text-primary font-medium">
                            {activeBuild.name}
                          </span>
                          <span className="text-text-muted mx-1.5">·</span>
                          <span>{activeBuild.status}</span>
                          <span className="text-text-muted mx-1.5">·</span>
                          <span className="text-text-muted">
                            Last played {activeBuild.lastPlayed}
                          </span>
                        </span>
                      </>
                    )}
                    {primaryTab === "Home" && !onHomeBuilds && (
                      <>
                        <Icon
                          icon={AppIcons.Newspaper}
                          size={16}
                          className="text-text-muted shrink-0"
                        />
                        <button
                          type="button"
                          className="text-[12px] text-text-secondary hover:text-text-primary truncate cursor-pointer text-left"
                          onClick={() => {
                            setPrimaryTab("Home");
                            setSideItem("Updates");
                          }}
                        >
                          {pendingUpdates > 0
                            ? `${pendingUpdates} update${pendingUpdates === 1 ? "" : "s"} available`
                            : "Up to date"}
                        </button>
                      </>
                    )}
                    {!onHomeBuilds && primaryTab !== "Home" && (
                      <>
                        <Icon
                          icon={AppIcons.Activity}
                          size={16}
                          className="text-text-muted shrink-0"
                        />
                        <span className="text-[12px] text-text-muted truncate">
                          Launcher idle
                        </span>
                      </>
                    )}
                  </div>

                  {onHomeBuilds && (
                    <button
                      type="button"
                      disabled={!launch.ok || starting}
                      title={launch.reason}
                      onClick={() => void launchMinecraft(activeBuild)}
                      className="cf-btn-primary flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold tracking-wide cursor-pointer shrink-0 disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                      <Icon icon={AppIcons.Play} size={13} />
                      {playBusy && runningBuildId === activeBuild.id
                        ? "RUNNING"
                        : starting
                          ? "STARTING…"
                          : "PLAY"}
                    </button>
                  )}
                  {primaryTab === "Home" && !onHomeBuilds && (
                    <button
                      type="button"
                      className="px-3.5 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wide text-text-secondary hover:text-text-primary border border-white/10 hover:bg-white/4 cursor-pointer shrink-0"
                      onClick={() => {
                        setPrimaryTab("Home");
                        setSideItem("Updates");
                      }}
                    >
                      Updates
                    </button>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default BottomContextDock;
