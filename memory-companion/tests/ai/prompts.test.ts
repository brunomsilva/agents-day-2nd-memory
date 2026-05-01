import { describe, it, expect } from "vitest";
import {
  buildCompanionPrompt,
  buildOnboardingPrompt,
  buildExtractionPrompt
} from "../../src/ai/prompts";

describe("buildCompanionPrompt", () => {
  it("includes date", () => {
    const prompt = buildCompanionPrompt("Thursday, 1 May 2026", "09:30");
    expect(prompt).toContain("Thursday, 1 May 2026");
  });

  it("includes current time", () => {
    const prompt = buildCompanionPrompt("Thursday, 1 May 2026", "09:30");
    expect(prompt).toContain("09:30");
  });

  it("does not include name or city", () => {
    const prompt = buildCompanionPrompt("Thursday, 1 May 2026", "09:30");
    expect(prompt).not.toContain("Jane Doe");
    expect(prompt).not.toContain("Porto");
  });

  it("includes no-hallucination rules", () => {
    const prompt = buildCompanionPrompt("Thursday, 1 May 2026", "09:30");
    expect(prompt).toContain("NO knowledge");
    expect(prompt).toContain("tool");
  });

  it("does not contain unfilled placeholders", () => {
    const prompt = buildCompanionPrompt("Thursday, 1 May 2026", "09:30");
    expect(prompt).not.toContain("{date}");
  });

  it("includes reminder detection rule referencing all three tools", () => {
    const prompt = buildCompanionPrompt("Thursday, 1 May 2026", "09:30");
    expect(prompt).toContain("setReminder");
    expect(prompt).toContain("listReminders");
    expect(prompt).toContain("cancelReminder");
  });
});

describe("buildOnboardingPrompt", () => {
  it("establishes Mia as the assistant name", () => {
    expect(buildOnboardingPrompt()).toContain("Mia");
  });

  it("instructs the model to be warm and brief", () => {
    expect(buildOnboardingPrompt()).toContain("warm");
  });
});

describe("buildExtractionPrompt", () => {
  it("instructs to extract facts", () => {
    expect(buildExtractionPrompt()).toContain("extract");
  });

  it("instructs not to respond with text", () => {
    expect(buildExtractionPrompt()).toContain("tool calls");
  });
});
