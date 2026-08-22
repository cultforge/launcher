import { guildServerJoinAddress, type GuildServer } from "../data/guilds";
import { guildInstanceId } from "./guildInstanceId";
import { personalServerJoinAddress } from "./personalServersApi";
import type { UserPersonalServerRecord } from "../types/catalog";
import type { BuildInstance } from "../stores/build";

export type LaunchServerListEntry = {
  name: string;
  ip: string;
};

function buildMatchesRequired(
  build: BuildInstance,
  requiredBuildId: string,
  guildId?: string | null,
): boolean {
  const required = requiredBuildId.trim();
  if (!required) return false;
  if (build.id === required) return true;
  if (build.buildKey === required) return true;
  if (build.releaseId === required) return true;
  if (guildId && build.id === guildInstanceId(guildId, required)) return true;
  if (
    build.guildId &&
    guildId &&
    build.guildId === guildId &&
    build.buildKey === required
  ) {
    return true;
  }
  return false;
}

/** Servers tied to this build (guild requiredBuildId / personal buildId). */
export function resolveServersForBuild(
  build: BuildInstance,
  guildServers: GuildServer[],
  personalServers: UserPersonalServerRecord[] = [],
): LaunchServerListEntry[] {
  const out: LaunchServerListEntry[] = [];
  const seen = new Set<string>();

  for (const server of guildServers) {
    if (!buildMatchesRequired(build, server.requiredBuildId, server.guildId)) {
      continue;
    }
    const ip = guildServerJoinAddress(server);
    if (!ip || seen.has(ip.toLowerCase())) continue;
    seen.add(ip.toLowerCase());
    out.push({ name: server.name || "Guild server", ip });
  }

  for (const server of personalServers) {
    const linked = (server.buildId || "").trim();
    if (!linked) continue;
    if (!buildMatchesRequired(build, linked, build.guildId)) continue;
    const join = personalServerJoinAddress(server);
    if (!join.address) continue;
    const ip = `${join.address}:${join.port}`;
    if (seen.has(ip.toLowerCase())) continue;
    seen.add(ip.toLowerCase());
    out.push({ name: server.name || "Personal server", ip });
  }

  return out;
}
