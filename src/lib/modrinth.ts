export type ModrinthHit = {
  project_id: string;
  project_type: string;
  slug: string;
  title: string;
  description: string;
  categories: string[];
  downloads: number;
  icon_url: string | null;
  author?: string;
  display_categories?: string[];
  versions?: string[];
  follows?: number;
  date_modified?: string;
  latest_version?: string;
  license?: string;
  gallery?: string[];
  featured_gallery?: string | null;
};

export type ModrinthSearchResponse = {
  hits: ModrinthHit[];
  offset: number;
  limit: number;
  total_hits: number;
};

export type ModrinthDonationUrl = {
  id: string;
  platform: string;
  url: string;
};

export type ModrinthLicense = {
  id: string;
  name: string;
  url?: string | null;
};

export type ModrinthGalleryImage = {
  url: string;
  featured: boolean;
  title?: string | null;
  description?: string | null;
  created?: string;
  ordering?: number;
};

export type ModrinthProject = {
  id: string;
  slug: string;
  title: string;
  description: string;
  categories: string[];
  additional_categories?: string[];
  downloads: number;
  followers?: number;
  icon_url: string | null;
  body?: string;
  project_type: string;
  team?: string;
  client_side?: string;
  server_side?: string;
  published?: string;
  updated?: string;
  license?: ModrinthLicense | null;
  loaders?: string[];
  game_versions?: string[];
  issues_url?: string | null;
  source_url?: string | null;
  wiki_url?: string | null;
  discord_url?: string | null;
  donation_urls?: ModrinthDonationUrl[];
  gallery?: ModrinthGalleryImage[];
};

export type ModrinthDestKind =
  | "mods"
  | "resourcepacks"
  | "shaderpacks"
  | "datapacks";

export type ModrinthDependencyType =
  | "required"
  | "optional"
  | "incompatible"
  | "embedded";

export type ModrinthVersionFile = {
  url: string;
  filename: string;
  size: number;
  primary: boolean;
  hashes: {
    sha512?: string;
    sha1?: string;
  };
};

export type ModrinthVersionDependency = {
  version_id: string | null;
  project_id: string | null;
  file_name: string | null;
  dependency_type: ModrinthDependencyType;
};

export type ModrinthVersion = {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  changelog?: string;
  version_type?: "release" | "beta" | "alpha" | string;
  dependencies: ModrinthVersionDependency[];
  game_versions: string[];
  loaders: string[];
  files: ModrinthVersionFile[];
  date_published: string;
};

export type ModrinthInstallItem = {
  projectId: string;
  versionId: string;
  name: string;
  filename: string;
  url: string;
  sizeBytes: number;
  sha512: string;
  destKind: ModrinthDestKind;
};

export type ModrinthInstallPlan = {
  jobId: string;
  buildId: string;
  buildLocation: string;
  cacheRoot: string;
  items: ModrinthInstallItem[];
};

const BASE = "https://api.modrinth.com/v2";
const USER_AGENT = "CultForge/2.4.0 (launcher; https://github.com/CultForge)";

async function modrinthFetch(path: string): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
  });
  return res;
}

export function destKindForProjectType(projectType: string): ModrinthDestKind {
  switch (projectType) {
    case "resourcepack":
      return "resourcepacks";
    case "shader":
      return "shaderpacks";
    case "datapack":
      return "datapacks";
    default:
      return "mods";
  }
}

function normalizeLoader(loader: string): string {
  return loader.trim().toLowerCase().split(/\s+/)[0] ?? "";
}

function primaryFile(version: ModrinthVersion): ModrinthVersionFile | null {
  return (
    version.files.find((file) => file.primary) ?? version.files[0] ?? null
  );
}

export async function searchModrinth(opts: {
  query?: string;
  type?: string;
  loader?: string;
  version?: string;
  limit?: number;
  offset?: number;
}): Promise<ModrinthSearchResponse> {
  const facets: string[][] = [];
  if (opts.type) facets.push([`project_type:${opts.type}`]);
  if (opts.loader) facets.push([`categories:${opts.loader}`]);
  if (opts.version) facets.push([`versions:${opts.version}`]);

  const params = new URLSearchParams();
  params.set("query", opts.query ?? "");
  params.set("limit", String(opts.limit ?? 20));
  params.set("offset", String(opts.offset ?? 0));
  if (facets.length) params.set("facets", JSON.stringify(facets));

  const res = await modrinthFetch(`/search?${params}`);
  if (!res.ok) throw new Error(`Modrinth search failed (${res.status})`);
  return res.json();
}

export async function getModrinthProject(
  idOrSlug: string,
): Promise<ModrinthProject> {
  const res = await modrinthFetch(`/project/${encodeURIComponent(idOrSlug)}`);
  if (!res.ok) throw new Error(`Modrinth project failed (${res.status})`);
  return res.json();
}

/** Minecraft game versions from Modrinth tags (release-first). */
export async function fetchModrinthGameVersions(): Promise<string[]> {
  const res = await modrinthFetch("/tag/game_version");
  if (!res.ok) throw new Error(`Modrinth game versions failed (${res.status})`);
  const rows = (await res.json()) as Array<{
    version?: string;
    version_type?: string;
  }>;
  const releases = rows
    .filter((r) => r.version && (r.version_type === "release" || !r.version_type))
    .map((r) => String(r.version));
  const rest = rows
    .filter((r) => r.version && r.version_type && r.version_type !== "release")
    .map((r) => String(r.version));
  return [...new Set([...releases, ...rest])];
}

export type ModrinthPickResult = {
  name: string;
  slug: string;
  version: string;
  sourceUrl: string;
  projectId: string;
  versionId: string;
  projectType: string;
};

/**
 * Look up the Modrinth version that a local file belongs to, by file hash.
 * Returns null when the hash is unknown to Modrinth (404).
 */
export async function getModrinthVersionByFileHash(
  hash: string,
  algorithm: "sha1" | "sha512" = "sha1",
): Promise<ModrinthVersion | null> {
  const res = await modrinthFetch(
    `/version_file/${encodeURIComponent(hash)}?algorithm=${algorithm}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Modrinth version_file failed (${res.status})`);
  return res.json();
}

export async function getModrinthVersions(
  projectId: string,
  opts?: { gameVersions?: string[]; loaders?: string[] },
): Promise<ModrinthVersion[]> {
  const params = new URLSearchParams();
  if (opts?.gameVersions?.length) {
    params.set("game_versions", JSON.stringify(opts.gameVersions));
  }
  if (opts?.loaders?.length) {
    params.set("loaders", JSON.stringify(opts.loaders.map(normalizeLoader)));
  }
  const query = params.toString();
  const res = await modrinthFetch(
    `/project/${encodeURIComponent(projectId)}/version${query ? `?${query}` : ""}`,
  );
  if (!res.ok) throw new Error(`Modrinth versions failed (${res.status})`);
  return res.json();
}

export async function getModrinthVersion(
  versionId: string,
): Promise<ModrinthVersion> {
  const res = await modrinthFetch(
    `/version/${encodeURIComponent(versionId)}`,
  );
  if (!res.ok) throw new Error(`Modrinth version failed (${res.status})`);
  return res.json();
}

export function versionMatchesFilters(
  version: ModrinthVersion,
  gameVersion?: string,
  loader?: string,
) {
  if (gameVersion && !version.game_versions.includes(gameVersion)) {
    return false;
  }
  if (loader) {
    const wanted = normalizeLoader(loader);
    if (
      wanted &&
      wanted !== "—" &&
      wanted !== "-" &&
      wanted !== "vanilla" &&
      !version.loaders.some((entry) => normalizeLoader(entry) === wanted)
    ) {
      return false;
    }
  }
  return true;
}

export function formatRelativeDate(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

async function resolveVersionForProject(
  projectId: string,
  gameVersion?: string,
  loader?: string,
): Promise<ModrinthVersion> {
  const filtered = await getModrinthVersions(projectId, {
    gameVersions: gameVersion ? [gameVersion] : undefined,
    loaders: loader ? [normalizeLoader(loader)] : undefined,
  });
  const compatible =
    filtered.find((version) =>
      versionMatchesFilters(version, gameVersion, loader),
    ) ?? filtered[0];
  if (compatible) return compatible;

  const all = await getModrinthVersions(projectId);
  const fallback = all.find((version) =>
    versionMatchesFilters(version, gameVersion, loader),
  );
  if (!fallback) {
    throw new Error(
      `No compatible Modrinth version for ${projectId}` +
        (gameVersion || loader
          ? ` (${[gameVersion, loader].filter(Boolean).join(" / ")})`
          : ""),
    );
  }
  return fallback;
}

function toInstallItem(
  project: ModrinthProject,
  version: ModrinthVersion,
): ModrinthInstallItem {
  const file = primaryFile(version);
  if (!file) {
    throw new Error(`No downloadable file for ${project.title}`);
  }
  const sha512 = file.hashes.sha512;
  if (!sha512) {
    throw new Error(`Missing SHA-512 for ${file.filename}`);
  }
  return {
    projectId: project.id,
    versionId: version.id,
    name: project.title,
    filename: file.filename,
    url: file.url,
    sizeBytes: file.size,
    sha512,
    destKind: destKindForProjectType(project.project_type),
  };
}

export async function resolveModrinthInstallPlan(opts: {
  projectId: string;
  buildId: string;
  buildLocation: string;
  cacheRoot: string;
  gameVersion?: string;
  loader?: string;
  projectType?: string;
  /** When set, use this Modrinth version for the root project only. */
  versionId?: string;
}): Promise<ModrinthInstallPlan> {
  if (!opts.buildLocation.trim()) {
    throw new Error("Selected build has no install location.");
  }

  const jobId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `job-${Date.now()}`;

  const items: ModrinthInstallItem[] = [];
  const seenProjects = new Set<string>();
  const queue: string[] = [opts.projectId];
  let isRoot = true;

  while (queue.length) {
    const projectId = queue.shift()!;
    if (seenProjects.has(projectId)) continue;
    seenProjects.add(projectId);

    const project = await getModrinthProject(projectId);
    let version: ModrinthVersion;
    if (isRoot && opts.versionId) {
      version = await getModrinthVersion(opts.versionId);
      if (version.project_id !== projectId) {
        throw new Error("Selected version does not belong to this project.");
      }
    } else {
      version = await resolveVersionForProject(
        projectId,
        opts.gameVersion,
        opts.loader,
      );
    }
    isRoot = false;
    items.push(toInstallItem(project, version));

    for (const dep of version.dependencies) {
      if (dep.dependency_type !== "required" || !dep.project_id) continue;
      if (seenProjects.has(dep.project_id)) continue;
      queue.push(dep.project_id);
    }
  }

  return {
    jobId,
    buildId: opts.buildId,
    buildLocation: opts.buildLocation,
    cacheRoot: opts.cacheRoot,
    items,
  };
}

export function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
