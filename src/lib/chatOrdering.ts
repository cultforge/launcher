/**
 * Sort any chat-like array into chronological (oldest-first) order,
 * preferring `createdAt` ISO timestamp, falling back to `sequence`.
 */
export function sortChatChronologically<
  T extends { createdAt?: string; sequence?: number },
>(messages: T[]): T[] {
  return [...messages].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : (a.sequence ?? 0);
    const tb = b.createdAt ? Date.parse(b.createdAt) : (b.sequence ?? 0);
    return ta - tb || (a.sequence ?? 0) - (b.sequence ?? 0);
  });
}
