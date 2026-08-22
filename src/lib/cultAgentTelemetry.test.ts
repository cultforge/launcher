import { describe, expect, it } from "vitest";
import {
  matchConsoleForServer,
  matchPresenceForServer,
  mergeConsoleTail,
  parseTelemetryHud,
  summarizeTelemetry,
} from "./cultAgentTelemetry";

describe("summarizeTelemetry", () => {
  it("reads Crafty-style system.ram percent + total", () => {
    const view = summarizeTelemetry({
      node_id: "n1",
      status: "online",
      system: {
        ram: { total: 25455968256, percent: 91.9 },
        cpu: { percent: 42.5 },
        disk: { total: 500000000000, used: 100000000000 },
      },
    });
    expect(view.cpuPct).toBe(42.5);
    expect(view.ramPct).toBe(91.9);
    expect(view.ramTotalGb).toBeCloseTo(23.71, 1);
    expect(view.ramUsedGb).toBeCloseTo(23.71 * 0.919, 1);
    expect(view.diskUsedGb).toBeCloseTo(93.13, 0);
  });
});

describe("parseTelemetryHud", () => {
  it("reads activity.lines + consoles from metrics snapshot", () => {
    const hud = parseTelemetryHud({
      system: { cpu: { percent: 10 } },
      activity: {
        schema_version: 1,
        lines: [
          {
            ts: "2026-08-22T16:48:25Z",
            kind: "ok",
            text: "Connected to CultForge realtime",
          },
          { ts: "2026-08-22T16:48:30Z", kind: "warn", text: "Slow poll" },
        ],
      },
      consoles: [
        {
          server_id: "srv_test",
          seq: 1234,
          lines: [
            { seq: 1230, ts: "…", text: "[12:01] Done (3.2s)!" },
            { seq: 1231, text: "Ready" },
          ],
        },
      ],
    });
    expect(hud.activity).toHaveLength(2);
    expect(hud.activity[0].kind).toBe("ok");
    expect(hud.activity[0].text).toContain("Connected");
    expect(hud.consoles).toHaveLength(1);
    expect(hud.consoles[0].serverId).toBe("srv_test");
    expect(hud.consoles[0].lines).toHaveLength(2);
  });

  it("reads nested metrics.activity / metrics.consoles", () => {
    const hud = parseTelemetryHud({
      metrics: {
        activity: { lines: [{ kind: "info", text: "Hello" }] },
        consoles: [{ server_id: "upsrv_1", lines: ["line a"] }],
      },
    });
    expect(hud.activity[0].text).toBe("Hello");
    expect(hud.consoles[0].serverId).toBe("upsrv_1");
  });

  it("reads presence roster + realtime transport", () => {
    const hud = parseTelemetryHud({
      transport: { mode: "websocket", connected: true },
      presence: [
        {
          server_id: "srv_test",
          player_count: 2,
          players: [
            { name: "Steve", minecraft_name: "Steve" },
            { name: "Alex" },
          ],
        },
      ],
    });
    expect(hud.transport).toBe("realtime");
    expect(hud.presence).toHaveLength(1);
    expect(hud.presence[0].playerCount).toBe(2);
    expect(hud.presence[0].players.map((p) => p.name)).toEqual([
      "Steve",
      "Alex",
    ]);
    const match = matchPresenceForServer(hud.presence, ["srv_test"]);
    expect(match?.players).toHaveLength(2);
  });

  it("infers realtime from activity text when transport missing", () => {
    const hud = parseTelemetryHud({
      activity: {
        lines: [{ kind: "ok", text: "Connected to CultForge realtime" }],
      },
    });
    expect(hud.transport).toBe("realtime");
  });
});

describe("matchConsoleForServer + mergeConsoleTail", () => {
  it("matches by server id and appends by seq", () => {
    const hud = parseTelemetryHud({
      consoles: [
        {
          server_id: "srv_a",
          seq: 10,
          lines: [
            { seq: 8, text: "old" },
            { seq: 9, text: "mid" },
            { seq: 10, text: "new" },
          ],
        },
      ],
    });
    const tail = matchConsoleForServer(hud.consoles, ["srv_a"]);
    expect(tail?.serverId).toBe("srv_a");
    const first = mergeConsoleTail([], 0, tail!);
    expect(first?.lines).toEqual(["old", "mid", "new"]);
    expect(first?.nextSeq).toBe(10);
    const second = mergeConsoleTail(first!.lines, first!.nextSeq, {
      ...tail!,
      lines: [
        { seq: 9, text: "mid", ts: null },
        { seq: 10, text: "new", ts: null },
        { seq: 11, text: "newer", ts: null },
      ],
      seq: 11,
    });
    expect(second?.lines).toEqual(["old", "mid", "new", "newer"]);
    expect(second?.nextSeq).toBe(11);
  });
});
