import "./env.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Question, RocketRideClient } from "rocketride";
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
    return normalizePipelineResult(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown RocketRide error";
    console.warn(`RocketRide unavailable; using local estimator. ${message}`);
    return estimateTextLog(turn.text, message);
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
  question.addGoal("Return only structured nutrition JSON for the Spot iMessage coach.");
  question.addInstruction(
    "Schema",
    "Return JSON with logged_items, totals, remaining, suggestions, nudge, confidence, and optional clarifying_question. Macro keys are calories, protein, carbs, and fat."
  );
  question.addInstruction(
    "Grounding",
    "Estimate cautiously when USDA lookup is unavailable. If quantity is ambiguous, log the safest common serving and include a clarifying_question."
  );
  question.addExample("2 eggs and a cup of oatmeal", {
    logged_items: [
      { food: "eggs", qty: 2, unit: "large", calories: 140, protein: 12, carbs: 1, fat: 10 },
      { food: "oatmeal", qty: 1, unit: "cup cooked", calories: 154, protein: 6, carbs: 27, fat: 3 }
    ],
    totals: { calories: 294, protein: 18, carbs: 28, fat: 13 },
    remaining: { calories: 1906, protein: 132, carbs: 192, fat: 57 },
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
