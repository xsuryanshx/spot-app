import type { FoodLogItem, MacroTotals, SpotPipelineResult } from "./types.js";

export const DEFAULT_DAILY_TARGET: MacroTotals = {
  calories: Number(process.env.SPOT_DAILY_CALORIES ?? 2200),
  protein: Number(process.env.SPOT_DAILY_PROTEIN ?? 150),
  carbs: Number(process.env.SPOT_DAILY_CARBS ?? 220),
  fat: Number(process.env.SPOT_DAILY_FAT ?? 70)
};

const macroKeys = ["calories", "protein", "carbs", "fat"] as const;

export function roundMacro(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}

export function computeTotals(items: FoodLogItem[]): MacroTotals {
  return items.reduce<MacroTotals>(
    (totals, item) => ({
      calories: totals.calories + roundMacro(item.calories),
      protein: totals.protein + roundMacro(item.protein),
      carbs: totals.carbs + roundMacro(item.carbs),
      fat: totals.fat + roundMacro(item.fat)
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

export function computeRemaining(totals: MacroTotals, target = DEFAULT_DAILY_TARGET): MacroTotals {
  return {
    calories: target.calories - totals.calories,
    protein: target.protein - totals.protein,
    carbs: target.carbs - totals.carbs,
    fat: target.fat - totals.fat
  };
}

export function parseJsonish(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced?.[1] ?? trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    }
    throw new Error("Pipeline response was not valid JSON");
  }
}

export function normalizePipelineResult(raw: unknown, target = DEFAULT_DAILY_TARGET): SpotPipelineResult {
  const firstAnswer = extractFirstAnswer(raw);
  const parsed = parseJsonish(firstAnswer) as Partial<SpotPipelineResult> & {
    items?: FoodLogItem[];
    loggedItems?: FoodLogItem[];
  };

  const loggedItems = parsed.logged_items ?? parsed.items ?? parsed.loggedItems ?? [];
  const totals = normalizeTotals(parsed.totals ?? computeTotals(loggedItems));
  const remaining = normalizeTotals(parsed.remaining ?? computeRemaining(totals, target));

  return {
    logged_items: loggedItems,
    totals,
    remaining,
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String).slice(0, 3) : [],
    nudge: typeof parsed.nudge === "string" ? parsed.nudge : buildDefaultNudge(remaining),
    confidence: clampConfidence(parsed.confidence),
    clarifying_question:
      typeof parsed.clarifying_question === "string" ? parsed.clarifying_question : undefined,
    source: "rocketride"
  };
}

export function fallbackResult(message: string): SpotPipelineResult {
  return {
    logged_items: [],
    totals: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    remaining: { ...DEFAULT_DAILY_TARGET },
    suggestions: [],
    nudge: message,
    confidence: 0,
    source: "fallback",
    clarifying_question: "Send a plain text food log like '2 eggs and oatmeal' and I can total it."
  };
}

function extractFirstAnswer(raw: unknown): unknown {
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    const resultTypes = record.result_types as Record<string, string> | undefined;
    const answerKey = resultTypes
      ? Object.entries(resultTypes).find(([, type]) => type === "answers")?.[0]
      : undefined;
    const value = (answerKey && record[answerKey]) ?? record.spot ?? record.answers ?? raw;

    if (Array.isArray(value)) return value[0] ?? {};
    return value;
  }
  return raw;
}

function normalizeTotals(value: unknown): MacroTotals {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return macroKeys.reduce<MacroTotals>(
    (totals, key) => ({ ...totals, [key]: roundMacro(record[key]) }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

function clampConfidence(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value ?? 0.5);
  if (!Number.isFinite(numeric)) return 0.5;
  return Math.max(0, Math.min(1, numeric));
}

function buildDefaultNudge(remaining: MacroTotals): string {
  if (remaining.protein > 40) return "Protein is the lever now. Aim for a lean, high-protein next bite.";
  if (remaining.calories < 0) return "You are over target, so keep the next move light and protein-forward.";
  return "Logged. Keep the next meal balanced and boringly effective.";
}
