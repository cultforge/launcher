import type { BuildInstance } from "../stores/build";
import type {
  GuildBuildInstallState,
  GuildBuildRelease,
} from "../types/buildManifest";
import { guildInstanceId } from "../lib/guildInstanceId";

/** Guild build releases — empty until CultForge guild build APIs are wired. */
export const GUILD_BUILD_RELEASES: GuildBuildRelease[] = [];

export function buildReleasesForGuild(guildId: string): GuildBuildRelease[] {
  return GUILD_BUILD_RELEASES.filter((release) => release.guildId === guildId);
}

function findManagedForRelease(
  release: GuildBuildRelease,
  builds: BuildInstance[],
): BuildInstance | undefined {
  const expectedId = guildInstanceId(release.guildId, release.buildId);
  return builds.find(
    (build) =>
      build.managed &&
      (build.id === expectedId ||
        (build.guildId === release.guildId &&
          build.buildKey === release.buildId) ||
        build.releaseId === release.id),
  );
}

function sameRelease(local: BuildInstance, release: GuildBuildRelease): boolean {
  if (local.releaseId && local.releaseId === release.id) return true;
  if (local.buildKey && local.buildKey === release.buildId) return true;
  return false;
}

function sameVersion(local: BuildInstance, release: GuildBuildRelease): boolean {
  const a = (local.version || "").trim();
  const b = (release.version || "").trim();
  if (!a || !b) return true;
  return a === b;
}

export function guildBuildInstallState(
  release: GuildBuildRelease,
  builds: BuildInstance[],
): GuildBuildInstallState {
  const local = findManagedForRelease(release, builds);
  if (!local) return { state: "not-installed", localVersion: null };

  // Active native sync — never call this an "update".
  if (local.syncStatus === "syncing") {
    return { state: "installing", localVersion: local.version || null };
  }

  if (sameRelease(local, release) && local.syncStatus === "synced") {
    if (sameVersion(local, release)) {
      return { state: "installed", localVersion: local.version };
    }
    // Same build id, newer catalog version → real update.
    return { state: "update-available", localVersion: local.version };
  }

  // Partial / failed / drifted instance for this release.
  if (sameRelease(local, release)) {
    return { state: "update-available", localVersion: local.version };
  }

  return { state: "update-available", localVersion: local.version };
}

export function managedInstanceIdForRelease(
  release: GuildBuildRelease,
): string {
  return guildInstanceId(release.guildId, release.buildId);
}
