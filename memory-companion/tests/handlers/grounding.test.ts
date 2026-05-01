import { describe, it, expect } from "vitest";
import { buildGroundingCard } from "../../src/handlers/grounding";

describe("buildGroundingCard", () => {
  const base = {
    userName: "Dori",
    city: "Sydney",
    dateStr: "Thursday, 1 May 2026",
    timeStr: "10:23am",
    todayEvents: [] as { occurred_on: string; description: string }[],
    todayRoutines: [] as { name: string; scheduled_time: string | null }[],
    todayMedications: [] as {
      name: string;
      dosage: string | null;
      status: string;
    }[],
    recentEvents: [] as { occurred_on: string; description: string }[]
  };

  it("includes city, date and time", () => {
    const card = buildGroundingCard(base);
    expect(card).toContain("Sydney");
    expect(card).toContain("Thursday, 1 May 2026");
    expect(card).toContain("10:23am");
  });

  it("shows taken medication with check mark", () => {
    const card = buildGroundingCard({
      ...base,
      todayMedications: [{ name: "Algae Chips", dosage: "5mg", status: "taken" }]
    });
    expect(card).toContain("Algae Chips");
    expect(card).toContain("✅");
  });

  it("shows pending medication with pill emoji", () => {
    const card = buildGroundingCard({
      ...base,
      todayMedications: [{ name: "Algae Chips", dosage: "5mg", status: "pending" }]
    });
    expect(card).toContain("💊");
  });

  it("lists a routine with time", () => {
    const card = buildGroundingCard({
      ...base,
      todayRoutines: [
        { name: "Dr. Costa appointment", scheduled_time: "14:00" }
      ]
    });
    expect(card).toContain("Dr. Costa");
    expect(card).toContain("14:00");
  });

  it("lists recent events", () => {
    const card = buildGroundingCard({
      ...base,
      recentEvents: [
        { occurred_on: "2026-04-30", description: "João visited for coffee" }
      ]
    });
    expect(card).toContain("João visited for coffee");
  });

  it("has no undefined or null in output", () => {
    const card = buildGroundingCard(base);
    expect(card).not.toContain("undefined");
    expect(card).not.toContain("null");
  });
});
