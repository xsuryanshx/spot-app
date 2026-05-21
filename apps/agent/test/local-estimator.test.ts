import { describe, expect, it } from "vitest";
import { estimateTextLog } from "../src/local-estimator.js";

describe("estimateTextLog", () => {
  it("estimates common demo foods when RocketRide is offline", () => {
    const result = estimateTextLog("2 eggs and oatmeal", "offline");

    expect(result.logged_items).toHaveLength(2);
    expect(result.totals).toEqual({ calories: 294, protein: 18, carbs: 29, fat: 13 });
    expect(result.nudge).toContain("Estimated locally");
  });

  it("returns a clarifying fallback when it cannot recognize foods", () => {
    const result = estimateTextLog("mystery snack", "offline");

    expect(result.logged_items).toHaveLength(0);
    expect(result.clarifying_question).toContain("plain text food log");
  });
});
