export type MacroTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type FoodLogItem = {
  food: string;
  qty?: number;
  unit?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
};

export type SpotPipelineResult = {
  logged_items: FoodLogItem[];
  totals: MacroTotals;
  remaining: MacroTotals;
  suggestions: string[];
  nudge: string;
  confidence: number;
  clarifying_question?: string;
  source: "rocketride" | "fallback";
  strava_burn?: number;
  strava_note?: string;
};

export type PipelineTurn = {
  kind: "text" | "image" | "voice" | "unsupported";
  text: string;
  userId: string;
  threadId: string;
  platform?: string;
  attachmentName?: string;
  mimeType?: string;
};
