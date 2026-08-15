/** Stable CultForge instance id for a guild build (avoids colliding with local versions). */
export function guildInstanceId(guildId: string, buildKey: string): string {
  const g = sanitizeSegment(guildId);
  const b = sanitizeSegment(buildKey);
  return `g_${g}_${b}`;
}

function sanitizeSegment(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "unknown";
  return trimmed
    .replace(/[^a-zA-Z0-9._+-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "unknown";
}

export function isGuildInstanceId(id: string): boolean {
  return id.startsWith("g_");
}
