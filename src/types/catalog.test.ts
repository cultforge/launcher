import { describe, it, expect } from "vitest";
import { isValidKeyword, normalizeKeywords } from "./catalog";

describe("isValidKeyword", () => {
  it("accepts lowercase alpha-numeric with - and _", () => {
    expect(isValidKeyword("survival")).toBe(true);
    expect(isValidKeyword("pvp-smp")).toBe(true);
    expect(isValidKeyword("my_world")).toBe(true);
    expect(isValidKeyword("a")).toBe(true);
    expect(isValidKeyword("1234567890abc")).toBe(true);
  });

  it("rejects empty", () => {
    expect(isValidKeyword("")).toBe(false);
  });

  it("rejects over 13 chars", () => {
    expect(isValidKeyword("aaaaaaaaaaaaaaaa")).toBe(false);
  });

  it("rejects uppercase", () => {
    expect(isValidKeyword("PVP")).toBe(false);
  });

  it("rejects spaces", () => {
    expect(isValidKeyword("my world")).toBe(false);
  });
});

describe("normalizeKeywords", () => {
  it("lowercases and trims", () => {
    expect(normalizeKeywords([" PvP ", "SMP"])).toEqual(["pvp", "smp"]);
  });

  it("drops invalid entries", () => {
    expect(normalizeKeywords(["ok", "TOO LONG TO PASS", "also ok"])).toEqual([
      "ok",
    ]);
  });

  it("limits to 13 entries", () => {
    const input = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    expect(normalizeKeywords(input).length).toBe(13);
  });
});
