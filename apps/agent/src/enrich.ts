import { computeTotals } from "./macros.js";
import { userState } from "./state.js";
import { groundLoggedItems } from "./usda.js";
import type { FoodLogItem, SpotPipelineResult } from "./types.js";

export async function enrichWithUsdaAndState(
  result: SpotPipelineResult,
  userId: string,
  stravaNote?: string
): Promise<SpotPipelineResult> {
  if (result.logged_items.length === 0) {
    return withStravaContext(
      {
        ...result,
        remaining: userState.getRemaining(userId)
      },
      userId,
      stravaNote
    );
  }

  const parseOnly = stripLlmMacros(result.logged_items);
  const grounded = await groundLoggedItems(parseOnly);
  const ungrounded = grounded.filter((item) => !item.calories && !item.protein);
  const mealTotals = computeTotals(grounded);
  userState.recordMeal(userId, grounded);
  const remaining = userState.getRemaining(userId);

  return withStravaContext(
    {
      ...result,
      logged_items: grounded,
      totals: mealTotals,
      remaining,
      nudge: buildGroundingNudge(result.nudge, ungrounded),
      confidence: ungrounded.length ? Math.min(result.confidence, 0.55) : result.confidence,
      clarifying_question:
        ungrounded.length > 0
          ? `I could not find USDA data for: ${ungrounded.map((i) => i.food).join(", ")}. Can you be more specific?`
          : result.clarifying_question
    },
    userId,
    stravaNote
  );
}

function withStravaContext(
  result: SpotPipelineResult,
  userId: string,
  stravaNote?: string
): SpotPipelineResult {
  const burn = userState.getBurn(userId);
  if (burn <= 0 && !stravaNote) return result;
  return {
    ...result,
    strava_burn: burn,
    strava_note: stravaNote ?? (burn > 0 ? `Strava added +${burn} cal to your budget today.` : undefined)
  };
}

function stripLlmMacros(items: FoodLogItem[]): FoodLogItem[] {
  return items.map(({ food, qty, unit }) => ({ food, qty, unit }));
}

function buildGroundingNudge(base: string, ungrounded: FoodLogItem[]): string {
  if (ungrounded.length === 0) {
    return base.includes("USDA") ? base : `${base} Macros grounded on USDA FoodData Central.`;
  }
  return `${base} Some items were not found in USDA — macros may be incomplete.`;
}
