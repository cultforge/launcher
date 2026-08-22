import { describe, expect, it } from "vitest";
import { guildBuildInstallState } from "../data/guildBuilds";
import type { BuildInstance } from "../stores/build";
import type { GuildBuildRelease } from "../types/buildManifest";

function release(
  overrides: Partial<GuildBuildRelease> = {},
): GuildBuildRelease {
  return {
    id: "rel-1",
    buildId: "bld-1",
    guildId: "guild-1",
    serverId: "",
    name: "Valthera",
    summary: "",
    version: "1.0.0",
    publishedAt: "2026-01-01",
    publishedAtIso: "2026-01-01",
    image: "",
    dependencies: { minecraft: "1.20.1", loader: "forge", java: "17+" },
    sizes: { downloadBytes: 1, installedBytes: 1 },
    content: { mods: 1, resourcePacks: 0, shaders: 0, configs: 0 },
    changelog: [],
    excludes: [],
    ...overrides,
  };
}

function local(overrides: Partial<BuildInstance> = {}): BuildInstance {
  return {
    id: "guild-1__bld-1",
    name: "Valthera",
    mc: "1.20.1",
    loader: "forge",
    java: "17+",
    mods: 1,
    lastPlayed: "Never",
    lastPlayedMs: 0,
    status: "Ready",
    accent: "",
    description: "",
    tags: [],
    heroLandscape: "",
    image: null,
    created: "",
    version: "1.0.0",
    playtime: "—",
    playtimeMinutes: 0,
    worlds: "0",
    size: "—",
    location: "C:/tmp",
    versionPath: "",
    screenshots: [],
    notes: "",
    config: {} as BuildInstance["config"],
    activeShaderId: null,
    source: "guild",
    managed: true,
    guildId: "guild-1",
    releaseId: "rel-1",
    buildKey: "bld-1",
    syncStatus: "synced",
    ...overrides,
  };
}

describe("guildBuildInstallState", () => {
  it("marks syncing as installing, not update-available", () => {
    const state = guildBuildInstallState(release(), [
      local({ syncStatus: "syncing" }),
    ]);
    expect(state.state).toBe("installing");
  });

  it("marks synced matching release as installed", () => {
    const state = guildBuildInstallState(release(), [local()]);
    expect(state.state).toBe("installed");
  });

  it("marks synced same id with newer catalog version as update", () => {
    const state = guildBuildInstallState(release({ version: "1.1.0" }), [
      local({ version: "1.0.0" }),
    ]);
    expect(state.state).toBe("update-available");
  });
});
