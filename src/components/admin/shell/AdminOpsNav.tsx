import {
  Activity,
  Bell,
  Bot,
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
import { ADMIN_NAV, type AdminViewId } from "../../../lib/adminNav";
import { cn } from "../../../lib/cn";

const ICONS: Record<AdminViewId, LucideIcon> = {
  overview: LayoutDashboard,
  users: Users,
  audit: FileText,
  communications: Bell,
  "rate-limits": Gauge,
  reports: Megaphone,
  chloe: Bot,
  hotfixes: Zap,
  auth: Key,
  invites: Mail,
  guilds: Shield,
  settings: Activity,
};

type Props = {
  active: AdminViewId;
  onSelect: (id: AdminViewId) => void;
};

export function AdminOpsNav({ active, onSelect }: Props) {
  const ops = ADMIN_NAV.filter((n) => n.group === "ops");
  const platform = ADMIN_NAV.filter((n) => n.group === "platform");
  const dev = ADMIN_NAV.filter((n) => n.group === "dev");

  const renderGroup = (label: string, items: typeof ADMIN_NAV) => (
    <div className="mb-3">
      <div className="px-2.5 mb-1 text-[8px] font-semibold uppercase tracking-[0.18em] text-text-disabled">
        {label}
      </div>
      <div className="flex flex-col gap-0.5">
        {items.map((item) => {
          const Icon = ICONS[item.id];
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[11px] font-medium cursor-pointer",
                active === item.id
                  ? "bg-primary-base/14 text-primary-base"
                  : "text-text-muted hover:bg-white/4 hover:text-text-secondary",
              )}
            >
              <Icon size={13} className="shrink-0 opacity-80" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <nav className="flex shrink-0 flex-col border-b border-white/8 lg:w-[180px] lg:border-b-0 lg:border-r lg:border-white/8 lg:py-3 lg:px-1.5 overflow-x-auto lg:overflow-y-auto">
      <div className="flex flex-row gap-1 lg:flex-col">
        {renderGroup("Ops", ops)}
        {renderGroup("Platform", platform)}
        {renderGroup("Session", dev)}
      </div>
    </nav>
  );
}
