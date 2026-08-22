import type { AdminCatalogEntry } from "./adminApi";

export type AdminSectionId =
  | "overview"
  | "users"
  | "sessions"
  | "audit"
  | "notifications"
  | "mail"
  | "rate-limits"
  | "reports"
  | "guilds"
  | "invites"
  | "auth"
  | "chloe"
  | "hotfixes"
  | "whoami"
  | "catalog"
  | "metrics"
  | "explorer"
  | `dynamic:${string}`;

export type AdminSectionMeta = {
  id: AdminSectionId;
  label: string;
  prefixes: string[];
  alwaysShow?: boolean;
  developer?: boolean;
  sort: number;
};

export const ADMIN_SECTIONS: AdminSectionMeta[] = [
  { id: "overview", label: "Overview", prefixes: ["metrics"], alwaysShow: true, sort: 0 },
  { id: "users", label: "Users", prefixes: ["users"], sort: 10 },
  { id: "sessions", label: "Sessions", prefixes: ["sessions"], sort: 20 },
  { id: "audit", label: "Audit", prefixes: ["audit"], sort: 30 },
  { id: "notifications", label: "Notifications", prefixes: ["notifs", "notifications"], sort: 40 },
  { id: "mail", label: "Mail", prefixes: ["mail"], sort: 50 },
  { id: "rate-limits", label: "Rate limits", prefixes: ["rate-limits", "ratelimits"], sort: 60 },
  { id: "reports", label: "Reports", prefixes: ["reports"], sort: 70 },
  { id: "guilds", label: "Guilds", prefixes: ["guilds"], sort: 80 },
  { id: "invites", label: "Invites", prefixes: ["invites"], sort: 90 },
  { id: "auth", label: "Auth", prefixes: ["auth"], sort: 100 },
  { id: "chloe", label: "Chloe", prefixes: ["chloe"], sort: 110 },
  { id: "hotfixes", label: "Hotfixes", prefixes: ["hotfixes", "global", "updates"], sort: 120 },
  { id: "whoami", label: "Whoami", prefixes: ["whoami"], alwaysShow: true, sort: 130 },
  { id: "catalog", label: "Catalog", prefixes: ["catalog"], alwaysShow: true, sort: 140 },
  { id: "metrics", label: "Metrics", prefixes: ["metrics", "status"], alwaysShow: true, sort: 145 },
  { id: "explorer", label: "API Explorer", prefixes: [], developer: true, sort: 999 },
];

const ADMIN_PREFIX = "/v1/admin/";

function pathSegment(path: string): string {
  if (!path.startsWith(ADMIN_PREFIX)) return "";
  const rest = path.slice(ADMIN_PREFIX.length);
  return rest.split("/")[0] ?? "";
}

function sectionForSegment(segment: string): AdminSectionId | null {
  for (const section of ADMIN_SECTIONS) {
    if (section.id === "overview" || section.id === "explorer") continue;
    if (section.prefixes.includes(segment)) return section.id;
  }
  return null;
}

function humanizeSegment(segment: string): string {
  return segment
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function groupCatalogEntries(
  entries: AdminCatalogEntry[],
): Record<string, AdminCatalogEntry[]> {
  const grouped: Record<string, AdminCatalogEntry[]> = Object.fromEntries(
    ADMIN_SECTIONS.map((s) => [s.id, [] as AdminCatalogEntry[]]),
  );

  const claimed = new Set<string>();
  const dynamicSegments = new Map<string, AdminCatalogEntry[]>();

  for (const entry of entries) {
    const segment = pathSegment(entry.path);
    const sectionId = sectionForSegment(segment);
    if (sectionId) {
      grouped[sectionId].push(entry);
      claimed.add(`${entry.method}:${entry.path}`);
    } else if (segment) {
      const dynId = `dynamic:${segment}`;
      if (!dynamicSegments.has(dynId)) dynamicSegments.set(dynId, []);
      dynamicSegments.get(dynId)!.push(entry);
      claimed.add(`${entry.method}:${entry.path}`);
    }
  }

  for (const [dynId, dynEntries] of dynamicSegments) {
    grouped[dynId] = dynEntries;
  }

  grouped.overview = entries.filter((e) => {
    const seg = pathSegment(e.path);
    return seg === "metrics" || (!e.mutate && e.method === "GET");
  });

  grouped.explorer = entries.filter(
    (e) => !claimed.has(`${e.method}:${e.path}`),
  );

  return grouped;
}

export function dynamicSectionMeta(id: string): AdminSectionMeta | null {
  if (!id.startsWith("dynamic:")) return null;
  const segment = id.slice("dynamic:".length);
  return {
    id: id as AdminSectionId,
    label: humanizeSegment(segment),
    prefixes: [segment],
    sort: 500,
  };
}

export function visibleSections(
  grouped: Record<string, AdminCatalogEntry[]>,
): AdminSectionMeta[] {
  const staticSections = ADMIN_SECTIONS.filter((section) => {
    if (section.alwaysShow) return true;
    if (section.id === "explorer") return false;
    return (grouped[section.id]?.length ?? 0) > 0;
  });

  const dynamicSections = Object.keys(grouped)
    .filter((k) => k.startsWith("dynamic:"))
    .map((k) => dynamicSectionMeta(k)!)
    .filter(Boolean);

  const explorer = ADMIN_SECTIONS.find((s) => s.id === "explorer")!;
  const hasExplorer = (grouped.explorer?.length ?? 0) > 0;

  return [
    ...staticSections,
    ...dynamicSections,
    ...(hasExplorer ? [explorer] : []),
  ].sort((a, b) => a.sort - b.sort);
}

export function entriesForSection(
  grouped: Record<string, AdminCatalogEntry[]>,
  sectionId: AdminSectionId | string,
): AdminCatalogEntry[] {
  return grouped[sectionId] ?? [];
}

function pathDepth(path: string): number {
  return path.split("/").filter(Boolean).length;
}

function hasPathParams(path: string): boolean {
  return path.includes("{");
}

export function pickListEndpoint(
  sectionId: AdminSectionId | string,
  entries: AdminCatalogEntry[],
): AdminCatalogEntry | null {
  const reads = entries.filter((e) => !e.mutate && e.method === "GET");
  if (!reads.length) return null;

  if (sectionId === "notifications") {
    const recent = reads.find((e) => e.path.includes("/notifications/recent"));
    if (recent) return recent;
  }

  if (sectionId === "sessions" || sectionId === "whoami" || sectionId === "catalog") {
    return null;
  }

  if (sectionId === "auth") {
    const collection = reads.filter(
      (e) =>
        !hasPathParams(e.path) &&
        !e.path.includes("/overview") &&
        (e.path.includes("client") ||
          e.path.includes("role") ||
          e.path.includes("provider")),
    );
    if (collection.length) {
      return collection.sort((a, b) => pathDepth(a.path) - pathDepth(b.path))[0];
    }
    return null;
  }

  const noParams = reads.filter((e) => !hasPathParams(e.path));
  if (noParams.length) {
    return noParams.sort((a, b) => pathDepth(a.path) - pathDepth(b.path))[0];
  }

  if (sectionId === "chloe") {
    return reads.find((e) => e.path.includes("quota")) ?? reads[0];
  }

  return reads.sort((a, b) => pathDepth(a.path) - pathDepth(b.path))[0];
}

export function pickDetailEndpoint(
  entries: AdminCatalogEntry[],
  idField = "id",
): AdminCatalogEntry | null {
  const reads = entries.filter(
    (e) => !e.mutate && e.method === "GET" && hasPathParams(e.path),
  );
  if (!reads.length) return null;

  const preferred = reads.find(
    (e) =>
      e.path.includes(`{${idField}}`) ||
      e.path.includes("{user_id}") ||
      e.path.includes("{session_id}"),
  );
  return preferred ?? reads[0];
}

export function pickMutateEndpoints(
  entries: AdminCatalogEntry[],
): AdminCatalogEntry[] {
  return entries.filter((e) => e.mutate);
}

export function resolvePathTemplate(
  template: string,
  params: Record<string, string>,
): string {
  let resolved = template;
  for (const [key, value] of Object.entries(params)) {
    resolved = resolved.replace(`{${key}}`, encodeURIComponent(value));
  }
  return resolved;
}

export function rowIdFromRecord(row: Record<string, unknown>): string | null {
  for (const key of ["id", "user_id", "session_id", "guild_id", "report_id"]) {
    const val = row[key];
    if (typeof val === "string" && val) return val;
    if (typeof val === "number") return String(val);
  }
  return null;
}
