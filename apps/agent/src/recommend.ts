import type { MacroTotals } from "./types.js";

export type PlaceOption = {
  name: string;
  suggestion: string;
  protein: number;
  calories: number;
};

export type RecommendContext = {
  remaining: MacroTotals;
  hour: number;
  hadRecentWorkout: boolean;
  nearby?: PlaceOption[];
};

export function buildRecommendations(context: RecommendContext): string[] {
  const picks: string[] = [];
  const { remaining, hour, hadRecentWorkout, nearby } = context;

  if (nearby?.length) {
    const best = [...nearby].sort((left, right) => right.protein - left.protein)[0];
    if (best) picks.push(`${best.name}: ${best.suggestion}`);
  }

  if (hadRecentWorkout && remaining.protein > 30) {
    picks.push("Post-workout window: prioritize 30-40g protein in the next meal.");
  } else if (hour < 11 && remaining.protein > 40) {
    picks.push("Breakfast move: Greek yogurt + fruit, or eggs with toast for steady protein.");
  } else if (hour >= 20 && remaining.calories < 600) {
    picks.push("Late dinner: keep it light — grilled fish or tofu with vegetables.");
  } else if (remaining.protein > 50) {
    picks.push("Protein is the gap: chicken bowl, tuna, or a double serving of Greek yogurt.");
  } else if (remaining.calories < 0) {
    picks.push("You are over calories today. Next plate: lean protein and high-volume vegetables.");
  } else {
    picks.push("Stay balanced: build the next meal around protein, then add carbs if you trained today.");
  }

  return picks.slice(0, 3);
}

export function hourInTimeZone(timeZone = process.env.SPOT_TIMEZONE ?? "UTC", reference = new Date()): number {
  const hour = Number(
    reference.toLocaleString("en-US", { timeZone, hour: "numeric", hour12: false })
  );
  return Number.isFinite(hour) ? hour : reference.getHours();
}
