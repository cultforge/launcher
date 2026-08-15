import type { AdminCatalogEntry } from "./adminApi";
import { formatBool } from "./adminFormatters";

export type ActionFieldType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "boolean"
  | "radio"
  | "checkbox"
  | "multiselect"
  | "user-picker";

export type ActionField = {
  name: string;
  label: string;
  type: ActionFieldType;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  options?: { value: string; label: string }[];
  /** Tab group for multi-step / tabbed dialogs */
  tab?: string;
  /** Show only when another field equals this value */
  showWhen?: { field: string; value: string };
};

export type ActionSeverity = "neutral" | "warning" | "danger";

export type ActionSchema = {
  pattern: RegExp;
  method: string;
  label: string;
  description: string;
  severity?: ActionSeverity;
  global?: boolean;
  fields: ActionField[];
  when?: (row: Record<string, unknown>) => boolean;
  bodyMapper?: (
    formValues: Record<string, string>,
    row?: Record<string, unknown> | null,
  ) => Record<string, unknown>;
  validate?: (formValues: Record<string, string>) => string | null;
  prefill?: (row: Record<string, unknown>) => Record<string, string>;
};

function hasAdminRole(row: Record<string, unknown>): boolean {
  const roles = row.roles;
  if (Array.isArray(roles)) {
    return roles.some((r) => String(r).toLowerCase().includes("admin"));
  }
  const rank = String(row.ext_rank ?? row.role ?? "").toLowerCase();
  return rank.includes("admin");
}

/** Schemas keyed by method + path regex — mirrors cultsdk/admin/_schemas.py */
export const ADMIN_ACTION_SCHEMAS: ActionSchema[] = [
  {
    pattern: /^\/v1\/admin\/users\/\{id\}\/ban$/,
    method: "POST",
    label: "Ban user",
    description: "Prevent this account from signing in or using the platform.",
    severity: "danger",
    fields: [],
    when: (row) => !formatBool(row.is_banned),
  },
  {
    pattern: /^\/v1\/admin\/users\/\{id\}\/unban$/,
    method: "POST",
    label: "Unban user",
    description: "Restore this account's access to the platform.",
    severity: "neutral",
    fields: [],
    when: (row) => formatBool(row.is_banned),
  },
  {
    pattern: /^\/v1\/admin\/users\/\{id\}\/roles$/,
    method: "PUT",
    label: "Manage roles",
    description: "Grant or revoke platform admin access for this user.",
    severity: "warning",
    fields: [
      {
        name: "role_action",
        label: "Role change",
        type: "radio",
        required: true,
        defaultValue: "grant_admin",
        options: [
          { value: "grant_admin", label: "Grant platform admin" },
          { value: "revoke_admin", label: "Revoke platform admin" },
        ],
      },
    ],
    prefill: (row) => ({
      role_action: hasAdminRole(row) ? "revoke_admin" : "grant_admin",
    }),
    bodyMapper: (v) => {
      const action = v.role_action ?? "grant_admin";
      if (action === "revoke_admin") return { revoke_admin: true };
      return { grant_admin: true };
    },
  },
  {
    pattern: /^\/v1\/admin\/users\/\{id\}\/sessions\/revoke-all$/,
    method: "POST",
    label: "Revoke all sessions",
    description: "Sign this user out of all devices immediately.",
    severity: "warning",
    fields: [],
  },
  {
    pattern: /^\/v1\/admin\/sessions\/\{session_id\}\/revoke$/,
    method: "POST",
    label: "Revoke session",
    description: "Terminate this session immediately.",
    severity: "warning",
    fields: [],
  },
  {
    pattern: /^\/v1\/admin\/notifications$/,
    method: "POST",
    label: "Send notification",
    description: "Send a notification to specific users, a role, or all active users.",
    severity: "neutral",
    global: true,
    fields: [
      {
        name: "title",
        label: "Title",
        type: "text",
        required: true,
        placeholder: "Notification title…",
        tab: "Message",
      },
      {
        name: "body",
        label: "Message",
        type: "textarea",
        placeholder: "Optional message body…",
        tab: "Message",
      },
      {
        name: "kind",
        label: "Kind",
        type: "select",
        defaultValue: "admin.notice",
        tab: "Message",
        options: [
          { value: "admin.notice", label: "Notice" },
          { value: "admin.alert", label: "Alert" },
          { value: "admin.maintenance", label: "Maintenance" },
        ],
      },
      {
        name: "target_mode",
        label: "Recipients",
        type: "radio",
        required: true,
        defaultValue: "users",
        tab: "Recipients",
        options: [
          { value: "users", label: "Specific users" },
          { value: "role", label: "Broadcast to role" },
          { value: "all", label: "All active users" },
        ],
      },
      {
        name: "user_ids",
        label: "Users",
        type: "user-picker",
        tab: "Recipients",
        showWhen: { field: "target_mode", value: "users" },
      },
      {
        name: "broadcast_role",
        label: "Role name",
        type: "text",
        placeholder: "e.g. admin",
        tab: "Recipients",
        showWhen: { field: "target_mode", value: "role" },
      },
    ],
    validate: (v) => {
      if (!v.title?.trim()) return "Title is required.";
      const mode = v.target_mode ?? "users";
      if (mode === "users" && !v.user_ids?.trim()) {
        return "Select at least one user.";
      }
      if (mode === "role" && !v.broadcast_role?.trim()) {
        return "Role name is required.";
      }
      return null;
    },
    bodyMapper: (v) => {
      const body: Record<string, unknown> = {
        title: v.title.trim(),
        kind: v.kind?.trim() || "admin.notice",
      };
      if (v.body?.trim()) body.body = v.body.trim();
      const mode = v.target_mode ?? "users";
      if (mode === "users" && v.user_ids?.trim()) {
        body.user_ids = v.user_ids.split(",").map((s) => s.trim()).filter(Boolean);
      } else if (mode === "role" && v.broadcast_role?.trim()) {
        body.broadcast_role = v.broadcast_role.trim();
      } else if (mode === "all") {
        body.all_active = true;
      }
      return body;
    },
  },
  {
    pattern: /^\/v1\/admin\/mail$/,
    method: "POST",
    label: "Send email",
    description: "Send a transactional email to a user ID or email address.",
    severity: "neutral",
    global: true,
    fields: [
      {
        name: "to",
        label: "Recipient",
        type: "user-picker",
        required: true,
        placeholder: "Email address or select a user…",
        tab: "Email",
      },
      {
        name: "subject",
        label: "Subject",
        type: "text",
        required: true,
        placeholder: "Email subject…",
        tab: "Email",
      },
      {
        name: "body_text",
        label: "Body",
        type: "textarea",
        required: true,
        placeholder: "Plain text email body…",
        tab: "Email",
      },
    ],
    validate: (v) => {
      if (!v.to?.trim()) return "Recipient is required.";
      if (!v.subject?.trim()) return "Subject is required.";
      if (!v.body_text?.trim()) return "Body is required.";
      return null;
    },
    bodyMapper: (v) => ({
      to: v.to.trim(),
      subject: v.subject.trim(),
      body_text: v.body_text.trim(),
    }),
    prefill: (row) => ({
      to: String(row.id ?? row.user_id ?? ""),
    }),
  },
  {
    pattern: /^\/v1\/admin\/rate-limits$/,
    method: "POST",
    label: "Create rate limit",
    description: "Add a new rate-limit override policy.",
    severity: "neutral",
    global: true,
    fields: [
      {
        name: "scope",
        label: "Scope",
        type: "select",
        required: true,
        defaultValue: "ip",
        tab: "Target",
        options: [
          { value: "ip", label: "IP address" },
          { value: "user", label: "User" },
          { value: "path", label: "Path" },
        ],
      },
      {
        name: "user_key",
        label: "User",
        type: "user-picker",
        required: true,
        placeholder: "Search user by name, email, or ID…",
        tab: "Target",
        showWhen: { field: "scope", value: "user" },
      },
      {
        name: "ip_key",
        label: "IP address",
        type: "text",
        required: true,
        placeholder: "e.g. 203.0.113.10",
        tab: "Target",
        showWhen: { field: "scope", value: "ip" },
      },
      {
        name: "path_key",
        label: "API path prefix",
        type: "text",
        required: true,
        placeholder: "e.g. /v1/guilds",
        tab: "Target",
        showWhen: { field: "scope", value: "path" },
      },
      {
        name: "times",
        label: "Max requests",
        type: "number",
        required: true,
        defaultValue: "1",
        tab: "Limits",
      },
      {
        name: "seconds",
        label: "Window (seconds)",
        type: "number",
        required: true,
        defaultValue: "60",
        tab: "Limits",
      },
      {
        name: "ttl_seconds",
        label: "TTL (seconds)",
        type: "number",
        defaultValue: "3600",
        tab: "Limits",
      },
      {
        name: "reason",
        label: "Reason",
        type: "textarea",
        placeholder: "Optional reason for this override…",
        tab: "Notes",
      },
    ],
    validate: (v) => {
      const scope = v.scope || "ip";
      if (scope === "user" && !v.user_key?.trim()) {
        return "Pick a user for this rate limit.";
      }
      if (scope === "ip" && !v.ip_key?.trim()) {
        return "Enter an IP address.";
      }
      if (scope === "path" && !v.path_key?.trim()) {
        return "Enter an API path prefix.";
      }
      return null;
    },
    bodyMapper: (v) => {
      const scope = v.scope || "ip";
      const key =
        scope === "user"
          ? v.user_key.trim()
          : scope === "path"
            ? v.path_key.trim()
            : v.ip_key.trim();
      const body: Record<string, unknown> = {
        scope,
        key,
        times: Number(v.times) || 1,
        seconds: Number(v.seconds) || 60,
        ttl_seconds: Number(v.ttl_seconds) || 3600,
      };
      if (v.reason?.trim()) body.reason = v.reason.trim();
      return body;
    },
  },
  {
    pattern: /^\/v1\/admin\/rate-limits\/\{id\}$/,
    method: "DELETE",
    label: "Delete rate limit",
    description: "Remove this rate-limit override.",
    severity: "danger",
    fields: [],
  },
  {
    pattern: /^\/v1\/admin\/updates$/,
    method: "POST",
    label: "Publish update",
    description: "Publish a global hotfix or platform update notice.",
    severity: "neutral",
    global: true,
    fields: [
      { name: "title", label: "Title", type: "text", required: true, tab: "Content" },
      { name: "body", label: "Body", type: "textarea", required: true, tab: "Content" },
      {
        name: "severity",
        label: "Severity",
        type: "select",
        defaultValue: "info",
        tab: "Release",
        options: [
          { value: "info", label: "Info" },
          { value: "warning", label: "Warning" },
          { value: "critical", label: "Critical" },
        ],
      },
      { name: "channel", label: "Channel", type: "text", defaultValue: "hotfix", tab: "Release" },
      { name: "version_min", label: "Min version", type: "text", placeholder: "Optional", tab: "Release" },
      { name: "version_max", label: "Max version", type: "text", placeholder: "Optional", tab: "Release" },
      {
        name: "is_published",
        label: "Publish immediately",
        type: "checkbox",
        defaultValue: "true",
        tab: "Release",
      },
    ],
    bodyMapper: (v) => {
      const body: Record<string, unknown> = {
        title: v.title.trim(),
        body: v.body.trim(),
        severity: v.severity || "info",
        channel: v.channel?.trim() || "hotfix",
        is_published: v.is_published !== "false",
      };
      if (v.version_min?.trim()) body.version_min = v.version_min.trim();
      if (v.version_max?.trim()) body.version_max = v.version_max.trim();
      return body;
    },
  },
  {
    pattern: /^\/v1\/admin\/chloe\/quota\/\{user_id\}$/,
    method: "PUT",
    label: "Update quota",
    description: "Set the daily Chloe quota limit for this user.",
    severity: "neutral",
    fields: [
      {
        name: "daily_limit",
        label: "Daily limit",
        type: "number",
        required: true,
        placeholder: "0–100000",
      },
    ],
    prefill: (row) => ({
      daily_limit: String(row.daily_limit ?? row.limit ?? ""),
    }),
    bodyMapper: (v) => ({
      daily_limit: Number(v.daily_limit) || 0,
    }),
  },
  {
    pattern: /^\/v1\/admin\/chloe\/actions\/\{id\}\/expire$/,
    method: "POST",
    label: "Expire action",
    description: "Force-expire this Chloe action immediately.",
    severity: "warning",
    fields: [],
  },
  {
    pattern: /^\/v1\/admin\/reports\/run$/,
    method: "POST",
    label: "Run report",
    description: "Generate and optionally persist an admin report.",
    severity: "neutral",
    global: true,
    fields: [
      {
        name: "kind",
        label: "Report type",
        type: "select",
        required: true,
        defaultValue: "users_summary",
        options: [
          { value: "users_summary", label: "Users summary" },
          { value: "guilds_summary", label: "Guilds summary" },
          { value: "chloe_usage", label: "Chloe usage" },
          { value: "security_sessions", label: "Security sessions" },
        ],
      },
      {
        name: "persist",
        label: "Save report",
        type: "checkbox",
        defaultValue: "true",
      },
    ],
    bodyMapper: (v) => ({
      kind: v.kind,
      persist: v.persist !== "false",
    }),
  },
  {
    pattern: /^\/v1\/admin\/auth\/sessions\/revoke-user$/,
    method: "POST",
    label: "Revoke user sessions",
    description: "Revoke all auth sessions for a specific user.",
    severity: "warning",
    global: true,
    fields: [
      {
        name: "user_id",
        label: "User",
        type: "user-picker",
        required: true,
      },
    ],
    bodyMapper: (v) => ({ user_id: v.user_id.trim() }),
  },
  {
    pattern: /^\/v1\/admin\/invites\/\{code\}\/revoke$/,
    method: "POST",
    label: "Revoke invite",
    description: "Invalidate this invite code.",
    severity: "danger",
    fields: [],
  },
  {
    pattern: /^\/v1\/admin\/guilds\/\{id\}\/unlist$/,
    method: "POST",
    label: "Unlist guild",
    description: "Remove this guild from public discovery.",
    severity: "warning",
    fields: [],
  },
  {
    pattern: /^\/v1\/admin\/guilds\/\{id\}\/flags$/,
    method: "POST",
    label: "Update guild flags",
    description: "Force-update guild listing flags.",
    severity: "neutral",
    fields: [
      {
        name: "is_listed",
        label: "Publicly listed",
        type: "select",
        required: true,
        options: [
          { value: "true", label: "Listed" },
          { value: "false", label: "Unlisted" },
        ],
      },
    ],
    prefill: (row) => ({
      is_listed: String(row.is_listed ?? row.status === "listed" ? "true" : "false"),
    }),
    bodyMapper: (v) => ({
      is_listed: v.is_listed === "true",
    }),
  },
];

export function matchActionSchema(entry: AdminCatalogEntry): ActionSchema | null {
  const method = entry.method.toUpperCase();
  for (const schema of ADMIN_ACTION_SCHEMAS) {
    if (schema.method.toUpperCase() === method && schema.pattern.test(entry.path)) {
      return schema;
    }
  }
  return null;
}

export function isFieldVisible(
  field: ActionField,
  formValues: Record<string, string>,
): boolean {
  if (!field.showWhen) return true;
  return formValues[field.showWhen.field] === field.showWhen.value;
}
