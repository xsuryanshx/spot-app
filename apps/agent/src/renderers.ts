import type { FoodLogItem, MacroTotals, SpotPipelineResult } from "./types.js";

export function renderMacroCard(result: SpotPipelineResult): string {
  if (result.clarifying_question && result.logged_items.length === 0) {
    return `Spot\n\n${result.nudge}\n\n${result.clarifying_question}`;
  }

  const items = result.logged_items.length
    ? result.logged_items.map(renderItem).join("\n")
    : "No foods logged yet.";
  const suggestions = result.suggestions.length
    ? `\n\nNext:\n${result.suggestions.map((suggestion) => `- ${suggestion}`).join("\n")}`
    : "";

  const stravaLine =
    result.strava_burn && result.strava_burn > 0
      ? `Strava credit: +${result.strava_burn} cal`
      : undefined;

  return [
    "Spot",
    "",
    "Logged:",
    items,
    "",
    `Meal: ${renderTotals(result.totals)}`,
    `Left today: ${renderTotals(result.remaining)}`,
    stravaLine,
    result.strava_note,
    "",
    result.nudge,
    suggestions
  ]
    .filter(Boolean)
    .join("\n");
}

function renderItem(item: FoodLogItem): string {
  const amount = item.qty && item.unit ? `${item.qty} ${item.unit} ` : "";
  const macros = renderTotals({
    calories: item.calories ?? 0,
    protein: item.protein ?? 0,
    carbs: item.carbs ?? 0,
    fat: item.fat ?? 0
  });
  return `- ${amount}${item.food}: ${macros}`;
}

function renderTotals(totals: MacroTotals): string {
  return `${totals.calories} cal, ${totals.protein}g P, ${totals.carbs}g C, ${totals.fat}g F`;
}
