import { motion, useReducedMotion } from "framer-motion";
import { Icon } from "../../ico";
import { AppIcons } from "../../icons";
import {
  NavigationBarProps,
  useNavigationStore,
  PrimaryTab,
} from "../../../typlibs";
import { SideMenus } from "../../../manifest";
import { useThemeStore } from "../../../stores/theme";
import { useProfileRouteStore } from "../../../stores/profileRoute";
import { useAdminSessionStore } from "../../../stores/adminSession";
import { useAdminRouteStore } from "../../../stores/adminRoute";
import { useServerAdminStore } from "../../../stores/serverAdmin";
import { useUpdatesStore } from "../../../stores/updates";
import { useMemo } from "react";
import { useGuildStore } from "../../../stores/guilds";
import {
  communityLabelToHubTab,
  isCommunityNavActive,
} from "../../../lib/guildUi";
import { HOME_BUILDS_SIDE, isHomeBuildsView } from "../../../lib/homeNav";

function SideBadge({ badge }: { badge: string | number }) {
  const isNew = String(badge).toUpperCase() === "NEW";
  return (
    <span
      className={
        isNew
          ? "ml-auto shrink-0 self-center text-[9px] font-bold leading-none tracking-wide px-1.5 py-0.5 rounded-sm bg-accent-delta/25 text-accent-delta border border-accent-delta/30"
          : "ml-auto shrink-0 self-center min-w-4 h-4 px-1 flex items-center justify-center text-[9px] font-bold leading-none rounded-full bg-primary-base text-bg-app shadow-[0_0_8px_var(--color-glow-secondary)]"
      }
    >
      {badge}
    </span>
  );
}

function SideNavItem({
  label,
  icon,
  isActive = false,
  collapsed,
  badge,
  onClick,
}: {
  label: string;
  icon: any;
  isActive: boolean;
  collapsed: boolean;
  badge?: string | number;
  onClick: () => void;
}) {
  const reduceMotion = useReducedMotion();
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onClick}
        data-active={isActive}
        aria-current={isActive ? "page" : undefined}
        title={label}
        className={`cf-side-nav-item relative flex h-10 w-10 items-center justify-center rounded-xl cursor-pointer transition-all duration-200 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70 ${
          isActive
            ? "text-primary-base bg-primary-base/12 border border-primary-base/45 shadow-[0_0_14px_var(--color-glow-secondary)]"
            : "text-text-muted hover:text-text-secondary hover:bg-bg-elevated/70 border border-transparent"
        }`}
      >
        <span className="cf-side-nav-icon grid h-5 w-5 place-items-center" aria-hidden>
          <Icon icon={icon} size={19} />
        </span>
        {badge !== undefined && (
          <span className="absolute -top-0.5 -right-0.5 min-w-3.5 h-3.5 px-0.5 flex items-center justify-center text-[8px] font-bold rounded-full bg-primary-base text-bg-app">
            {typeof badge === "number" ? badge : "!"}
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      data-active={isActive}
      aria-current={isActive ? "page" : undefined}
      title={label}
      className={`cf-side-nav-item relative group flex w-full h-9 items-center gap-2.5 px-2.5 rounded-lg cursor-pointer transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70 ${
        isActive
          ? "text-text-primary bg-primary-base/11 border border-primary-base/30"
          : "text-text-muted/85 border border-transparent hover:text-text-secondary hover:bg-white/3"
      }`}
    >
      {isActive && (
        <motion.span
          layoutId="side-active-bar"
          className="cf-side-nav-active-bar absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-r-full bg-primary-base shadow-[0_0_8px_var(--color-primary-base)]"
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 380, damping: 32 }
          }
        />
      )}
      <span
        className={`cf-side-nav-icon grid h-4 w-4 shrink-0 place-items-center transition-colors ${
          isActive
            ? "text-primary-base"
            : "text-text-muted group-hover:text-text-secondary"
        }`}
        aria-hidden
      >
        <Icon icon={icon} size={16} />
      </span>
      <span
        className={`min-w-0 flex-1 text-left text-[12.5px] font-medium leading-none tracking-wide truncate ${
          isActive ? "text-text-primary" : ""
        }`}
      >
        {label}
      </span>
      {badge !== undefined && <SideBadge badge={badge} />}
    </button>
  );
}

function NavigationBar({ collapsed, onToggle }: Omit<NavigationBarProps, "smenu">) {
  const primaryTab = useNavigationStore((s) => s.primaryTab);
  const sideItem = useNavigationStore((s) => s.sideItem);
  const setPrimaryTab = useNavigationStore((s) => s.setPrimaryTab);
  const setSideItem = useNavigationStore((s) => s.setSideItem);
  const closeProfile = useProfileRouteStore((s) => s.closeProfile);
  const sideVariant = useThemeStore(
    (s) => s.sideNavPreview ?? s.sideNavVariant,
  );
  const isPlatformAdmin = useAdminSessionStore((s) => s.isPlatformAdmin);
  const pendingUpdates = useUpdatesStore(
    (s) => s.items.filter((u) => u.status !== "done").length,
  );
  const hubTab = useGuildStore((s) => s.hubTab);
  const discoverOpen = useGuildStore((s) => s.discoverOpen);
  const setHubTab = useGuildStore((s) => s.setHubTab);
  const setDiscoverOpen = useGuildStore((s) => s.setDiscoverOpen);

  const smenu = useMemo(() => {
    if (primaryTab === "Servers" && SideMenus.Servers.length > 0) {
      return SideMenus.Servers;
    }
    // Always show the full Home menu — header tab controls viewport; sidenav stays stable.
    const withLiveBadges = SideMenus.Home.map((section) => ({
      ...section,
      options: section.options.map((item) => {
        if (item.label !== "Updates") return item;
        return {
          ...item,
          badge: pendingUpdates > 0 ? pendingUpdates : undefined,
        };
      }),
    }));
    if (!isPlatformAdmin) return withLiveBadges;
    return withLiveBadges.map((section) => {
      if (section.section !== "You") return section;
      // Avoid duplicate Admin if already present
      if (section.options.some((o) => o.label === "Admin")) return section;
      return {
        ...section,
        options: [
          ...section.options,
          {
            label: "Admin",
            icon: AppIcons.Security,
            primaryTab: "Admin" as PrimaryTab,
          },
        ],
      };
    });
  }, [isPlatformAdmin, pendingUpdates, primaryTab]);

  if (primaryTab === "Store") return null;
  // Platform admin is a full-bleed console — keep launcher chrome but no Home rail noise.
  if (primaryTab === "Admin") return null;

  return (
    <aside
      id="launcher-side-navigation"
      aria-label="Launcher navigation"
      data-side-variant={sideVariant}
      data-collapsed={collapsed}
      className={`cf-side-nav cf-glass relative h-full shrink-0 flex flex-col border-r border-white/8 transition-[width] duration-300 ease-out ${
        collapsed ? "w-17" : "w-58"
      }`}
    >
      <div
        className={`cf-side-nav-header shrink-0 flex items-center border-b border-border-subtle ${
          collapsed ? "justify-center px-2 py-3" : "justify-between px-3 py-2.5"
        }`}
      >
        {!collapsed && (
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-disabled px-1">
            Navigate
          </span>
        )}
        <button
          onClick={onToggle}
          type="button"
          aria-controls="launcher-side-navigation"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/30 text-text-secondary hover:text-primary-base hover:border-primary-base/40 cursor-pointer transition-all shadow-sm active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Icon
            icon={collapsed ? AppIcons.ArrowBarRight : AppIcons.ArrowBarLeft}
            size={14}
          />
        </button>
      </div>

      <div
        className={`cf-side-nav-scroll flex-1 min-h-0 overflow-y-auto scroll-hidden pb-24 ${
          collapsed
            ? "flex flex-col items-center gap-2 py-3 px-2"
            : "flex flex-col gap-5 px-2 py-3"
        }`}
      >
        {smenu.map((section) => (
          <div
            key={section.section}
            className={`cf-side-nav-section flex flex-col ${collapsed ? "items-center gap-1.5" : "gap-1.5"}`}
          >
            {!collapsed && (
              <div className="cf-side-nav-section-label px-2.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-text-disabled/80 leading-none">
                {section.section}
              </div>
            )}
            {collapsed && section !== smenu[0] && (
              <div className="w-6 h-px bg-border-subtle my-1" />
            )}
            <div className={`flex flex-col ${collapsed ? "gap-1.5" : "gap-0.5"}`}>
              {section.options.map((item) => {
                const guildShortcut = communityLabelToHubTab(item.label);
                const isBuildsHome =
                  item.label === HOME_BUILDS_SIDE &&
                  isHomeBuildsView(primaryTab, sideItem);
                const guildCommunity =
                  item.label === "Discover" || guildShortcut != null;
                const isActive = guildCommunity
                  ? isCommunityNavActive(
                      item.label,
                      primaryTab,
                      hubTab,
                      discoverOpen,
                    )
                  : isBuildsHome ||
                    (item.label === sideItem &&
                      (item.primaryTab === primaryTab ||
                        (item.primaryTab === "Home" &&
                          primaryTab === "Home")));
                return (
                <SideNavItem
                  key={item.label}
                  label={item.label}
                  icon={item.icon}
                  collapsed={collapsed}
                  badge={item.badge}
                  isActive={isActive}
                  onClick={() => {
                    closeProfile();
                    if (item.label === "Discover" && item.primaryTab === "Guilds") {
                      setPrimaryTab("Guilds");
                      setSideItem("Guilds");
                      setDiscoverOpen(true);
                      return;
                    }
                    const guildShortcut = communityLabelToHubTab(item.label);
                    if (item.primaryTab === "Guilds" && guildShortcut) {
                      setPrimaryTab("Guilds");
                      setSideItem("Guilds");
                      setDiscoverOpen(false);
                      setHubTab(guildShortcut);
                      return;
                    }
                    if (item.label === HOME_BUILDS_SIDE) {
                      setPrimaryTab("Home");
                      setSideItem(HOME_BUILDS_SIDE);
                      return;
                    }
                    if (item.primaryTab === "Admin" || item.label === "Admin") {
                      useAdminRouteStore.getState().reset();
                      useServerAdminStore.getState().close();
                      setSideItem("Admin");
                      setPrimaryTab("Admin");
                      return;
                    }
                    setSideItem(item.label);
                    if (item.primaryTab) {
                      setPrimaryTab(item.primaryTab as PrimaryTab);
                    }
                  }}
                />
              );
              })}
            </div>
          </div>
        ))}
      </div>

    </aside>
  );
}

export default NavigationBar;
