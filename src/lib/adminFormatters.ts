export function formatDate(value: unknown): string {
  if (!value) return "—";
  const d = typeof value === "string" || typeof value === "number"
    ? new Date(value)
    : null;
  if (!d || Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1 || value === "1") return true;
  return false;
}

export function userDisplayName(row: Record<string, unknown>): string {
  const display =
    (typeof row.display_name === "string" && row.display_name) ||
    (typeof row.name === "string" && row.name) ||
    (typeof row.username === "string" && row.username) ||
    null;
  if (display) return display;
  const id = row.id ?? row.user_id;
  return id ? String(id).slice(0, 8) : "Unknown";
}

export function userInitials(row: Record<string, unknown>): string {
  const name = userDisplayName(row);
  const parts = name.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function avatarUrlFromId(id: unknown): string | null {
  if (typeof id !== "string" || !id) return null;
  return `https://api.cultforge.com/v1/profile/${encodeURIComponent(id)}/avatar`;
}

export function truncateId(id: unknown, len = 8): string {
  if (id === null || id === undefined) return "—";
  const s = String(id);
  if (s.length <= len) return s;
  return `${s.slice(0, len)}…`;
}

export function formatRelativeTime(value: unknown): string {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(value);
}
