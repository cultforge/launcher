import Header from "./header";
import Viewport from "./frags/app-viewport/index";
import NavigationBar from "./frags/app-sidenavbar";
import BottomContextDock from "./BottomContextDock";
import { BgAtmosphere } from "./fx/BgAtmosphere";
import { BuildActionModalsHost } from "./modals/BuildActionModals";
import { AddBuildModal } from "./modals/AddBuildModal";
import { useState } from "react";
import { GlobalChatDrawer } from "./chat/GlobalChatDrawer";
import { ChloeDrawer } from "./chat/ChloeDrawer";
import { DmDrawer } from "./chat/DmDrawer";
import { GuildActionModals } from "./modals/GuildActionModals";
import { CreateGuildModal } from "./modals/CreateGuildModal";
import { LogConsole } from "./dev/LogConsole";
import { LoginPage } from "./auth/LoginPage";
import { useAppStore } from "../userstore";

function CachedAuthBanner() {
  const authSource = useAppStore((s) => s.authSource);
  if (authSource !== "cached") return null;
  return (
    <div
      role="status"
      className="shrink-0 px-4 py-1.5 text-[11px] text-center border-b border-state-warning/25 bg-state-warning/10 text-state-warning"
    >
      Offline — using cached profile. Local builds and library still work; remote
      actions are paused until CultForge is reachable.
    </div>
  );
}

function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="app-shell flex flex-col w-full h-full overflow-hidden">
      <BgAtmosphere />
      <Header />
      <CachedAuthBanner />
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        <NavigationBar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((p) => !p)}
        />
        <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
          <Viewport />
        </div>
        <BottomContextDock />
      </div>
      <BuildActionModalsHost />
      <AddBuildModal />
      <GlobalChatDrawer />
      <ChloeDrawer />
      <DmDrawer />
      <GuildActionModals />
      <CreateGuildModal />
      <LogConsole />
    </div>
  );
}

function AuthLayout() {
  return (
    <div className="app-shell flex flex-col w-full h-full overflow-hidden">
      <LoginPage />
    </div>
  );
}

export { AppLayout, AuthLayout };
