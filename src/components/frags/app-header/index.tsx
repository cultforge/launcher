import { useNavigationStore, PrimaryTab } from "../../../typlibs";
import { AppIcons } from "../../icons";
import { Icon } from "../../ico";
import { motion, useReducedMotion } from "framer-motion";
import { HeaderTabs } from "../../../manifest";
import { useProfileRouteStore } from "../../../stores/profileRoute";
import { useGuildStore } from "../../../stores/guilds";
import { homeBuildsSideItem } from "../../../lib/homeNav";
import { useAdminSessionStore } from "../../../stores/adminSession";
import { useAdminRouteStore } from "../../../stores/adminRoute";
import { useServerAdminStore } from "../../../stores/serverAdmin";
import { useMemo } from "react";

function NavButton({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const icon =
    label === "Guilds"
      ? AppIcons.Crown
      : label === "Admin"
        ? AppIcons.Security
        : (AppIcons[label as keyof typeof AppIcons] ?? AppIcons.Home);

  return (
    <button
      onClick={onClick}
      data-active={isActive}
      aria-pressed={isActive}
      className={`cf-header-nav-item relative flex items-center gap-1.5 h-8 px-3 rounded-full cursor-pointer transition-all duration-200 active:scale-95 font-sora text-[12.5px] font-medium tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70 ${
        isActive
          ? "text-white prime-active-nav"
          : "text-text-muted border border-transparent hover:text-text-secondary hover:bg-white/4"
      }`}
    >
      <Icon
        icon={icon}
        size={15}
        className={
          isActive
            ? "text-primary-base/80"
            : label === "Guilds"
              ? "text-text-muted"
              : ""
        }
      />
      <span>{label}</span>
      {isActive && (
        <motion.span
          layoutId="header-active-pill"
          className="absolute inset-0 rounded-full pointer-events-none -z-10"
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 400, damping: 30 }
          }
        />
      )}
    </button>
  );
}

function BadgeButton({
  icon,
  badge = false,
  count,
  onClick,
  ariaLabel,
  title,
}: {
  icon: keyof typeof AppIcons;
  badge?: boolean;
  count?: number;
  onClick?: () => void;
  ariaLabel?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? icon}
      title={title ?? icon}
      className="relative flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-all duration-200 hover:text-white hover:bg-bg-elevated/80 cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70"
    >
      <Icon icon={AppIcons[icon]} size={16} />
      {badge && count !== undefined && count > 0 ? (
        <span className="absolute -top-0.5 -right-0.5 min-w-3.5 h-3.5 px-0.5 rounded-full bg-primary-base text-[8px] font-bold text-bg-app flex items-center justify-center">
          {count}
        </span>
      ) : (
        badge && (
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary-base/70" />
        )
      )}
    </button>
  );
}

function HeaderNavigation() {
  const primaryTab = useNavigationStore((s) => s.primaryTab);
  const setPrimaryTab = useNavigationStore((s) => s.setPrimaryTab);
  const setSideItem = useNavigationStore((s) => s.setSideItem);
  const closeProfile = useProfileRouteStore((s) => s.closeProfile);
  const isPlatformAdmin = useAdminSessionStore((s) => s.isPlatformAdmin);
  const resetAdminRoute = useAdminRouteStore((s) => s.reset);
  const closeServerAdmin = useServerAdminStore((s) => s.close);

  const tabs = useMemo(() => {
    if (isPlatformAdmin !== true) return HeaderTabs;
    if (HeaderTabs.includes("Admin")) return HeaderTabs;
    return [...HeaderTabs, "Admin" as PrimaryTab];
  }, [isPlatformAdmin]);

  return (
    <nav
      aria-label="Primary navigation"
      className="cf-header-nav prime-pill flex flex-row items-center gap-0.5 px-1.5 py-1 rounded-full"
    >
      {tabs.map((item) => (
        <NavButton
          key={item}
          label={item}
          isActive={primaryTab === item}
          onClick={() => {
            closeProfile();
            if (primaryTab === "Admin" && item !== "Admin") {
              resetAdminRoute();
              closeServerAdmin();
            }
            setPrimaryTab(item as PrimaryTab);
            if (item === "Home") setSideItem(homeBuildsSideItem());
            else if (item === "Guilds") {
              setSideItem("Guilds");
              useGuildStore.getState().setDiscoverOpen(false);
              useGuildStore.getState().setHubTab("Overview");
            } else if (item === "Mods") setSideItem("Library");
            else if (item === "Servers") setSideItem("All");
            else if (item === "Admin") {
              resetAdminRoute();
              closeServerAdmin();
              setSideItem("Admin");
            } else setSideItem("");
          }}
        />
      ))}
    </nav>
  );
}

export { BadgeButton, NavButton, HeaderNavigation };
