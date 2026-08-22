import { describe, expect, it } from "vitest";
import {
  formatBuildSizeBytes,
  heuristicGuildBuildSizes,
} from "./guildBuildSize";
import type { GuildBuildRelease } from "../types/buildManifest";

function sample(
  overrides: Partial<GuildBuildRelease> = {},
): GuildBuildRelease {
  return {
    id: "b1",
    buildId: "b1",
    guildId: "g1",
    serverId: "",
    name: "Valthera",
    summary: "",
    version: "1.0.0",
    publishedAt: "2026-01-01",
    publishedAtIso: "2026-01-01",
    image: "",
    dependencies: { minecraft: "1.20.1", loader: "forge", java: "17+" },
    sizes: { downloadBytes: 0, installedBytes: 0 },
    content: { mods: 181, resourcePacks: 12, shaders: 1, configs: 0 },
    changelog: [],
    excludes: ["saves/**"],
    requiredMods: Array.from({ length: 181 }, (_, i) => ({ name: `mod-${i}` })),
    optionalMods: [],
    shaders: [{ name: "shader" }],
    resourcePacks: Array.from({ length: 12 }, (_, i) => ({ name: `rp-${i}` })),
    ...overrides,
  };
}

describe("guildBuildSize", () => {
  it("estimates non-zero sizes from content counts", () => {
    const est = heuristicGuildBuildSizes(sample());
    expect(est.downloadBytes).toBeGreaterThan(500_000_000);
    expect(est.installedBytes).toBeGreaterThan(est.downloadBytes);
    expect(est.estimated).toBe(true);
  });

  it("formats MB instead of 0.00 GB", () => {
    expect(formatBuildSizeBytes(0)).toBe("—");
    expect(formatBuildSizeBytes(12_500_000)).toBe("11.9 MB");
    expect(formatBuildSizeBytes(1_800_000_000, { estimated: true })).toBe(
      "~1.68 GB",
    );
  });
});
