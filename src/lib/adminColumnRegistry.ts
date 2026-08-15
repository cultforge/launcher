import type { ReactNode } from "react";
import type { AdminSectionId } from "./adminCatalog";
import {
  formatBool,
  formatDate,
  formatRelativeTime,
  truncateId,
  userDisplayName,
  userInitials,
} from "./adminFormatters";

export type ColumnDef = {
  id: string;
  label: string;
  sortable?: boolean;
  width?: string;
  render?: (row: Record<string, unknown>) => ReactNode;
  sortValue?: (row: Record<string, unknown>) => string | number;
};

function textCol(
  id: string,
  label: string,
  keys?: string[],
): ColumnDef {
  const k = keys ?? [id];
  return {
    id,
    label,
    sortable: true,
    render: (row) => {
      for (const key of k) {
        const v = row[key];
        if (v !== null && v !== undefined && v !== "") return String(v);
      }
      return "—";
    },
    sortValue: (row) => {
      for (const key of k) {
        const v = row[key];
        if (v !== null && v !== undefined) return String(v);
      }
      return "";
    },
  };
}

const USER_COLUMNS: ColumnDef[] = [
  {
    id: "identity",
    label: "User",
    sortable: true,
    width: "220px",
    render: () => null,
    sortValue: (row) => userDisplayName(row),
  },
  textCol("username", "Username", ["username", "email"]),
  textCol("account_type", "Account type", ["account_type", "type"]),
  textCol("ext_rank", "Rank", ["ext_rank", "rank", "role"]),
  {
    id: "status",
    label: "Status",
    sortable: true,
    sortValue: (row) =>
      formatBool(row.is_banned) ? "banned" : formatBool(row.is_active) ? "active" : "inactive",
  },
  {
    id: "created_at",
    label: "Joined",
    sortable: true,
    sortValue: (row) => String(row.created_at ?? ""),
  },
];

const SESSION_COLUMNS: ColumnDef[] = [
  textCol("user", "User", ["username", "user_id", "display_name"]),
  textCol("platform", "Platform", ["platform", "device", "user_agent"]),
  textCol("ip", "IP", ["ip_address", "ip"]),
  textCol("country", "Country", ["cf_ipcountry", "country"]),
  {
    id: "created_at",
    label: "Started",
    sortable: true,
    sortValue: (row) => String(row.created_at ?? ""),
  },
  {
    id: "expires_at",
    label: "Expires",
    sortable: true,
    sortValue: (row) => String(row.expires_at ?? ""),
  },
  {
    id: "status",
    label: "Status",
    sortable: true,
    sortValue: (row) => String(row.status ?? row.is_revoked ?? ""),
  },
];

const AUDIT_COLUMNS: ColumnDef[] = [
  {
    id: "timestamp",
    label: "Time",
    sortable: true,
    sortValue: (row) => String(row.timestamp ?? row.created_at ?? ""),
  },
  textCol("actor", "Actor", ["actor", "user_id", "username", "admin_id"]),
  textCol("action", "Action", ["action", "event", "type"]),
  textCol("resource", "Resource", ["resource", "target", "entity"]),
  textCol("summary", "Summary", ["summary", "message", "details"]),
];

const REPORT_COLUMNS: ColumnDef[] = [
  textCol("reporter", "Reporter", ["reporter", "reporter_id", "from_user"]),
  textCol("target", "Target", ["target", "target_id", "reported_user"]),
  textCol("reason", "Reason", ["reason", "category", "type"]),
  { id: "status", label: "Status", sortable: true },
  {
    id: "created_at",
    label: "Reported",
    sortable: true,
    sortValue: (row) => String(row.created_at ?? ""),
  },
];

const GUILD_COLUMNS: ColumnDef[] = [
  textCol("name", "Guild", ["name", "guild_name"]),
  textCol("tag", "Tag", ["tag", "guild_tag"]),
  {
    id: "owner",
    label: "Owner",
    sortable: true,
    render: (row) => {
      const name = String(
        row.owner_name ?? row.owner_username ?? row.owner ?? "",
      ).trim();
      const id = String(row.owner_id ?? row.leader_id ?? "").trim();
      if (name && id && name !== id) return `${name} (${truncateId(id)})`;
      return name || (id ? truncateId(id) : "—");
    },
    sortValue: (row) =>
      String(row.owner_name ?? row.owner_username ?? row.owner_id ?? row.owner ?? ""),
  },
  textCol("members", "Members", ["member_count", "members"]),
  { id: "status", label: "Status", sortable: true },
];

const MAIL_NOTIF_COLUMNS: ColumnDef[] = [
  textCol("recipient", "Recipient", ["recipient", "to", "user_id"]),
  textCol("template", "Template", ["template", "subject", "type"]),
  { id: "status", label: "Status", sortable: true },
  {
    id: "sent_at",
    label: "Sent",
    sortable: true,
    sortValue: (row) => String(row.sent_at ?? row.created_at ?? ""),
  },
];

const HOTFIX_COLUMNS: ColumnDef[] = [
  textCol("version", "Version", ["version", "tag"]),
  textCol("channel", "Channel", ["channel", "target"]),
  { id: "status", label: "Status", sortable: true },
  {
    id: "published_at",
    label: "Published",
    sortable: true,
    sortValue: (row) => String(row.published_at ?? row.created_at ?? ""),
  },
];

const INVITE_COLUMNS: ColumnDef[] = [
  textCol("code", "Code", ["code", "invite_code"]),
  textCol("guild", "Guild", ["guild_id", "guild_name"]),
  textCol("created_by", "Created by", ["created_by", "issuer"]),
  { id: "status", label: "Status", sortable: true },
  {
    id: "expires_at",
    label: "Expires",
    sortable: true,
    sortValue: (row) => String(row.expires_at ?? ""),
  },
];

const AUTH_COLUMNS: ColumnDef[] = [
  textCol("name", "Name", ["name", "client_id", "provider"]),
  textCol("type", "Type", ["type", "provider"]),
  { id: "status", label: "Status", sortable: true },
  {
    id: "created_at",
    label: "Created",
    sortable: true,
    sortValue: (row) => String(row.created_at ?? ""),
  },
];

const RATE_LIMIT_COLUMNS: ColumnDef[] = [
  textCol("scope", "Scope", ["scope"]),
  textCol("key", "Target", ["key", "name", "route", "user_id", "ip"]),
  textCol("limit", "Max requests", ["times", "limit", "max", "rate"]),
  textCol("window", "Window (s)", ["seconds", "window", "period"]),
  textCol("ttl", "TTL (s)", ["ttl_seconds", "ttl"]),
  textCol("reason", "Reason", ["reason", "note"]),
];

const SECTION_COLUMNS: Partial<Record<AdminSectionId, ColumnDef[]>> = {
  users: USER_COLUMNS,
  sessions: SESSION_COLUMNS,
  audit: AUDIT_COLUMNS,
  reports: REPORT_COLUMNS,
  guilds: GUILD_COLUMNS,
  notifications: MAIL_NOTIF_COLUMNS,
  mail: MAIL_NOTIF_COLUMNS,
  hotfixes: HOTFIX_COLUMNS,
  invites: INVITE_COLUMNS,
  auth: AUTH_COLUMNS,
  "rate-limits": RATE_LIMIT_COLUMNS,
};

export function columnsForSection(sectionId: AdminSectionId): ColumnDef[] {
  return SECTION_COLUMNS[sectionId] ?? [];
}

export { formatDate, formatRelativeTime, truncateId, userDisplayName, userInitials };
