import "./env.js";
import { existsSync } from "node:fs";
import { resolvePipelinePath } from "./pipeline.js";

const required = ["ROCKETRIDE_URI", "ROCKETRIDE_APIKEY", "ROCKETRIDE_GEMINI_APIKEY"];
const missing = required.filter((key) => !process.env[key]);
const photonReady = Boolean(process.env.PHOTON_PROJECT_ID && process.env.PHOTON_PROJECT_SECRET);
const pipelinePath = resolvePipelinePath();

console.log(
  JSON.stringify(
    {
      ok: missing.length === 0 && existsSync(pipelinePath),
      missing,
      photonReady,
      pipelinePath,
      pipelineExists: existsSync(pipelinePath)
    },
    null,
    2
  )
);
