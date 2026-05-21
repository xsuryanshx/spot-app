import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { roundMacro } from "./macros.js";
import type { FoodLogItem } from "./types.js";

export type UsdaNutrient = {
  nutrientId?: number;
  nutrientName: string;
  unitName: string;
  value: number;
};

export type UsdaFoodRecord = {
  fdcId: number;
  description: string;
  foodNutrients: UsdaNutrient[];
};

const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), "../test/fixtures");

const aliasToFixture: Record<string, string> = {
  egg: "usda-egg",
  eggs: "usda-egg",
  oatmeal: "usda-oatmeal",
  oats: "usda-oatmeal",
  banana: "usda-banana",
  bananas: "usda-banana",
  chicken: "usda-chicken",
  "chicken breast": "usda-chicken",
  rice: "usda-rice",
  "white rice": "usda-rice"
};

const demoFoods = loadDemoFoods();

export function macrosPerServing(record: UsdaFoodRecord): Required<
  Pick<FoodLogItem, "calories" | "protein" | "carbs" | "fat">
> {
  const nutrients = record.foodNutrients ?? [];
  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;

  for (const nutrient of nutrients) {
    const name = nutrient.nutrientName?.toLowerCase() ?? "";
    const value = nutrient.value ?? 0;
    if (name === "energy" || nutrient.nutrientId === 1008) calories = value;
    else if (name === "protein" || nutrient.nutrientId === 1003) protein = value;
    else if (name.includes("carbohydrate") || nutrient.nutrientId === 1005) carbs = value;
    else if (name.includes("total lipid") || nutrient.nutrientId === 1004) fat = value;
  }

  return {
    calories: roundMacro(calories),
    protein: roundMacro(protein),
    carbs: roundMacro(carbs),
    fat: roundMacro(fat)
  };
}

export function scaleMacros(
  macros: Required<Pick<FoodLogItem, "calories" | "protein" | "carbs" | "fat">>,
  qty: number
): Required<Pick<FoodLogItem, "calories" | "protein" | "carbs" | "fat">> {
  const safeQty = qty > 0 ? qty : 1;
  return {
    calories: roundMacro(macros.calories * safeQty),
    protein: roundMacro(macros.protein * safeQty),
    carbs: roundMacro(macros.carbs * safeQty),
    fat: roundMacro(macros.fat * safeQty)
  };
}

export function lookupDemoFood(name: string): UsdaFoodRecord | undefined {
  const key = aliasToFixture[normalizeFoodName(name)];
  return key ? demoFoods[key] : undefined;
}

export async function searchUsdaFood(query: string): Promise<UsdaFoodRecord | undefined> {
  if (process.env.SPOT_DEMO_MODE === "1") {
    return lookupDemoFood(query);
  }

  const apiKey = process.env.USDA_FDC_API_KEY;
  if (apiKey) {
    const live = await fetchFromUsdaApi(query, apiKey);
    if (live) return live;
  }

  return lookupDemoFood(query);
}

async function fetchFromUsdaApi(query: string, apiKey: string): Promise<UsdaFoodRecord | undefined> {
  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("query", query);
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("dataType", "Foundation,SR Legacy");

  const response = await fetch(url);
  if (!response.ok) {
    console.warn(`USDA search failed (${response.status}) for "${query}"`);
    return undefined;
  }

  const payload = (await response.json()) as { foods?: UsdaFoodRecord[] };
  return payload.foods?.[0];
}

export async function groundFoodItem(
  item: Pick<FoodLogItem, "food" | "qty" | "unit">
): Promise<FoodLogItem> {
  const record = await searchUsdaFood(item.food);
  if (!record) return { ...item };

  const perServing = macrosPerServing(record);
  const qty = item.qty && item.qty > 0 ? item.qty : 1;
  const scaled = scaleMacros(perServing, qty);

  return {
    food: record.description,
    qty,
    unit: item.unit ?? "serving",
    ...scaled
  };
}

export async function groundLoggedItems(items: FoodLogItem[]): Promise<FoodLogItem[]> {
  return Promise.all(items.map((item) => groundFoodItem(item)));
}

function normalizeFoodName(name: string): string {
  return name.trim().toLowerCase();
}

function loadDemoFoods(): Record<string, UsdaFoodRecord> {
  const entries = Object.entries(aliasToFixture).reduce<Record<string, string>>((unique, [, file]) => {
    unique[file] = file;
    return unique;
  }, {});

  return Object.keys(entries).reduce<Record<string, UsdaFoodRecord>>((loaded, file) => {
    const raw = readFileSync(resolve(fixtureDir, `${file}.json`), "utf8");
    loaded[file] = JSON.parse(raw) as UsdaFoodRecord;
    return loaded;
  }, {});
}
