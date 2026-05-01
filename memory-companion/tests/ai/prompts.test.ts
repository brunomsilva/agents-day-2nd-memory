import { describe, it, expect } from "vitest";
import {
  buildCompanionPrompt,
  buildOnboardingPrompt,
  buildExtractionPrompt
} from "../../src/ai/prompts";

describe("buildCompanionPrompt", () => {
  it("includes name, city and date", () => {
    const prompt = buildCompanionPrompt(
      "Dori",
      "Sydney",
      "Thursday, 1 May 2026"
    );
    expect(prompt).toContain("Dori");
    expect(prompt).toContain("Sydney");
    expect(prompt).toContain("Thursday, 1 May 2026");
  });

  it("includes no-hallucination rules", () => {
    const prompt = buildCompanionPrompt(
      "Dori",
      "Sydney",
      "Thursday, 1 May 2026"
    );
    expect(prompt).toContain("NO knowledge");
    expect(prompt).toContain("tool");
  });

  it("does not contain unfilled placeholders", () => {
    const prompt = buildCompanionPrompt(
      "Dori",
      "Sydney",
      "Thursday, 1 May 2026"
    );
    expect(prompt).not.toContain("{name}");
    expect(prompt).not.toContain("{city}");
    expect(prompt).not.toContain("{date}");
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
