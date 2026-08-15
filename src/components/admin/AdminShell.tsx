import { AnimatePresence, motion } from "framer-motion";
import { useAdminRouteStore } from "../../stores/adminRoute";
import { useAdminSessionStore } from "../../stores/adminSession";
import { AdminNavRail } from "./AdminNavRail";
import { AdminTopBar } from "./AdminTopBar";
import { AdminOverview } from "./sections/AdminOverview";
import { AdminChloePanel } from "./sections/AdminChloePanel";
import { AdminCatalogExplorer } from "./sections/AdminCatalogExplorer";
import { AdminCatalogPanel } from "./sections/AdminCatalogPanel";
import { AdminWhoamiPanel } from "./sections/AdminWhoamiPanel";
import { AdminAuthPanel } from "./sections/AdminAuthPanel";
import { AdminUsersPanel } from "./sections/AdminUsersPanel";
import { AdminAuditPanel } from "./sections/AdminAuditPanel";
import { AdminSectionPanel } from "./sections/AdminSectionPanel";
import { AdminSessionsPanel } from "./sections/AdminSessionsPanel";
import { AdminNotificationsPanel } from "./sections/AdminNotificationsPanel";
import { AdminMailPanel } from "./sections/AdminMailPanel";
import { AdminGenericPanel } from "./sections/AdminGenericPanel";

const pageMotion = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
};

const SECTION_PANELS: Record<string, () => React.ReactNode> = {
  overview: () => <AdminOverview />,
  users: () => <AdminUsersPanel />,
  sessions: () => <AdminSessionsPanel />,
  audit: () => <AdminAuditPanel />,
  notifications: () => <AdminNotificationsPanel />,
  mail: () => <AdminMailPanel />,
  "rate-limits": () => <AdminSectionPanel sectionId="rate-limits" />,
  reports: () => <AdminSectionPanel sectionId="reports" />,
  guilds: () => <AdminSectionPanel sectionId="guilds" />,
  invites: () => <AdminSectionPanel sectionId="invites" />,
  auth: () => <AdminAuthPanel />,
  chloe: () => <AdminChloePanel />,
  hotfixes: () => <AdminSectionPanel sectionId="hotfixes" />,
  whoami: () => <AdminWhoamiPanel />,
  catalog: () => <AdminCatalogPanel />,
  explorer: () => <AdminCatalogExplorer />,
};

type Props = {
  expiryLabel: string;
  onStepUp: () => void;
};

function SectionContent({ section }: { section: string }) {
  if (section.startsWith("dynamic:")) {
    return <AdminGenericPanel sectionId={section} />;
  }
  const render = SECTION_PANELS[section];
  return render ? render() : null;
}

export function AdminShell({ expiryLabel, onStepUp }: Props) {
  const activeSection = useAdminRouteStore((s) => s.activeSection);
  const setSection = useAdminRouteStore((s) => s.setSection);
  const capabilityActive = useAdminSessionStore((s) => s.capabilityActive);
  const loadingCatalog = useAdminSessionStore((s) => s.loadingCatalog);
  const loadCatalog = useAdminSessionStore((s) => s.loadCatalog);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AdminTopBar
        expiryLabel={expiryLabel}
        capabilityActive={capabilityActive}
        activeSection={activeSection}
        onStepUp={onStepUp}
        onRefresh={() => void loadCatalog()}
        loadingCatalog={loadingCatalog}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[210px_minmax(0,1fr)]">
        <AdminNavRail activeSection={activeSection} onSelect={setSection} />

        <main className="min-h-0 min-w-0 overflow-y-auto scroll-hidden px-4 py-4 lg:px-6 lg:py-5">
          <AnimatePresence mode="wait">
            <motion.div key={activeSection} {...pageMotion}>
              <SectionContent section={activeSection} />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
