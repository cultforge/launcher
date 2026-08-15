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
import { useUpdatesStore } from "../../../stores/updates";
import { useMemo } from "react";

function SideBadge({ badge }: { badge: string | number }) {
  const isNew = String(badge).toUpperCase() === "NEW";
  return (
    <span
      className={
        isNew
          ? "ml-auto text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded-sm bg-accent-delta/25 text-accent-delta border border-accent-delta/30"
          : "ml-auto min-w-4 h-4 px-1 flex items-center justify-center text-[9px] font-bold rounded-full bg-primary-base text-bg-app shadow-[0_0_8px_var(--color-glow-secondary)]"
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
        className={`cf-side-nav-item relative flex h-10 w-10 items-center justify-center rounded-lg cursor-pointer transition-all duration-200 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70 ${
          isActive
            ? "text-primary-base bg-primary-base/12 border border-primary-base/45 shadow-[0_0_14px_var(--color-glow-secondary)]"
            : "text-text-muted hover:text-text-secondary hover:bg-bg-elevated/70 border border-transparent"
        }`}
      >
        <Icon icon={icon} size={19} />
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
      className={`cf-side-nav-item relative group flex w-full items-center gap-3 px-3 py-1.75 rounded-lg cursor-pointer transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70 ${
        isActive
          ? "text-text-primary bg-primary-base/11 border border-primary-base/30"
          : "text-text-muted/85 border border-transparent hover:text-text-secondary hover:bg-white/3"
      }`}
    >
      {isActive && (
        <motion.span
          layoutId="side-active-bar"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.75 h-4.5 rounded-r-full bg-primary-base shadow-[0_0_8px_var(--color-primary-base)]"
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 380, damping: 32 }
          }
        />
      )}
      <Icon
        icon={icon}
        size={17}
        className={`shrink-0 transition-colors ${
          isActive
            ? "text-primary-base"
            : "text-text-muted group-hover:text-text-secondary"
        }`}
      />
      <span
        className={`text-[12.5px] font-medium tracking-wide truncate ${
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

  const smenu = useMemo(() => {
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
      if (section.section !== "Account") return section;
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
  }, [isPlatformAdmin, pendingUpdates]);

  if (primaryTab === "Store") return null;

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
      {/* Always-visible collapse control */}
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
            : "flex flex-col gap-4 px-2.5 py-3"
        }`}
      >
        {smenu.map((section) => (
          <div
            key={section.section}
            className={`cf-side-nav-section flex flex-col ${collapsed ? "items-center gap-1.5" : "gap-1"}`}
          >
            {!collapsed && (
              <div className="cf-side-nav-section-label px-2.5 mb-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-text-disabled/80">
                {section.section}
              </div>
            )}
            {collapsed && section !== smenu[0] && (
              <div className="w-6 h-px bg-border-subtle my-1" />
            )}
            <div className={`flex flex-col ${collapsed ? "gap-1.5" : "gap-0.5"}`}>
              {section.options.map((item) => (
                <SideNavItem
                  key={item.label}
                  label={item.label}
                  icon={item.icon}
                  collapsed={collapsed}
                  badge={item.badge}
                  isActive={sideItem === item.label}
                  onClick={() => {
                    closeProfile();
                    setSideItem(item.label);
                    if (item.primaryTab) {
                      setPrimaryTab(item.primaryTab as PrimaryTab);
                    }
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

    </aside>
  );
}

export default NavigationBar;
