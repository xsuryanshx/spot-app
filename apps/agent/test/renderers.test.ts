import { describe, expect, it } from "vitest";
import { renderMacroCard } from "../src/renderers.js";

describe("renderMacroCard", () => {
  it("renders an iMessage-friendly macro card", () => {
    const text = renderMacroCard({
      logged_items: [{ food: "eggs", qty: 2, unit: "large", calories: 140, protein: 12, carbs: 1, fat: 10 }],
      totals: { calories: 140, protein: 12, carbs: 1, fat: 10 },
      remaining: { calories: 2060, protein: 138, carbs: 219, fat: 60 },
      suggestions: ["Add Greek yogurt later."],
      nudge: "Protein is the lever now.",
      confidence: 0.8,
      source: "rocketride"
    });

    expect(text).toContain("Spot");
    expect(text).toContain("2 large eggs");
    expect(text).toContain("Left today: 2060 cal, 138g P, 219g C, 60g F");
    expect(text).toContain("- Add Greek yogurt later.");
  });

  it("renders clarifying fallback messages compactly", () => {
    const text = renderMacroCard({
      logged_items: [],
      totals: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      remaining: { calories: 2200, protein: 150, carbs: 220, fat: 70 },
      suggestions: [],
      nudge: "I need a food log first.",
      confidence: 0,
      clarifying_question: "What did you eat?",
      source: "fallback"
    });

    expect(text).toBe("Spot\n\nI need a food log first.\n\nWhat did you eat?");
  });
});
