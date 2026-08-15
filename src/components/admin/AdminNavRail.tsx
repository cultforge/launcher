import {
  Activity,
  Bell,
  Bot,
  Code2,
  FileText,
  Gauge,
  Key,
  LayoutDashboard,
  Mail,
  Megaphone,
  Shield,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { visibleSections, dynamicSectionMeta, type AdminSectionMeta } from "../../lib/adminCatalog";
import { useAdminSessionStore } from "../../stores/adminSession";

const ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  users: Users,
  sessions: Key,
  audit: FileText,
  notifications: Bell,
  mail: Mail,
  "rate-limits": Gauge,
  reports: Megaphone,
  guilds: Shield,
  invites: Mail,
  auth: Key,
  chloe: Bot,
  hotfixes: Zap,
  whoami: Users,
  catalog: Code2,
  explorer: Code2,
};

function iconForSection(section: AdminSectionMeta): LucideIcon {
  if (section.id.startsWith("dynamic:")) return Activity;
  return ICONS[section.id] ?? Activity;
}

type Props = {
  activeSection: string;
  onSelect: (section: string) => void;
};

export function AdminNavRail({ activeSection, onSelect }: Props) {
  const groupedCatalog = useAdminSessionStore((s) => s.groupedCatalog);
  const allSections = groupedCatalog ? visibleSections(groupedCatalog) : [];

  const mainSections = allSections.filter(
    (s) => s.id !== "explorer" && !s.developer,
  );
  const devSections = allSections.filter(
    (s) => s.id === "explorer" || s.developer,
  );

  const renderButton = (item: AdminSectionMeta) => {
    const Icon = iconForSection(item);
    const label =
      item.id.startsWith("dynamic:") && groupedCatalog
        ? dynamicSectionMeta(item.id)?.label ?? item.label
        : item.label;

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => onSelect(item.id)}
        className={`shrink-0 rounded-lg px-3 py-2.5 text-left text-[11px] font-medium cursor-pointer flex items-center gap-2.5 w-full ${
          activeSection === item.id
            ? "bg-primary-base/14 text-primary-base"
            : "text-text-muted hover:bg-white/4 hover:text-text-secondary"
        }`}
      >
        <Icon size={14} className="shrink-0 opacity-80" />
        <span className="truncate">{label}</span>
      </button>
    );
  };

  return (
    <nav className="flex shrink-0 flex-col border-b border-white/8 lg:border-b-0 lg:border-r lg:border-white/8 lg:py-3 lg:px-2">
      <div className="flex flex-row gap-1 overflow-x-auto py-2 lg:flex-col lg:overflow-y-auto lg:py-0">
        {mainSections.map(renderButton)}
      </div>

      {devSections.length > 0 ? (
        <div className="mt-auto border-t border-white/8 pt-2 px-1 hidden lg:block">
          <div className="px-2 py-1 text-[8px] font-semibold uppercase tracking-widest text-text-disabled">
            Developer
          </div>
          {devSections.map(renderButton)}
        </div>
      ) : null}
    </nav>
  );
}
