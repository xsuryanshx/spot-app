import { computeRemaining, computeTotals, fallbackResult } from "./macros.js";
import type { FoodLogItem, SpotPipelineResult } from "./types.js";

type FoodDefinition = {
  aliases: string[];
  unit: string;
  servingWords?: string[];
  macros: Required<Pick<FoodLogItem, "calories" | "protein" | "carbs" | "fat">>;
};

const foods: FoodDefinition[] = [
  {
    aliases: ["egg", "eggs"],
    unit: "large",
    macros: { calories: 70, protein: 6, carbs: 1, fat: 5 }
  },
  {
    aliases: ["oatmeal", "oats"],
    unit: "cup cooked",
    servingWords: ["cup", "cups", "bowl", "bowls"],
    macros: { calories: 154, protein: 6, carbs: 27, fat: 3 }
  },
  {
    aliases: ["banana", "bananas"],
    unit: "medium",
    macros: { calories: 105, protein: 1, carbs: 27, fat: 0 }
  },
  {
    aliases: ["chicken", "chicken breast"],
    unit: "serving",
    servingWords: ["serving", "servings", "breast", "breasts"],
    macros: { calories: 165, protein: 31, carbs: 0, fat: 4 }
  },
  {
    aliases: ["rice", "white rice", "brown rice"],
    unit: "cup cooked",
    servingWords: ["cup", "cups", "bowl", "bowls"],
    macros: { calories: 205, protein: 4, carbs: 45, fat: 0 }
  },
  {
    aliases: ["greek yogurt", "yogurt"],
    unit: "cup",
    servingWords: ["cup", "cups", "container", "containers"],
    macros: { calories: 130, protein: 20, carbs: 9, fat: 0 }
  },
  {
    aliases: ["toast", "bread"],
    unit: "slice",
    servingWords: ["slice", "slices", "piece", "pieces"],
    macros: { calories: 80, protein: 3, carbs: 15, fat: 1 }
  },
  {
    aliases: ["avocado", "avocados"],
    unit: "half",
    macros: { calories: 120, protein: 2, carbs: 6, fat: 11 }
  }
];

const numbers: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10
};

export function estimateTextLog(text: string, reason?: string): SpotPipelineResult {
  const items = foods.flatMap((food) => estimateFood(text, food));

  if (items.length === 0) {
    return fallbackResult(
      reason ? `RocketRide is not ready yet, and I could not estimate that locally: ${reason}` : "I could not estimate that locally."
    );
  }

  const totals = computeTotals(items);
  const remaining = computeRemaining(totals);

  return {
    logged_items: items,
    totals,
    remaining,
    suggestions: buildSuggestions(remaining),
    nudge: reason
      ? "Estimated locally while RocketRide is offline. Good enough for the demo path."
      : "Estimated locally.",
    confidence: 0.62,
    source: "fallback"
  };
}

function estimateFood(text: string, food: FoodDefinition): FoodLogItem[] {
  const lower = text.toLowerCase();
  const alias = [...food.aliases].sort((left, right) => right.length - left.length).find((candidate) => lower.includes(candidate));
  if (!alias) return [];

  const qty = findQuantity(lower, alias, food);
  return [
    {
      food: alias,
      qty,
      unit: food.unit,
      calories: food.macros.calories * qty,
      protein: food.macros.protein * qty,
      carbs: food.macros.carbs * qty,
      fat: food.macros.fat * qty
    }
  ];
}

function findQuantity(text: string, alias: string, food: FoodDefinition): number {
  const escapedAlias = escapeRegExp(alias);
  const beforeAlias = new RegExp(`(?:^|\\s)(\\d+|${Object.keys(numbers).join("|")})\\s+(?:${food.servingWords?.join("|") ?? ""}\\s+)?${escapedAlias}\\b`);
  const beforeMatch = text.match(beforeAlias);
  if (beforeMatch?.[1]) return readNumber(beforeMatch[1]);

  const servingWords = food.servingWords?.join("|");
  if (servingWords) {
    const beforeServing = new RegExp(`(?:^|\\s)(\\d+|${Object.keys(numbers).join("|")})\\s+(?:${servingWords})\\s+(?:of\\s+)?${escapedAlias}\\b`);
    const servingMatch = text.match(beforeServing);
    if (servingMatch?.[1]) return readNumber(servingMatch[1]);
  }

  return 1;
}

function readNumber(value: string): number {
  const numeric = numbers[value] ?? Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSuggestions(remaining: { calories: number; protein: number; carbs: number; fat: number }): string[] {
  if (remaining.protein > 80) return ["Next order should be protein-heavy: chicken, Greek yogurt, tuna, or tofu."];
  if (remaining.calories < 0) return ["Keep the next move light: lean protein and vegetables."];
  return ["Stay steady: build the next plate around protein, then add carbs if training today."];
}
