import { AnimatePresence, motion } from "framer-motion";
import { useAdminRouteStore } from "../../stores/adminRoute";
import { useAdminSessionStore } from "../../stores/adminSession";
import type { AdminViewId } from "../../lib/adminNav";
import { AdminOpsNav } from "./shell/AdminOpsNav";
import { AdminOpsTopBar } from "./shell/AdminOpsTopBar";
import { AdminAuditStreamDrawer } from "./shell/AdminAuditStreamDrawer";
import { OverviewView } from "./views/OverviewView";
import { UsersView } from "./views/UsersView";
import { AuditView } from "./views/AuditView";
import { CommunicationsView } from "./views/CommunicationsView";
import { RateLimitsView } from "./views/RateLimitsView";
import { ReportsView } from "./views/ReportsView";
import { ChloeView } from "./views/ChloeView";
import { HotfixesView } from "./views/HotfixesView";
import { AuthView } from "./views/AuthView";
import { InvitesView } from "./views/InvitesView";
import { GuildsView } from "./views/GuildsView";
import { SettingsView } from "./views/SettingsView";

const pageMotion = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const },
};

const VIEWS: Record<AdminViewId, () => React.ReactNode> = {
  overview: () => <OverviewView />,
  users: () => <UsersView />,
  audit: () => <AuditView />,
  communications: () => <CommunicationsView />,
  "rate-limits": () => <RateLimitsView />,
  reports: () => <ReportsView />,
  chloe: () => <ChloeView />,
  hotfixes: () => <HotfixesView />,
  auth: () => <AuthView />,
  invites: () => <InvitesView />,
  guilds: () => <GuildsView />,
  settings: () => <SettingsView />,
};

type Props = {
  expiryLabel: string;
  onStepUp: () => void;
};

export function AdminShell({ expiryLabel, onStepUp }: Props) {
  const activeSection = useAdminRouteStore((s) => s.activeSection);
  const setSection = useAdminRouteStore((s) => s.setSection);
  const streamOpen = useAdminRouteStore((s) => s.streamOpen);
  const loadingCatalog = useAdminSessionStore((s) => s.loadingCatalog);
  const loadCatalog = useAdminSessionStore((s) => s.loadCatalog);

  const render = VIEWS[activeSection];

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0a0b0c] text-[12px] leading-snug">
      <AdminOpsTopBar
        expiryLabel={expiryLabel}
        onStepUp={onStepUp}
        onRefresh={() => void loadCatalog()}
        loadingCatalog={loadingCatalog}
      />

      <div
        className={
          streamOpen
            ? "grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[180px_minmax(0,1fr)_280px]"
            : "grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[180px_minmax(0,1fr)]"
        }
      >
        <AdminOpsNav
          active={activeSection}
          onSelect={(id) => setSection(id)}
        />

        <main className="min-h-0 min-w-0 overflow-y-auto scroll-hidden px-4 py-4 lg:px-5 lg:py-4">
          <AnimatePresence mode="wait">
            <motion.div key={activeSection} {...pageMotion}>
              {render ? render() : null}
            </motion.div>
          </AnimatePresence>
        </main>

        {streamOpen ? <AdminAuditStreamDrawer /> : null}
      </div>
    </div>
  );
}
