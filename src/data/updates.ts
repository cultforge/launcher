export type UpdateKind = "build" | "mod" | "launcher";

export type UpdateFilter = "All" | UpdateKind;

export type UpdateStatus = "pending" | "updating" | "done";

export type UpdateItem = {
  id: string;
  name: string;
  from: string;
  to: string;
  kind: UpdateKind;
  size: string;
  sizeMb: number;
  changelog: string;
  status: UpdateStatus;
  instance?: string;
  projectId?: string;
  projectType?: string;
  libraryItemId?: string;
};

export type UpdateHistoryItem = {
  id: string;
  name: string;
  kind: UpdateKind;
  to: string;
  when: string;
};

export const UPDATE_FILTERS: UpdateFilter[] = ["All", "build", "mod", "launcher"];

export function filterUpdates(
  items: UpdateItem[],
  filter: UpdateFilter,
): UpdateItem[] {
  const pending = items.filter((u) => u.status !== "done");
  if (filter === "All") return pending;
  return pending.filter((u) => u.kind === filter);
}

export function totalUpdateSizeLabel(items: UpdateItem[]): string {
  const mb = items.reduce((sum, u) => sum + u.sizeMb, 0);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb % 1 === 0 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}

export function groupUpdates(items: UpdateItem[]): {
  builds: UpdateItem[];
  mods: UpdateItem[];
  launcher: UpdateItem[];
} {
  return {
    builds: items.filter((u) => u.kind === "build"),
    mods: items.filter((u) => u.kind === "mod"),
    launcher: items.filter((u) => u.kind === "launcher"),
  };
}
