import { describe, it, expect } from "vitest";
import { sortChatChronologically } from "./chatOrdering";

describe("sortChatChronologically", () => {
  it("sorts by createdAt ascending", () => {
    const messages = [
      { id: "c", createdAt: "2024-01-03T00:00:00Z" },
      { id: "a", createdAt: "2024-01-01T00:00:00Z" },
      { id: "b", createdAt: "2024-01-02T00:00:00Z" },
    ];
    const sorted = sortChatChronologically(messages);
    expect(sorted.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts by sequence when createdAt is missing", () => {
    const messages = [
      { id: "z", sequence: 3 },
      { id: "x", sequence: 1 },
      { id: "y", sequence: 2 },
    ];
    const sorted = sortChatChronologically(messages);
    expect(sorted.map((m) => m.id)).toEqual(["x", "y", "z"]);
  });

  it("uses sequence as tiebreaker for same timestamp", () => {
    const messages = [
      { id: "b", createdAt: "2024-01-01T00:00:00Z", sequence: 2 },
      { id: "a", createdAt: "2024-01-01T00:00:00Z", sequence: 1 },
    ];
    const sorted = sortChatChronologically(messages);
    expect(sorted.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("handles already-sorted input", () => {
    const messages = [
      { id: "1", createdAt: "2024-01-01T00:00:00Z" },
      { id: "2", createdAt: "2024-01-02T00:00:00Z" },
    ];
    const sorted = sortChatChronologically(messages);
    expect(sorted.map((m) => m.id)).toEqual(["1", "2"]);
  });

  it("handles reverse-order input (API newest-first)", () => {
    const messages = [
      { id: "3", createdAt: "2024-01-03T00:00:00Z" },
      { id: "2", createdAt: "2024-01-02T00:00:00Z" },
      { id: "1", createdAt: "2024-01-01T00:00:00Z" },
    ];
    const sorted = sortChatChronologically(messages);
    expect(sorted.map((m) => m.id)).toEqual(["1", "2", "3"]);
  });

  it("does not mutate original array", () => {
    const messages = [
      { id: "b", createdAt: "2024-01-02T00:00:00Z" },
      { id: "a", createdAt: "2024-01-01T00:00:00Z" },
    ];
    sortChatChronologically(messages);
    expect(messages[0].id).toBe("b");
  });
});
