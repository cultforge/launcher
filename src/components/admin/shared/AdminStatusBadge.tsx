import { Chip } from "@heroui/react";
import { formatBool } from "../../../lib/adminFormatters";

type StatusKind =
  | "active"
  | "inactive"
  | "banned"
  | "pending"
  | "online"
  | "offline"
  | "admin"
  | "failed"
  | "sent"
  | "resolved"
  | "default";

const CONFIG: Record<
  StatusKind,
  { label: string; color: "success" | "warning" | "danger" | "default" }
> = {
  active: { label: "Active", color: "success" },
  online: { label: "Online", color: "success" },
  sent: { label: "Sent", color: "success" },
  resolved: { label: "Resolved", color: "success" },
  admin: { label: "Admin", color: "success" },
  pending: { label: "Pending", color: "warning" },
  inactive: { label: "Inactive", color: "default" },
  offline: { label: "Offline", color: "default" },
  default: { label: "Unknown", color: "default" },
  banned: { label: "Banned", color: "danger" },
  failed: { label: "Failed", color: "danger" },
};

type Props = {
  status: StatusKind | string;
  label?: string;
};

export function AdminStatusBadge({ status, label }: Props) {
  const key = (status in CONFIG ? status : "default") as StatusKind;
  const cfg = CONFIG[key];
  return (
    <Chip size="sm" variant="soft" color={cfg.color}>
      <Chip.Label className="text-[9px]">{label ?? cfg.label}</Chip.Label>
    </Chip>
  );
}

export function userStatusFromRow(row: Record<string, unknown>): StatusKind {
  if (formatBool(row.is_banned)) return "banned";
  const rank = String(row.ext_rank ?? row.role ?? "").toLowerCase();
  if (rank.includes("admin") || rank === "1000") return "admin";
  if (formatBool(row.is_active) || row.is_active === undefined) return "active";
  return "inactive";
}

export function rowStatusFromRow(row: Record<string, unknown>): StatusKind {
  const s = String(row.status ?? "").toLowerCase();
  if (s.includes("ban")) return "banned";
  if (s.includes("pending")) return "pending";
  if (s.includes("fail")) return "failed";
  if (s.includes("active") || s.includes("online")) return "active";
  if (s.includes("resolve")) return "resolved";
  if (s.includes("sent")) return "sent";
  return "default";
}
