import "./env.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Question, RocketRideClient } from "rocketride";
import { enrichWithUsdaAndState } from "./enrich.js";
import { estimateTextLog } from "./local-estimator.js";
import { fallbackResult, normalizePipelineResult } from "./macros.js";
import type { PipelineTurn, SpotPipelineResult } from "./types.js";

let clientPromise: Promise<RocketRideClient> | undefined;
let tokenPromise: Promise<string> | undefined;

export async function runPipeline(turn: PipelineTurn): Promise<SpotPipelineResult> {
  if (turn.kind !== "text") {
    return fallbackResult("Photo and voice handling are queued for the multimodal RocketRide spike.");
  }

  if (!turn.text) {
    return fallbackResult("I need a little food detail before I can log macros.");
  }

  try {
    const client = await getClient();
    const token = await getToken(client);
    const question = buildNutritionQuestion(turn);
    const raw = await client.chat({ token, question });
    const parsed = normalizePipelineResult(raw);
    return enrichWithUsdaAndState(parsed, turn.userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown RocketRide error";
    console.warn(`RocketRide unavailable; using local estimator. ${message}`);
    const estimated = await estimateTextLog(turn.text, message);
    return enrichWithUsdaAndState(estimated, turn.userId);
  }
}

export function resolvePipelinePath(): string {
  return resolve(process.cwd(), process.env.SPOT_PIPELINE_PATH ?? "../../pipelines/spot.pipe");
}

function getClient(): Promise<RocketRideClient> {
  clientPromise ??= (async () => {
    const client = new RocketRideClient();
    await client.connect();
    return client;
  })();
  return clientPromise;
}

function getToken(client: RocketRideClient): Promise<string> {
  tokenPromise ??= (async () => {
    const filepath = resolvePipelinePath();
    if (!existsSync(filepath)) {
      throw new Error(`Missing RocketRide pipeline at ${filepath}`);
    }
    const result = await client.use({ filepath, useExisting: true });
    return result.token;
  })();
  return tokenPromise;
}

function buildNutritionQuestion(turn: PipelineTurn): Question {
  const question = new Question({ expectJson: true });
  question.addGoal("Parse the user's food log into structured items only. Do NOT estimate calories or macros.");
  question.addInstruction(
    "Schema",
    "Return JSON with logged_items (food, qty, unit only — no macro fields), suggestions, nudge, confidence, and optional clarifying_question. Omit totals and remaining; the agent fetches macros from USDA FoodData Central in real time."
  );
  question.addInstruction(
    "Parsing",
    "Use common USDA-searchable food names (e.g. 'eggs', 'oatmeal', 'chicken breast'). If quantity is ambiguous, use a common serving and add clarifying_question."
  );
  question.addExample("2 eggs and a cup of oatmeal", {
    logged_items: [
      { food: "eggs", qty: 2, unit: "large" },
      { food: "oatmeal", qty: 1, unit: "cup cooked" }
    ],
    suggestions: ["Add Greek yogurt or chicken later to close the protein gap."],
    nudge: "Good base. Protein is still the main thing to chase today.",
    confidence: 0.78
  });
  question.addContext({
    user_id: turn.userId,
    thread_id: turn.threadId,
    platform: turn.platform,
    daily_target: {
      calories: Number(process.env.SPOT_DAILY_CALORIES ?? 2200),
      protein: Number(process.env.SPOT_DAILY_PROTEIN ?? 150),
      carbs: Number(process.env.SPOT_DAILY_CARBS ?? 220),
      fat: Number(process.env.SPOT_DAILY_FAT ?? 70)
    }
  });
  question.addQuestion(turn.text);
  return question;
}
