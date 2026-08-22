import { useState, type MouseEvent as ReactMouseEvent } from "react";
import { AppIcons } from "./icons";
import { Icon } from "./ico";
import { BadgeButton, HeaderNavigation } from "./frags/app-header/index";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useDownloadStore, useNavigationStore } from "../typlibs";
import { NotificationDrawer } from "./alerts/NotificationDrawer";
import { ThemeLogo } from "./ThemeLogo";
import { useThemeStore } from "../stores/theme";
import { useGlobalChatStore } from "../stores/globalChat";
import { useChloeStore } from "../stores/chloe";
import { useNotificationsStore } from "../stores/notifications";
import { useProfileRouteStore } from "../stores/profileRoute";
import { useAppStore } from "../userstore";
import { UserAvatar } from "./UserAvatar";
import { Sparkles } from "lucide-react";

const appWindow = getCurrentWindow();

function isNoDragTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "button, a, input, textarea, select, [role='button'], [data-no-drag]",
    ),
  );
}

async function startWindowDrag(event: ReactMouseEvent) {
  if (event.button !== 0) return;
  if (isNoDragTarget(event.target)) return;
  try {
    await appWindow.startDragging();
  } catch {
    // Browser / non-desktop preview — ignore.
  }
}

function Header() {
  const [alertsOpen, setAlertsOpen] = useState(false);
  const headerVariant = useThemeStore(
    (s) => s.headerPreview ?? s.headerVariant,
  );
  const downloadCount = useDownloadStore(
    (s) =>
      s.queue.filter(
        (q) =>
          q.status === "active" ||
          q.status === "queued" ||
          q.status === "paused",
      ).length,
  );
  const setPrimaryTab = useNavigationStore((s) => s.setPrimaryTab);
  const setSideItem = useNavigationStore((s) => s.setSideItem);
  const closeProfile = useProfileRouteStore((s) => s.closeProfile);
  const openSelfProfile = useProfileRouteStore((s) => s.openSelf);
  const profileTarget = useProfileRouteStore((s) => s.target);
  const currentUser = useAppStore((s) => s.currentUser);
  const authSource = useAppStore((s) => s.authSource);
  const unread = useNotificationsStore((s) => s.unreadCount);
  const chatUnread = useGlobalChatStore((s) => s.cursor.unreadCount);
  const setChatOpen = useGlobalChatStore((s) => s.setOpen);
  const setChloeOpen = useChloeStore((s) => s.setOpen);

  return (
    <header
      data-tauri-drag-region
      data-header-variant={headerVariant}
      onMouseDown={startWindowDrag}
      className="cf-header main_app_title_bar cf-glass grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 h-16 px-3 select-none w-full shrink-0 z-40 border-b border-white/8 overflow-hidden"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/20 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-white/5 to-transparent" />

      <div
        className="cf-header-brand flex items-center gap-2.5 shrink-0 justify-self-start"
        data-tauri-drag-region
        onMouseDown={startWindowDrag}
      >
        <ThemeLogo className="h-9 w-9 shrink-0 pointer-events-none" />
        <div className="flex flex-col gap-0.5 leading-none pointer-events-none">
          <h1 className="font-sora font-extrabold uppercase tracking-[0.06em] text-white whitespace-nowrap">
            <span className="text-[16px]">Cult</span>
            <span className="text-[16px] text-primary-base">Forge</span>
          </h1>
          <span className="font-rajdhani text-[8px] font-semibold uppercase tracking-[0.22em] text-text-muted whitespace-nowrap">
            Forge your World
          </span>
        </div>
      </div>

      <div
        className="cf-header-nav-slot min-w-0 w-full flex justify-center overflow-hidden px-1"
        data-tauri-drag-region
        onMouseDown={startWindowDrag}
      >
        <div className="max-w-full overflow-x-auto scrollbar-none" data-no-drag>
          <HeaderNavigation />
        </div>
      </div>

      <div
        className="cf-header-right flex items-center gap-1.5 justify-self-end shrink-0"
        data-no-drag
      >
        <div className="cf-header-utilities prime-pill flex items-center gap-0.5 px-1 py-1 rounded-full shrink-0">
          <BadgeButton
            icon="Download"
            badge={downloadCount > 0}
            count={downloadCount}
            ariaLabel={`Open downloads${downloadCount ? `, ${downloadCount} pending` : ""}`}
            title="Downloads"
            onClick={() => {
              closeProfile();
              setPrimaryTab("Home");
              setSideItem("Downloads");
            }}
          />
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            aria-label={`Open global chat${chatUnread ? `, ${chatUnread} unread` : ""}`}
            className="relative flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-all duration-200 hover:text-white hover:bg-white/6 cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70"
            title="Global Chat"
          >
            <Icon icon={AppIcons.Global} size={16} />
            {chatUnread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-3.5 h-3.5 px-0.5 rounded-full bg-primary-base text-[8px] font-bold text-bg-app flex items-center justify-center">
                {chatUnread > 9 ? "9+" : chatUnread}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setChloeOpen(true)}
            aria-label="Open Chloe assistant"
            className="relative flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-all duration-200 hover:text-white hover:bg-white/6 cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70"
            title="Chloe"
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => setAlertsOpen(true)}
            aria-label="Open notifications"
            className="relative flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-all duration-200 hover:text-white hover:bg-white/6 cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70"
            title="Notifications"
          >
            <Icon icon={AppIcons.Notifications} size={16} />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-3.5 h-3.5 px-0.5 rounded-full bg-primary-base text-[8px] font-bold text-bg-app flex items-center justify-center">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
          <BadgeButton
            icon="Settings"
            ariaLabel="Open launcher settings"
            title="Settings"
            onClick={() => {
              closeProfile();
              setPrimaryTab("Home");
              setSideItem("Settings");
            }}
          />

          <div className="w-px h-5 bg-border-strong mx-0.5" />

          <button
            type="button"
            onClick={openSelfProfile}
            aria-label={`Open profile for ${currentUser?.name ?? "you"}`}
            aria-pressed={profileTarget?.kind === "self"}
            className="flex flex-row gap-1.5 items-center cursor-pointer transition-all pl-0.5 pr-1.5 py-0.5 rounded-full hover:bg-white/5 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70 max-w-36"
          >
            <UserAvatar
              src={currentUser?.avatarUrl}
              name={currentUser?.name}
              className="w-7 h-7 rounded-md border border-border-strong"
            />
            <div className="flex flex-col font-inconsolata leading-tight text-left min-w-0">
              <span className="text-white text-[11px] font-bold whitespace-nowrap truncate">
                {currentUser?.name ?? "Player"}
              </span>
              <span className="text-[8px] text-text-secondary flex items-center gap-1">
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${
                    authSource === "cached"
                      ? "bg-state-warning"
                      : currentUser?.status === "online"
                        ? "bg-primary-base"
                        : "bg-text-disabled"
                  }`}
                />
                {authSource === "cached"
                  ? "Cached"
                  : currentUser?.status === "online"
                    ? "Online"
                    : "Offline"}
              </span>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-1.5 pl-0.5 text-text-muted shrink-0">
          <button
            title="Minimize"
            aria-label="Minimize window"
            className="cursor-pointer hover:text-white p-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70"
            onClick={() => appWindow.minimize()}
          >
            <Icon icon={AppIcons.Minimize} size={13} />
          </button>
          <button
            title="Maximize"
            aria-label="Maximize window"
            className="cursor-pointer hover:text-white p-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70"
            onClick={() => appWindow.toggleMaximize()}
          >
            <Icon icon={AppIcons.Maximize} size={13} />
          </button>
          <button
            title="Close"
            aria-label="Close window"
            className="cursor-pointer hover:text-state-error p-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70"
            onClick={() => appWindow.close()}
          >
            <Icon icon={AppIcons.Close} size={15} />
          </button>
        </div>
      </div>

      <NotificationDrawer open={alertsOpen} onOpenChange={setAlertsOpen} />
    </header>
  );
}

export default Header;
