import { describe, it, expect } from "vitest";
import { formatWeeklySummary } from "../../src/scheduling/summaries";
import type { WeeklySummaryPayload } from "../../src/types";

describe("formatWeeklySummary", () => {
  const base: WeeklySummaryPayload = {
    profileName: "Jane Doe",
    weekStart: "2026-04-28",
    weekEnd: "2026-05-04",
    medicationAdherence: [],
    moods: [],
    events: [],
    helpRequests: 0
  };

  it("includes the user name and date range", () => {
    const result = formatWeeklySummary(base);
    expect(result).toContain("Jane Doe");
    expect(result).toContain("2026-04-28");
    expect(result).toContain("2026-05-04");
  });

  it("shows medication adherence with fraction", () => {
    const result = formatWeeklySummary({
      ...base,
      medicationAdherence: [
        { name: "Aspirin", taken: 6, skipped: 0, no_response: 1, total: 7 }
      ]
    });
    expect(result).toContain("Aspirin");
    expect(result).toContain("6/7");
  });

  it("shows mood summary with counts", () => {
    const result = formatWeeklySummary({
      ...base,
      moods: ["good", "good", "not_great"]
    });
    expect(result).toContain("good");
    expect(result).toContain("2x");
  });

  it("shows events with date", () => {
    const result = formatWeeklySummary({
      ...base,
      events: [
        {
          id: 1,
          occurred_on: "2026-05-01",
          description: "João visited",
          type: "event",
          source: "user"
        }
      ]
    });
    expect(result).toContain("João visited");
    expect(result).toContain("2026-05-01");
  });

  it("has no undefined or null in output", () => {
    const result = formatWeeklySummary(base);
    expect(result).not.toContain("undefined");
    expect(result).not.toContain("null");
  });
});
