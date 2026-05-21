import { describe, expect, it } from "vitest";
import { computeRemaining, computeTotals, normalizePipelineResult, parseJsonish } from "../src/macros.js";

describe("macro math", () => {
  it("sums logged food macros", () => {
    expect(
      computeTotals([
        { food: "eggs", calories: 140, protein: 12, carbs: 1, fat: 10 },
        { food: "oatmeal", calories: 154, protein: 6, carbs: 27, fat: 3 }
      ])
    ).toEqual({ calories: 294, protein: 18, carbs: 28, fat: 13 });
  });

  it("computes remaining macros against a target", () => {
    expect(
      computeRemaining(
        { calories: 500, protein: 40, carbs: 60, fat: 20 },
        { calories: 2000, protein: 150, carbs: 220, fat: 70 }
      )
    ).toEqual({ calories: 1500, protein: 110, carbs: 160, fat: 50 });
  });
});

describe("pipeline response normalization", () => {
  it("parses fenced JSON from a custom response key", () => {
    const result = normalizePipelineResult({
      result_types: { spot: "answers" },
      spot: [
        '```json\n{"logged_items":[{"food":"banana","calories":105,"protein":1,"carbs":27,"fat":0}],"totals":{"calories":105,"protein":1,"carbs":27,"fat":0},"suggestions":["Add protein."],"nudge":"Nice.","confidence":0.9}\n```'
      ]
    });

    expect(result.logged_items[0]?.food).toBe("banana");
    expect(result.remaining.protein).toBe(149);
    expect(result.source).toBe("rocketride");
  });

  it("extracts JSON embedded in surrounding text", () => {
    expect(parseJsonish('Here is it: {"totals":{"calories":1}} thanks')).toEqual({
      totals: { calories: 1 }
    });
  });
});
