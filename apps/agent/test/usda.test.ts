import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  groundFoodItem,
  groundLoggedItems,
  lookupDemoFood,
  macrosPerServing,
  scaleMacros,
  searchUsdaFood
} from "../src/usda.js";

const fixture = (name: string) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, `fixtures/${name}.json`), "utf8"));

describe("USDA grounding", () => {
  beforeEach(() => {
    vi.stubEnv("SPOT_DEMO_MODE", "1");
    vi.stubEnv("USDA_FDC_API_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads per-serving macros from fixture nutrients", () => {
    const egg = lookupDemoFood("eggs");
    expect(egg).toBeDefined();
    expect(macrosPerServing(egg!)).toEqual({
      calories: 143,
      protein: 13,
      carbs: 1,
      fat: 10
    });
  });

  it("scales macros by quantity", () => {
    const perServing = macrosPerServing(fixture("usda-egg"));
    expect(scaleMacros(perServing, 2)).toEqual({
      calories: 286,
      protein: 26,
      carbs: 2,
      fat: 20
    });
  });

  it("grounds a logged item with USDA calories", async () => {
    const item = await groundFoodItem({ food: "eggs", qty: 2, unit: "large" });
    expect(item.calories).toBe(286);
    expect(item.protein).toBe(26);
    expect(item.food).toContain("Egg");
  });

  it("grounds multiple items in parallel", async () => {
    const items = await groundLoggedItems([
      { food: "banana", qty: 1, unit: "medium" },
      { food: "chicken breast", qty: 1, unit: "serving" }
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]?.calories).toBeGreaterThan(0);
    expect(items[1]?.protein).toBeGreaterThan(20);
  });

  it("fetches live USDA data when API key is set", async () => {
    vi.stubEnv("SPOT_DEMO_MODE", "0");
    vi.stubEnv("USDA_FDC_API_KEY", "DEMO_KEY");

    const mockFood = fixture("usda-banana");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ foods: [mockFood] })
      })
    );

    const record = await searchUsdaFood("banana");
    expect(record?.description).toContain("Bananas");
    const calledUrl = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    expect(calledUrl).toContain("api.nal.usda.gov/fdc/v1/foods/search");

    vi.unstubAllGlobals();
  });
});
