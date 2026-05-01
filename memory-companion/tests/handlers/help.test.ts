import { describe, it, expect } from "vitest";
import { distressCheck, buildHelpResponse } from "../../src/handlers/help";

describe("distressCheck", () => {
  it('returns true for "I want to die"', () => {
    expect(distressCheck("I want to die")).toBe(true);
  });

  it('returns true for "I can\'t go on"', () => {
    expect(distressCheck("I can't go on")).toBe(true);
  });

  it('returns true for "I\'m in danger"', () => {
    expect(distressCheck("I'm in danger")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(distressCheck("I WANT TO DIE")).toBe(true);
  });

  it("returns false for normal messages", () => {
    expect(distressCheck("What day is it today?")).toBe(false);
    expect(distressCheck("Who is Maria?")).toBe(false);
    expect(distressCheck("I need help finding my keys")).toBe(false);
  });

  it('returns true for "I can\'t do this anymore"', () => {
    expect(distressCheck("I can't do this anymore")).toBe(true);
  });
});

describe("buildHelpResponse", () => {
  it("includes the user name", () => {
    const result = buildHelpResponse("António", []);
    expect(result).toContain("António");
  });

  it("includes contact name and phone when provided", () => {
    const result = buildHelpResponse("António", [
      {
        id: 1,
        name: "Maria",
        relationship: "daughter",
        phone: "+351912345678",
        notes: null,
        last_mentioned_at: null
      }
    ]);
    expect(result).toContain("Maria");
    expect(result).toContain("+351912345678");
  });

  it("shows contact without phone when phone is null", () => {
    const result = buildHelpResponse("António", [
      {
        id: 1,
        name: "Maria",
        relationship: "daughter",
        phone: null,
        notes: null,
        last_mentioned_at: null
      }
    ]);
    expect(result).not.toContain("null");
  });
});
