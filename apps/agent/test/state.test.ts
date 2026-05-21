import { afterEach, describe, expect, it, vi } from "vitest";
import { UserStateStore } from "../src/state.js";

describe("UserStateStore", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accumulates daily totals and computes remaining", () => {
    vi.stubEnv("SPOT_TIMEZONE", "UTC");
    const store = new UserStateStore(`/tmp/spot-test-${Date.now()}-1.json`);

    store.recordMeal("user-1", [
      { food: "eggs", qty: 2, calories: 140, protein: 12, carbs: 1, fat: 10 }
    ]);
    store.recordMeal("user-1", [
      { food: "banana", qty: 1, calories: 105, protein: 1, carbs: 27, fat: 0 }
    ]);

    expect(store.getDailyTotals("user-1")).toEqual({
      calories: 245,
      protein: 13,
      carbs: 28,
      fat: 10
    });
    expect(store.getRemaining("user-1").calories).toBe(2200 - 245);
  });

  it("adds Strava burn to the adjusted calorie target", () => {
    vi.stubEnv("SPOT_TIMEZONE", "UTC");
    const store = new UserStateStore(`/tmp/spot-test-${Date.now()}-2.json`);
    store.setBurn("user-2", 400);

    expect(store.getAdjustedTarget("user-2").calories).toBe(2600);
  });
});
