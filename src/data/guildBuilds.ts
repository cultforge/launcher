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

export function guildBuildInstallState(
  release: GuildBuildRelease,
  builds: BuildInstance[],
): GuildBuildInstallState {
  const local = findManagedForRelease(release, builds);
  if (!local) return { state: "not-installed", localVersion: null };

  if (
    local.releaseId === release.id &&
    local.syncStatus === "synced" &&
    local.version === release.version
  ) {
    return { state: "installed", localVersion: local.version };
  }

  return { state: "update-available", localVersion: local.version };
}

export function managedInstanceIdForRelease(
  release: GuildBuildRelease,
): string {
  return guildInstanceId(release.guildId, release.buildId);
}
