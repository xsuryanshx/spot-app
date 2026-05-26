import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estimateTextLog } from "../src/local-estimator.js";

describe("estimateTextLog", () => {
  beforeEach(() => {
    vi.stubEnv("SPOT_DEMO_MODE", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("grounds common demo foods via USDA when RocketRide is offline", async () => {
    const result = await estimateTextLog("2 eggs and oatmeal", "offline");

    expect(result.logged_items).toHaveLength(2);
    expect(result.totals.calories).toBeGreaterThan(0);
    expect(result.totals.protein).toBeGreaterThan(0);
    expect(result.nudge).toContain("USDA");
  });

  it("returns a clarifying fallback when it cannot recognize foods", async () => {
    const result = await estimateTextLog("mystery snack", "offline");

    expect(result.logged_items).toHaveLength(0);
    expect(result.clarifying_question).toContain("plain text food log");
  });
});
