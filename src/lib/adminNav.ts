/** Staff console information architecture (primary nav). */

export type AdminViewId =
  | "overview"
  | "users"
  | "audit"
  | "communications"
  | "rate-limits"
  | "reports"
  | "chloe"
  | "hotfixes"
  | "auth"
  | "invites"
  | "guilds"
  | "settings";

export type AdminNavItem = {
  id: AdminViewId;
  label: string;
  group: "ops" | "platform" | "dev";
};

export const ADMIN_NAV: AdminNavItem[] = [
  { id: "overview", label: "Overview", group: "ops" },
  { id: "users", label: "Users", group: "ops" },
  { id: "audit", label: "Audit", group: "ops" },
  { id: "communications", label: "Comms", group: "ops" },
  { id: "rate-limits", label: "Rate limits", group: "ops" },
  { id: "reports", label: "Reports", group: "ops" },
  { id: "guilds", label: "Guilds", group: "platform" },
  { id: "invites", label: "Invites", group: "platform" },
  { id: "auth", label: "Auth", group: "platform" },
  { id: "chloe", label: "Chloe", group: "platform" },
  { id: "hotfixes", label: "Hotfixes", group: "platform" },
  { id: "settings", label: "Session", group: "dev" },
];

export function isAdminViewId(id: string): id is AdminViewId {
  return ADMIN_NAV.some((n) => n.id === id);
}
