import { describe, expect, it } from "vitest";
import { releaseFromGuildBuildRecord } from "./guildBuildApi";

describe("releaseFromGuildBuildRecord", () => {
  it("uses fallback guild id when API omits guild_id on list rows", () => {
    const row = releaseFromGuildBuildRecord(
      {
        id: "bld_1",
        name: "Season Zero",
        version: "1.0.0",
        minecraft_version: "1.21.1",
        loader: "fabric",
      },
      "guild_cultforge",
    );
    expect(row?.id).toBe("bld_1");
    expect(row?.guildId).toBe("guild_cultforge");
    expect(row?.name).toBe("Season Zero");
  });

  it("rejects rows without id/name even with fallback", () => {
    expect(releaseFromGuildBuildRecord({ id: "x" }, "g1")).toBeNull();
  });
});
