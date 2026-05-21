import type { FoodLogItem } from "./types.js";

const numberWords: Record<string, number> = {
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

const unitWords =
  "cup|cups|bowl|bowls|slice|slices|serving|servings|piece|pieces|oz|ounce|ounces|gram|grams|tbsp|tsp";

export function parseFoodText(text: string): FoodLogItem[] {
  const segments = text
    .split(/\s*,\s*|\s+and\s+|\s*&\s*|\s+with\s+/i)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 1);

  if (segments.length === 0) return [];

  return segments.flatMap((segment) => {
    const parsed = parseSegment(segment);
    return parsed ? [parsed] : [];
  });
}

function parseSegment(segment: string): FoodLogItem | undefined {
  let working = segment.replace(/^(had|ate|eating|for\s+(breakfast|lunch|dinner))\s+/i, "").trim();
  if (!working) return undefined;

  const numberedUnit = working.match(
    new RegExp(`^(\\d+(?:\\.\\d+)?|${Object.keys(numberWords).join("|")})\\s+(${unitWords})\\s+(?:of\\s+)?(.+)$`, "i")
  );
  if (numberedUnit) {
    return {
      food: numberedUnit[3].trim(),
      qty: readQuantity(numberedUnit[1]),
      unit: numberedUnit[2].toLowerCase()
    };
  }

  const leadingNumber = working.match(/^(\d+(?:\.\d+)?|[a-z]+)\s+(.+)$/i);
  if (leadingNumber && (/\d/.test(leadingNumber[1]) || leadingNumber[1].toLowerCase() in numberWords)) {
    return {
      food: leadingNumber[2].replace(/^(of|a|an|the)\s+/i, "").trim(),
      qty: readQuantity(leadingNumber[1]),
      unit: "serving"
    };
  }

  working = working.replace(/^(of|a|an|the)\s+/i, "").trim();
  const food = working.replace(/\s+/g, " ").trim();
  if (food.length < 2) return undefined;

  return { food, qty: 1, unit: "serving" };
}

function readQuantity(token: string): number {
  const word = token.toLowerCase();
  const fromWord = numberWords[word];
  if (fromWord) return fromWord;
  const numeric = Number(token);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
}
