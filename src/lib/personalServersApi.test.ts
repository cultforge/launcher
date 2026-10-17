import { describe, it, expect } from "vitest";
import { personalServerJoinAddress } from "./personalServersApi";
import type { UserPersonalServerRecord } from "../types/catalog";

function makeServer(
  overrides: Partial<UserPersonalServerRecord> = {},
): UserPersonalServerRecord {
  return {
    id: "srv_1",
    ownerId: "u_1",
    name: "Test",
    serverAddress: "192.168.1.1",
    port: 25565,
    configuredAddress: "192.168.1.1",
    configuredPort: 25565,
    effectiveAddress: "192.168.1.1",
    effectivePort: 25565,
    addressSource: "configured",
    themeColor: "#7A2CFF",
    isActive: true,
    visibility: "private",
    joinPolicy: "allowlist",
    allowlistUserIds: [],
    allowlistUsernames: [],
    denylistUserIds: [],
    ...overrides,
  };
}

describe("personalServerJoinAddress", () => {
  it("returns configured address when no tunnel", () => {
    const server = makeServer();
    const addr = personalServerJoinAddress(server);
    expect(addr).toEqual({ address: "192.168.1.1", port: 25565 });
  });

  it("returns effective (tunnel) address when source is tunnel", () => {
    const server = makeServer({
      addressSource: "tunnel",
      effectiveAddress: "tunnel.cultforge.net",
      effectivePort: 12345,
    });
    const addr = personalServerJoinAddress(server);
    expect(addr).toEqual({ address: "tunnel.cultforge.net", port: 12345 });
  });
});
