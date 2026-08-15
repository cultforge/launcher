import DiscoverPage from "./DiscoverPage";
import UpdatesPage from "./UpdatesPage";
import FriendsPage from "./FriendsPage";
import SettingsPage from "./SettingsPage";
import DiscordPage from "./DiscordPage";
import {
  staggerContainer,
  fadeUp,
  lift,
  prefersReducedMotion,
} from "../../../../lib/motion";
import { animate, stagger } from "animejs";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Chip } from "@heroui/react";
import { Icon } from "../../../ico";
import { AppIcons } from "../../../icons";
import { useNavigationStore, type PrimaryTab } from "../../../../typlibs";
import {
  QUICK_ACTIONS,
  type ActivityKind,
  type ActivityItem,
  type FeaturedAddon,
} from "../../../../data/homeActivity";
import { useRecentActivity } from "../../../../hooks/useRecentActivity";
import { useUpdatesStore } from "../../../../stores/updates";
import { searchModrinth } from "../../../../lib/modrinth";
import { BuildSwitcher } from "../../../BuildSwitcher";
import { useBuildStore } from "../../../../stores/build";
import {
  useBuildModalsStore,
  type BuildModalId,
} from "../../../../stores/buildModals";
import { SpotlightCard } from "../../../magic/spotlight-card";
import { TiltCard } from "../../../magic/tilt-card";
import { GlareCard } from "../../../magic/glare-card";
import { EntityImage } from "../../../EntityImage";
import DownloadsPage from "./DownloadsPage";
import { canLaunchBuild } from "../../../../lib/launchGate";
import { launchMinecraft } from "../../../../lib/launchMinecraft";
import { useLaunchStore } from "../../../../stores/launch";

function kindIcon(kind: ActivityKind) {
  switch (kind) {
    case "builds":
      return AppIcons.Play;
    case "social":
      return AppIcons.Users;
    case "downloads":
      return AppIcons.Download;
    default:
      return AppIcons.Activity;
  }
}

function ContinueBar() {
  const barRef = useRef<HTMLElement>(null);
  const active = useBuildStore((s) => s.active());
  const starting = useLaunchStore((s) => s.starting);
  const runningBuildId = useLaunchStore((s) => s.runningBuildId);
  const launch = canLaunchBuild(active);
  const busy = starting || runningBuildId === active.id;

  useEffect(() => {
    if (!barRef.current || prefersReducedMotion()) return;
    const anim = animate(barRef.current, {
      opacity: [0, 1],
      translateY: [10, 0],
      duration: 520,
      ease: "outCubic",
    });
    return () => {
      anim.pause();
    };
  }, []);

  return (
    <motion.header
      ref={barRef as never}
      variants={lift}
      initial="rest"
      whileHover="hover"
      className="cf-panel relative flex items-center justify-between gap-4 rounded-xl px-4 py-3.5"
    >
      <div className="relative z-10 flex items-center gap-3.5 min-w-0">
        <EntityImage
          kind="build"
          entityId={active.id}
          source={active.image ?? active.heroLandscape}
          alt={`${active.name} build cover`}
          className={`h-12 w-12 rounded-lg bg-linear-to-br ${active.accent} shrink-0 border border-border-subtle`}
        />
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <BuildSwitcher />
            <Chip color="default" size="sm" variant="soft">
              <Chip.Label>{active.status}</Chip.Label>
            </Chip>
          </div>
          <div className="flex flex-wrap gap-x-2.5 text-[11px] text-text-muted">
            <span>MC {active.mc}</span>
            <span className="opacity-30">·</span>
            <span>{active.loader}</span>
            <span className="opacity-30">·</span>
            <span>{active.mods} mods</span>
            <span className="opacity-30">·</span>
            <span>Last played {active.lastPlayed}</span>
          </div>
        </div>
      </div>
      <div className="relative z-10 shrink-0">
        <button
          type="button"
          disabled={!launch.ok || starting}
          title={launch.reason}
          onClick={() => void launchMinecraft(active)}
          className="cf-btn-primary flex items-center gap-2 px-7 py-2.5 rounded-lg text-[13px] tracking-wide cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
        >
          <Icon icon={AppIcons.Play} size={15} />
          {busy && runningBuildId === active.id
            ? "RUNNING"
            : starting
              ? "STARTING…"
              : "PLAY"}
        </button>
      </div>
    </motion.header>
  );
}

function RecentActivityCard({
  onRow,
}: {
  onRow: (item: ActivityItem) => void;
}) {
  const activity = useRecentActivity(6);
  return (
    <SpotlightCard className="cf-panel rounded-xl h-full overflow-hidden">
      <section className="p-4 flex flex-col min-h-0 h-full overflow-hidden">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted mb-3 shrink-0">
          Recent Activity
        </h3>
        <div className="flex flex-col gap-0.5 flex-1 min-h-0 overflow-y-auto scroll-hidden">
          {activity.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-[11px] text-text-muted">
              No local activity yet
            </div>
          )}
          {activity.map((item, i) => (
            <motion.button
              key={item.id}
              onClick={() => onRow(item)}
              whileHover={{ y: -2, backgroundColor: "rgba(255,255,255,0.04)" }}
              className={`flex items-center gap-3 px-2 py-2.5 rounded-lg text-left cursor-pointer w-full border border-transparent hover:border-white/10 ${
                i > 2 ? "opacity-75" : ""
              }`}
            >
              <div className="h-8 w-8 rounded-md border border-border-subtle flex items-center justify-center shrink-0 bg-white/4 text-text-secondary">
                <Icon icon={kindIcon(item.kind)} size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-medium text-text-primary truncate">
                  {item.title}
                </div>
                <div className="text-[10px] text-text-muted truncate">
                  {item.meta}
                </div>
              </div>
              <span className="text-[10px] text-text-disabled shrink-0">
                {item.time}
              </span>
            </motion.button>
          ))}
        </div>
      </section>
    </SpotlightCard>
  );
}

function LatestUpdateCard() {
  const setSideItem = useNavigationStore((s) => s.setSideItem);
  const updates = useUpdatesStore((s) => s.items);
  const lastChecked = useUpdatesStore((s) => s.lastChecked);
  const latest = updates[0];

  return (
    <SpotlightCard className="cf-panel rounded-xl h-full">
      <section className="p-4 flex flex-col h-full">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted mb-3">
          Latest Update
        </h3>
        {latest ? (
          <>
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <span className="text-[15px] font-sora font-bold text-text-primary truncate">
                {latest.name}
              </span>
              <span className="text-[10px] text-text-muted shrink-0 font-mono">
                {latest.from} → {latest.to}
              </span>
            </div>
            <p className="text-[11px] text-text-secondary leading-snug flex-1">
              {latest.changelog}
            </p>
            {updates.length > 1 && (
              <p className="text-[10px] text-text-muted mt-2">
                +{updates.length - 1} more update
                {updates.length > 2 ? "s" : ""} pending
              </p>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-1.5 text-center">
            <Icon
              icon={AppIcons.Download}
              size={20}
              className="text-primary-base/60"
            />
            <span className="text-[12px] text-text-primary font-medium">
              You’re up to date
            </span>
            <span className="text-[10px] text-text-muted">
              Last checked {lastChecked}
            </span>
          </div>
        )}
        <button
          onClick={() => setSideItem("Updates")}
          className="mt-3 text-left text-[10px] font-semibold uppercase tracking-wide text-primary-base hover:underline cursor-pointer"
        >
          Open Updates
        </button>
      </section>
    </SpotlightCard>
  );
}

function QuickActionsCard() {
  const openModal = useBuildModalsStore((s) => s.openModal);
  return (
    <SpotlightCard className="cf-panel rounded-xl h-full">
      <section className="p-4 flex flex-col h-full">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted mb-2">
          Quick Actions
        </h3>
        <div className="flex flex-col gap-0.5 flex-1">
          {QUICK_ACTIONS.map((a) => (
            <motion.button
              key={a.id}
              type="button"
              whileHover={{ y: -2, x: 2 }}
              onClick={() => openModal(a.id as BuildModalId)}
              className="flex items-center gap-2.5 px-2 py-2.5 rounded-lg text-left cursor-pointer hover:bg-white/4 transition-colors group w-full border border-transparent hover:border-white/10"
            >
              <Icon
                icon={AppIcons[a.icon]}
                size={15}
                className="text-text-muted group-hover:text-primary-base shrink-0"
              />
              <span className="flex-1 text-[12px] text-text-secondary group-hover:text-text-primary truncate">
                {a.label}
              </span>
              <Icon
                icon={AppIcons.ChevronRight}
                size={14}
                className="text-text-disabled shrink-0"
              />
            </motion.button>
          ))}
        </div>
      </section>
    </SpotlightCard>
  );
}

function formatDownloads(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(0)}K`;
  return String(count);
}

function FeaturedAddons() {
  const setPrimaryTab = useNavigationStore((s) => s.setPrimaryTab);
  const setSideItem = useNavigationStore((s) => s.setSideItem);
  const rowRef = useRef<HTMLDivElement>(null);
  const [addons, setAddons] = useState<FeaturedAddon[]>([]);

  useEffect(() => {
    if (!navigator.onLine) return;
    let cancelled = false;
    searchModrinth({ limit: 5 })
      .then((res) => {
        if (cancelled) return;
        setAddons(
          res.hits.map((hit) => ({
            id: hit.project_id,
            title: hit.title,
            tag:
              hit.project_type === "shader"
                ? "Shader"
                : hit.project_type === "resourcepack"
                  ? "Pack"
                  : "Mod",
            rating: formatDownloads(hit.follows ?? 0),
            downloads: formatDownloads(hit.downloads ?? 0),
            image: hit.icon_url ?? undefined,
          })),
        );
      })
      .catch(() => {
        // Offline / API down: section simply stays hidden.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!rowRef.current || prefersReducedMotion()) return;
    const cards = rowRef.current.querySelectorAll("[data-addon-card]");
    if (!cards.length) return;
    const anim = animate(cards, {
      opacity: [0, 1],
      translateY: [14, 0],
      delay: stagger(55),
      duration: 420,
      ease: "outCubic",
    });
    return () => {
      anim.pause();
    };
  }, [addons.length]);

  if (addons.length === 0) return null;

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between px-0.5">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          Featured Add-ons
        </h3>
        <button
          onClick={() => {
            setPrimaryTab("Store");
            setSideItem("");
          }}
          className="text-[10px] font-semibold uppercase tracking-wide text-primary-base hover:underline cursor-pointer"
        >
          Browse Store
        </button>
      </div>
      <div
        ref={rowRef}
        className="flex gap-3 overflow-x-auto scroll-hidden pb-1"
      >
        {addons.map((a) => (
          <TiltCard key={a.id} className="shrink-0">
            <GlareCard className="rounded-xl">
              <button
                data-addon-card
                onClick={() => {
                  setPrimaryTab("Store");
                  setSideItem("");
                }}
                className="cf-panel cf-panel-hover min-w-37 max-w-37 rounded-xl overflow-hidden text-left cursor-pointer flex flex-col"
              >
                <EntityImage
                  kind={
                    a.tag.toLowerCase().includes("shader")
                      ? "shader"
                      : a.tag.toLowerCase().includes("pack")
                        ? "resource-pack"
                        : "mod"
                  }
                  entityId={a.id}
                  source={a.image}
                  alt={`${a.title} artwork`}
                  className="h-18 w-full bg-bg-overlay"
                />
                <div className="p-2.5 flex flex-col gap-1">
                  <Chip size="sm" variant="soft" color="default">
                    <Chip.Label>{a.tag}</Chip.Label>
                  </Chip>
                  <span className="text-[12px] font-medium text-text-primary truncate">
                    {a.title}
                  </span>
                  <span className="text-[10px] text-text-muted flex items-center gap-1">
                    <Icon
                      icon={AppIcons.Star}
                      size={10}
                      className="text-primary-base"
                    />
                    {a.rating}
                    <span className="opacity-40 mx-0.5">·</span>
                    {a.downloads}
                  </span>
                </div>
              </button>
            </GlareCard>
          </TiltCard>
        ))}
      </div>
    </section>
  );
}

function HomeDashboard() {
  const setSideItem = useNavigationStore((s) => s.setSideItem);
  const setPrimaryTab = useNavigationStore((s) => s.setPrimaryTab);

  const onRow = (item: ActivityItem) => {
    if (item.action === "updates") {
      setSideItem("Updates");
      return;
    }
    if (item.action === "builds") {
      setPrimaryTab("Builds" as PrimaryTab);
      setSideItem("Builds");
      return;
    }
    if (item.action === "store") {
      setPrimaryTab("Store" as PrimaryTab);
      setSideItem("");
      return;
    }
    if (item.action === "guilds") {
      setPrimaryTab("Guilds" as PrimaryTab);
      setSideItem("Guilds");
    }
  };

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="h-full overflow-y-auto scroll-hidden p-4 pb-24 flex flex-col gap-3.5"
    >
      <motion.div variants={fadeUp}>
        <ContinueBar />
      </motion.div>
      <div className="grid grid-cols-12 gap-3.5 min-h-70">
        <motion.div variants={fadeUp} className="col-span-5 min-h-0">
          <RecentActivityCard onRow={onRow} />
        </motion.div>
        <motion.div variants={fadeUp} className="col-span-4 min-h-0">
          <LatestUpdateCard />
        </motion.div>
        <motion.div variants={fadeUp} className="col-span-3 min-h-0">
          <QuickActionsCard />
        </motion.div>
      </div>
      <motion.div variants={fadeUp}>
        <FeaturedAddons />
      </motion.div>
    </motion.div>
  );
}

function HomePage() {
  const sideItem = useNavigationStore((s) => s.sideItem);
  if (sideItem === "Discover") return <DiscoverPage />;
  if (sideItem === "Updates") return <UpdatesPage />;
  if (sideItem === "Friends") return <FriendsPage />;
  if (sideItem === "Discord") return <DiscordPage />;
  if (sideItem === "Settings") return <SettingsPage />;
  if (sideItem === "Downloads") return <DownloadsPage />;
  return <HomeDashboard />;
}

export default HomePage;
