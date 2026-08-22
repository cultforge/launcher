/**
 * Phase 0 — companion compatibility contract.
 * Source of truth: `src/data/companions.compat.json`
 *
 * Launcher may only download / ship companion release tags listed for its
 * own semver. Phases 1–3 (scanner, client, ctfgbroker) consume this map.
 */
import compatJson from "../data/companions.compat.json";

export type CompanionId = "scanner" | "client" | "ctfgbroker";

export type CompanionPlatform =
  | "windows-x86_64"
  | "linux-x86_64"
  | "macos-arm64"
  | "macos-x86_64";

export type CompanionStatus = "active" | "pending" | "disabled";

export type CompanionCompatEntry = {
  repo: string | null;
  status: CompanionStatus;
  /** Preferred / pinned release tag for this launcher version. */
  tag: string | null;
  min_tag: string | null;
  max_tag: string | null;
  assets: Partial<Record<CompanionPlatform, string>>;
};

export type LauncherCompanionCompat = {
  companions: Record<CompanionId, CompanionCompatEntry>;
};

export type CompanionsCompatDocument = {
  schema: number;
  description?: string;
  by_launcher: Record<string, LauncherCompanionCompat>;
};

export const COMPANION_IDS: CompanionId[] = [
  "scanner",
  "client",
  "ctfgbroker",
];

/** Bundled Phase 0 manifest (shipped with the launcher). */
export const COMPANIONS_COMPAT = compatJson as CompanionsCompatDocument;

function normalizeSemver(version: string): string {
  return version.trim().replace(/^v/i, "");
}

/** Parse leading `major.minor.patch` for range checks (ignores prerelease suffix). */
function parseSemverTriple(tag: string): [number, number, number] | null {
  const cleaned = tag.trim().replace(/^v/i, "");
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(cleaned);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function cmpSemver(a: string, b: string): number | null {
  const pa = parseSemverTriple(a);
  const pb = parseSemverTriple(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    if (pa[i]! !== pb[i]!) return pa[i]! - pb[i]!;
  }
  return 0;
}

export function listCompatLauncherVersions(
  doc: CompanionsCompatDocument = COMPANIONS_COMPAT,
): string[] {
  return Object.keys(doc.by_launcher).sort((a, b) => {
    const c = cmpSemver(a, b);
    return c ?? a.localeCompare(b);
  });
}

/**
 * Resolve compat row for a launcher semver.
 * Exact match first; otherwise nearest lower declared version (floor).
 */
export function getCompatForLauncher(
  launcherVersion: string,
  doc: CompanionsCompatDocument = COMPANIONS_COMPAT,
): LauncherCompanionCompat | null {
  const key = normalizeSemver(launcherVersion);
  if (doc.by_launcher[key]) return doc.by_launcher[key]!;

  const versions = listCompatLauncherVersions(doc);
  let floor: string | null = null;
  for (const v of versions) {
    const c = cmpSemver(v, key);
    if (c == null) continue;
    if (c <= 0) floor = v;
  }
  return floor ? doc.by_launcher[floor]! : null;
}

export function getCompanionEntry(
  launcherVersion: string,
  companion: CompanionId,
  doc: CompanionsCompatDocument = COMPANIONS_COMPAT,
): CompanionCompatEntry | null {
  const row = getCompatForLauncher(launcherVersion, doc);
  return row?.companions[companion] ?? null;
}

/** True when this companion is active and has a pinned tag for the launcher. */
export function isCompanionFetchAllowed(
  launcherVersion: string,
  companion: CompanionId,
  doc: CompanionsCompatDocument = COMPANIONS_COMPAT,
): boolean {
  const entry = getCompanionEntry(launcherVersion, companion, doc);
  if (!entry || entry.status !== "active") return false;
  if (!entry.repo || !entry.tag) return false;
  return true;
}

/**
 * Whether a specific companion release tag is within the allowlist for
 * this launcher version (inclusive min/max when set).
 */
export function isCompanionTagAllowed(
  launcherVersion: string,
  companion: CompanionId,
  tag: string,
  doc: CompanionsCompatDocument = COMPANIONS_COMPAT,
): boolean {
  const entry = getCompanionEntry(launcherVersion, companion, doc);
  if (!entry || entry.status !== "active") return false;
  const want = tag.trim();
  if (!want) return false;

  if (entry.tag && normalizeSemver(entry.tag) === normalizeSemver(want)) {
    return true;
  }

  if (entry.min_tag) {
    const lo = cmpSemver(want, entry.min_tag);
    if (lo == null || lo < 0) return false;
  }
  if (entry.max_tag) {
    const hi = cmpSemver(want, entry.max_tag);
    if (hi == null || hi > 0) return false;
  }

  // If only min/max set (no exact tag match above), allow when inside range.
  if (entry.min_tag || entry.max_tag) return true;
  return false;
}

export function resolveCompanionAssetName(
  launcherVersion: string,
  companion: CompanionId,
  platform: CompanionPlatform,
  doc: CompanionsCompatDocument = COMPANIONS_COMPAT,
): string | null {
  const entry = getCompanionEntry(launcherVersion, companion, doc);
  if (!entry || entry.status !== "active") return null;
  return entry.assets[platform] ?? null;
}

/** GitHub release download URL for an allowed companion (or null if blocked). */
export function companionReleaseDownloadUrl(
  launcherVersion: string,
  companion: CompanionId,
  platform: CompanionPlatform,
  doc: CompanionsCompatDocument = COMPANIONS_COMPAT,
): string | null {
  const entry = getCompanionEntry(launcherVersion, companion, doc);
  if (!isCompanionFetchAllowed(launcherVersion, companion, doc) || !entry) {
    return null;
  }
  if (!isCompanionTagAllowed(launcherVersion, companion, entry.tag!, doc)) {
    return null;
  }
  const asset = entry.assets[platform];
  if (!entry.repo || !entry.tag || !asset) return null;
  return `https://github.com/${entry.repo}/releases/download/${entry.tag}/${asset}`;
}
