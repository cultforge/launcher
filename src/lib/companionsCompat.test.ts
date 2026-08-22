import { describe, expect, it } from "vitest";
import {
  companionReleaseDownloadUrl,
  getCompatForLauncher,
  isCompanionFetchAllowed,
  isCompanionTagAllowed,
  resolveCompanionAssetName,
} from "./companionsCompat";

describe("companionsCompat (phase 0)", () => {
  it("resolves scanner for launcher 2.4.0", () => {
    const row = getCompatForLauncher("2.4.0");
    expect(row?.companions.scanner.status).toBe("active");
    expect(row?.companions.scanner.tag).toBe("v0.1.0");
    expect(row?.companions.client.status).toBe("active");
    expect(row?.companions.client.tag).toBe("client-v0.1.0");
    expect(row?.companions.ctfgbroker.status).toBe("pending");
  });

  it("allows only pinned scanner tag", () => {
    expect(isCompanionTagAllowed("2.4.1", "scanner", "v0.1.0")).toBe(true);
    expect(isCompanionTagAllowed("2.4.1", "scanner", "v9.9.9")).toBe(false);
  });

  it("allows pinned client tag on windows compat", () => {
    expect(isCompanionFetchAllowed("2.4.1", "client")).toBe(true);
    expect(isCompanionTagAllowed("2.4.1", "client", "client-v0.1.0")).toBe(
      true,
    );
    expect(
      companionReleaseDownloadUrl("2.4.1", "client", "windows-x86_64"),
    ).toBe(
      "https://github.com/cultforge/launcher/releases/download/client-v0.1.0/client.exe",
    );
    expect(
      companionReleaseDownloadUrl("2.4.1", "client", "linux-x86_64"),
    ).toBe(
      "https://github.com/cultforge/launcher/releases/download/client-v0.1.0/client-linux-x86_64",
    );
  });

  it("builds github download url for windows scanner", () => {
    const url = companionReleaseDownloadUrl(
      "2.4.0",
      "scanner",
      "windows-x86_64",
    );
    expect(url).toBe(
      "https://github.com/cultforge/mc-scanner/releases/download/v0.1.0/scanner.exe",
    );
    expect(
      resolveCompanionAssetName("2.4.0", "scanner", "macos-arm64"),
    ).toBe("scanner-macos-arm64");
  });

  it("floors unknown patch to nearest declared launcher row", () => {
    const row = getCompatForLauncher("2.4.0-hotfix");
    // 2.4.0-hotfix still parses as 2.4.0 triple for floor; exact key miss → floor 2.4.0
    expect(row?.companions.scanner.tag).toBe("v0.1.0");
  });
});
