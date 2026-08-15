import { useMemo } from "react";
import type { ActivityItem } from "../data/homeActivity";
import { useBuildStore } from "../stores/build";
import { useLibraryContentStore } from "../stores/libraryContent";
import { useUpdatesStore } from "../stores/updates";

function relativeTime(ms: number | null): string {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return "Today";
  if (diff < 2 * day) return "Yesterday";
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "shader":
      return "Shader added";
    case "resource-pack":
      return "Resource pack added";
    case "datapack":
      return "Datapack added";
    case "world":
      return "World updated";
    default:
      return "Mod added";
  }
}

/** Real activity derived from scanned local content, builds, and updates. */
export function useRecentActivity(limit = 6): ActivityItem[] {
  const items = useLibraryContentStore((s) => s.items);
  const builds = useBuildStore((s) => s.builds);
  const updates = useUpdatesStore((s) => s.items);

  return useMemo(() => {
    const rows: (ActivityItem & { sortMs: number })[] = [];

    for (const item of items) {
      if (!item.modifiedMs) continue;
      rows.push({
        id: `content:${item.id}`,
        kind: item.kind === "world" ? "builds" : "downloads",
        title: kindLabel(item.kind),
        meta: item.title ?? item.name,
        time: relativeTime(item.modifiedMs),
        action: "builds",
        sortMs: item.modifiedMs,
      });
    }

    for (const update of updates) {
      rows.push({
        id: `update:${update.id}`,
        kind: "system",
        title: "Update available",
        meta: `${update.name} · ${update.to}`,
        time: "Now",
        action: "updates",
        sortMs: Date.now(),
      });
    }

    for (const build of builds) {
      rows.push({
        id: `build:${build.id}`,
        kind: "builds",
        title: "Build detected",
        meta: `${build.name} · MC ${build.mc}`,
        time: build.lastPlayed,
        action: "builds",
        sortMs: 0,
      });
    }

    return rows
      .sort((a, b) => b.sortMs - a.sortMs)
      .slice(0, limit)
      .map(({ sortMs: _sortMs, ...row }) => row);
  }, [items, builds, updates, limit]);
}
