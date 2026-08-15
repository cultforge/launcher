import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import ContextWindow from "../app-contextnav";
import { useNavigationStore } from "../../../typlibs";
import HomePage from "./pages/HomePage";
import BuildsPage from "./pages/BuildsPage";
import StorePage from "./pages/StorePage";
import ModsPage from "./pages/ModsPage";
import ServersPage from "./pages/ServersPage";
import GuildsPage from "./pages/GuildsPage";
import AdminPage from "./pages/AdminPage";
import { PlayerProfilePage } from "./pages/PlayerProfilePage";
import { useProfileRouteStore } from "../../../stores/profileRoute";
import { useGuildStore } from "../../../stores/guilds";

const pageMotion = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const },
};

function Viewport() {
  const primaryTab = useNavigationStore((s) => s.primaryTab);
  const sideItem = useNavigationStore((s) => s.sideItem);
  const profileTarget = useProfileRouteStore((s) => s.target);
  const profileOrigin = useProfileRouteStore((s) => s.origin);
  const closeProfile = useProfileRouteStore((s) => s.closeProfile);
  const guildHubTab = useGuildStore((s) => s.hubTab);
  const showRail =
    primaryTab !== "Store" &&
    primaryTab !== "Admin" &&
    !profileTarget &&
    !(
      primaryTab === "Guilds" &&
      sideItem === "Guilds" &&
      guildHubTab === "Manage"
    );

  useEffect(() => {
    if (
      profileTarget &&
      profileOrigin &&
      (profileOrigin.primaryTab !== primaryTab ||
        profileOrigin.sideItem !== sideItem)
    ) {
      closeProfile();
    }
  }, [
    closeProfile,
    primaryTab,
    profileOrigin,
    profileTarget,
    sideItem,
  ]);

  return (
    <div className="app-viewport bg-transparent w-full flex-1 min-h-0 flex flex-row overflow-hidden">
      <main className="flex-1 min-w-0 min-h-0 overflow-hidden relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={
              profileTarget
                ? profileTarget.kind === "self"
                  ? "player:self"
                  : `player:${profileTarget.id}`
                : primaryTab
            }
            className="absolute inset-0"
            initial={pageMotion.initial}
            animate={pageMotion.animate}
            exit={pageMotion.exit}
            transition={pageMotion.transition}
          >
            {profileTarget ? (
              <PlayerProfilePage />
            ) : (
              <>
                {primaryTab === "Home" && <HomePage />}
                {primaryTab === "Builds" && <BuildsPage />}
                {primaryTab === "Store" && <StorePage />}
                {primaryTab === "Mods" && <ModsPage />}
                {primaryTab === "Servers" && <ServersPage />}
                {primaryTab === "Guilds" && <GuildsPage />}
                {primaryTab === "Admin" && <AdminPage />}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
      {showRail && <ContextWindow />}
    </div>
  );
}

export default Viewport;
