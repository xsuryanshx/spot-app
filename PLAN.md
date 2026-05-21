# Spot — Implementation Plan (HackWithSeattle, 2026-05-21 → 2026-05-23)

## Context

Spot is an iMessage-native nutrition coach built for HackWithSeattle. The mandatory tools are **RocketRide** (AI pipeline) and **Photon Spectrum** (messaging), and the team is targeting the main prize plus the **Photon iMessage Prize ($500)**. The product wins on four wedges over Cal AI / MyFitnessPal: it's a contact not an app, it's group-accountable, it grounds macros against USDA (not LLM-guessed), and it's prescriptive about what to eat next.

The PRD is locked. This plan covers **how to build it in ~48 hours** so we are always demoable at every checkpoint. Anything past Step 3 is already a complete, winnable submission.

## Resolved decisions (from user)

| Question | Decision |
|---|---|
| iMessage transport | **Spectrum Cloud Pro ($25/mo)** — team already has the plan |
| F1 group accountability | **Stretch only** — DM-first MVP, group surface deferred |
| Vision provider | **Gemini** — via `llm_gemini` (multimodal) with `image_vision_mistral` as documented fallback |
| Test scope | **Unit tests on logic only** (Vitest) — no e2e on RocketRide/iMessage |

## Architecture

```
iMessage user/group
       │
       ▼
┌──────────────────────────┐
│  Spectrum agent (TS)     │  apps/agent/src/index.ts
│  spectrum-ts + imessage  │  - routes incoming text/image/voice
│  provider (cloud Pro)    │  - serializes to webhook payload
└──────────┬───────────────┘
           │ RocketRideClient.send(token, payload)
           ▼
┌──────────────────────────┐
│  RocketRide pipeline     │  pipelines/spot.pipe
│  (.pipe JSON, self-host) │  - vision/audio/text branch
│  http://localhost:5565   │  - USDA grounding via tool_http_request
│                          │  - memory_internal for daily state
│                          │  - synthesis LLM returns JSON
└──────────┬───────────────┘
           │ result_types → JSON
           ▼
┌──────────────────────────┐
│  Spectrum agent renders  │
│  → space.send(macro card)│
└──────────────────────────┘

External: USDA FDC (free), Strava OAuth, Google Places, Walmart deep link (stretch)
```

**The seam:** Spectrum handler calls RocketRide via the TS SDK (`new RocketRideClient()` reads `.env`, then `client.connect()` + `client.use({filepath:'pipelines/spot.pipe', useExisting:true})` once at startup, then `client.send(token, payload)` per message). All heavy AI logic lives in RocketRide so the "deep integration" criterion is unambiguous.

## Repo layout

```
spot-cal-app/
├── CLAUDE.md                          ← created Step 0 (testing requirement docs)
├── .env                               ← extend with all API keys
├── .rocketride/                       ← already scaffolded (docs + schemas)
├── pipelines/
│   └── spot.pipe                      ← single multimodal pipeline file
├── apps/
│   └── agent/
│       ├── package.json               ← spectrum-ts, rocketride, vitest
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       └── src/
│           ├── index.ts               ← Spectrum entrypoint
│           ├── pipeline.ts            ← RocketRide client wrapper
│           ├── renderers.ts           ← macro card formatting
│           ├── strava.ts              ← OAuth + activity fetch
│           ├── places.ts              ← nearby food lookup
│           ├── state.ts               ← user goals + daily totals
│           ├── recommend.ts           ← prescriptive logic
│           └── usda.ts                ← USDA FDC client (used as fallback + tests)
└── apps/agent/test/
    ├── usda.test.ts
    ├── macros.test.ts
    ├── recommend.test.ts
    ├── strava.test.ts
    ├── state.test.ts
    └── renderers.test.ts
```

## RocketRide pipeline detail (pipelines/spot.pipe)

Verified against `.rocketride/schema/*.json`. Node IDs and lane wiring:

| id | provider | input lane | output lane | purpose |
|---|---|---|---|---|
| `webhook_in` | `webhook` | — | `text` / `image` / `audio` | entrypoint, payload contains `user_id`, `thread_id`, `type`, `location?` |
| `vision_gemini` | `llm_gemini` | `questions` (multimodal) | `answers` | identify foods + portions from image; **Day-0 spike confirms multimodal works** |
| `vision_fallback` | `image_vision_mistral` | `image` | `text` | only wired if Gemini multimodal spike fails |
| `transcribe` | `audio_transcribe` | `audio` | `text` | voice notes → text |
| `parse_items` | `llm_anthropic` (claude-sonnet-4-6) | `questions` | `answers` | structured `[{food, qty, unit}]` JSON |
| `usda_lookup` | `tool_http_request` | — | — | whitelist `^https://api\.nal\.usda\.gov/fdc/v1/.*`; called by agent per item |
| `compute_totals` | `tool_python` | — | — | allowedModules: none beyond builtins; computes meal totals + remaining vs target |
| `state` | `memory_internal` | — | — | keyed by `user_id`; stores goals + daily log + Strava burn |
| `places_search` | `tool_http_request` | — | — | whitelist Google Places; called when location present |
| `agent` | `agent_rocketride` | — | — | orchestrates `usda_lookup`, `compute_totals`, `state`, `places_search` (only `agent_rocketride` supports `memory_internal`) |
| `synthesize` | `llm_anthropic` | `questions` | `answers` | returns JSON `{logged_items, totals, remaining, suggestions[], nudge, confidence, clarifying_question?}` |
| `response` | `response_text` | `text` | — | `laneName: "spot"` |

**Critical from `.rocketride/docs/ROCKETRIDE_COMMON_MISTAKES.md`:**
- Use `useExisting: true` on `client.use()` so we don't re-spawn the pipeline per message.
- Read `result_types` to find the actual response key (we set `laneName: "spot"`, so it's `result.spot`, not `result.text`).
- Never block the event loop in the agent (no sync I/O in Node handlers).
- Lane types must match — `image`→`questions` doesn't work directly; verify Gemini multimodal in the Day-0 spike.

## Spectrum agent skeleton (apps/agent/src/index.ts)

```ts
import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { runPipeline } from "./pipeline";
import { renderMacroCard } from "./renderers";

const app = await Spectrum({
  projectId: process.env.PHOTON_PROJECT_ID!,
  projectSecret: process.env.PHOTON_PROJECT_SECRET!,
  providers: [imessage.config()],
});

for await (const [space, message] of app.messages) {
  const userId = space.id;
  const payload = await toPipelinePayload(message, userId);
  const result = await runPipeline(payload);
  await space.send(renderMacroCard(result));
}
```

`runPipeline` initializes the `RocketRideClient` once at module load (singleton), calls `use({filepath:"pipelines/spot.pipe", useExisting:true})`, caches the token, and exposes a `send(payload)` function.

## Testing requirements (user-mandated)

**Stack:** Vitest. Co-located test files in `apps/agent/test/`. Run with `npm test` and `npm run test:watch`.

**Rule of thumb (added to CLAUDE.md):** every new feature lands with a unit test of its pure logic in the same PR/commit. The RocketRide pipeline and Spectrum I/O are out of scope for tests (too slow, too brittle for a 2-day build); we test the **TypeScript logic** that runs around them.

Test coverage per feature:

| Feature | Test file | What it covers |
|---|---|---|
| F4 multimodal logging | `macros.test.ts`, `usda.test.ts` | parsing structured food JSON, summing macros, USDA FDC client returns expected fields for canned fixtures |
| F3 prescriptive | `recommend.test.ts` | given (remaining, time-of-day, recent-activity, nearby-options), suggestion picks the macro-fitting option |
| F2 Strava | `strava.test.ts` | activity burn → net target math; OAuth token refresh logic |
| F5 time-context | `recommend.test.ts` | breakfast vs post-workout vs late-dinner branches |
| State | `state.test.ts` | per-user goals + daily totals round-trip, day rollover at user's timezone |
| Rendering | `renderers.test.ts` | macro card formatting for the iMessage reply |

**Fixtures:** Bundle 5 canned USDA responses, 3 canned Strava activities, and 5 sample parsed-food JSONs under `apps/agent/test/fixtures/` so tests are deterministic and don't hit live APIs.

## CLAUDE.md content (to write in Step 0, can't write while in plan mode)

```md
# Spot — Claude working agreement

## Testing policy (non-negotiable)
- Every new feature ships with a Vitest unit test for its pure logic in the same change.
- Test the TypeScript logic around the pipeline (parsing, math, recommend, state, renderers, Strava).
- Do NOT write e2e tests against RocketRide or Spectrum — too brittle for the hackathon timeline. Use fixtures.
- Run `npm test` before declaring any feature done.

## Architecture invariants
- Heavy AI logic lives in `pipelines/spot.pipe` (RocketRide). The Spectrum agent is a thin I/O layer.
- One RocketRide pipeline, started once at agent boot with `useExisting: true`. Never re-`use()` per message.
- Read `result_types` from the pipeline response — our output `laneName` is `"spot"`.
- Never block the Node event loop in the Spectrum handler.

## Demo safety
- Pre-cache demo foods and a canned Strava activity. Never depend on a live external API in the demo path.
- Keep a recorded fallback video.
```

## Implementation milestones (timed checkpoints)

Each step ends in a demoable state. Steps 0–3 = winnable submission floor.

| # | Deliverable | Target | Test gate |
|---|---|---|---|
| 0 | Write `CLAUDE.md`, scaffold `apps/agent/` with `package.json`, `tsconfig.json`, `vitest.config.ts`. Add Photon + USDA + Strava + Gemini keys to `.env`. | first 30 min | `npm test` passes (no tests yet, exits 0) |
| 1 | Spectrum iMessage echo bot — DM-only, reply with `"echo: <text>"`. De-risks the Photon prize. | +60 min | Manual: text yourself, get echo back |
| 2 | Minimal `spot.pipe`: `webhook_in → parse_items (text only) → response`. Wire TS SDK call. | +90 min | `macros.test.ts` covers parse-result → totals math |
| 3 | Add `vision_gemini` (Day-0 multimodal spike); plate photo → macro JSON → iMessage macro card. **Submission-complete from here on.** | +90 min | `renderers.test.ts` covers macro card formatting |
| 4 | USDA grounding (`usda_lookup` + `compute_totals` + `state`/memory) → "remaining vs target". | +90 min | `usda.test.ts`, `state.test.ts` |
| 5 | F3 + F5: Places search + time-context recommendation. | Day 2 AM | `recommend.test.ts` |
| 6 | F2 Strava: OAuth, activity fetch, net target adjustment. | Day 2 PM | `strava.test.ts` |
| 7 | F1 group accountability (DM fan-out crew, leaderboard) — stretch, deferred from MVP per user. | Day 2 PM / Day 3 AM | leaderboard math test |
| 8 | F6 Walmart cart deep link — stretch. | If time | — |
| 9 | Polish: typing indicator, pre-cached demo fixtures, 90-second demo rehearsal. | before demo | full `npm test` green |

## Verification (end-to-end demo)

1. `npm test` in `apps/agent/` → all unit tests green.
2. Start RocketRide locally on `:5565`; verify `pipelines/spot.pipe` loads.
3. From the Spectrum agent: `npm run dev`, log into Spectrum Cloud Pro console, confirm the agent's iMessage number is live.
4. From your phone, iMessage that number a clear plate photo → reply within ~3s with macros + remaining + suggestion.
5. Send a voice note ("two eggs and oatmeal") → same shape of reply.
6. Connect Strava (one-time OAuth deep link), log a run in the Strava app, send any message → remaining budget should reflect the burn.
7. With location enabled in the payload, Spot suggests a nearby specific order ("Chipotle, double chicken bowl hits your remaining 45g protein").
8. Run the 90-second demo script end-to-end twice without touching keyboard mid-run.

## Critical files / functions

- `.rocketride/docs/ROCKETRIDE_TYPESCRIPT_API.md` — `RocketRideClient`, `connect()`, `use({filepath, useExisting})`, `send(token, data)`, `result_types`.
- `.rocketride/docs/ROCKETRIDE_COMMON_MISTAKES.md` — five gotchas already incorporated above.
- `.rocketride/schema/webhook.json` — outputs `text|image|audio|video|tags`.
- `.rocketride/schema/llm_gemini.json` — `questions`/`answers` lanes; multimodal capability to be verified in Step 3 spike.
- `.rocketride/schema/audio_transcribe.json` — model defaults `base`; bump to `small` if accuracy poor.
- `.rocketride/schema/tool_http_request.json` — `urlWhitelist` for USDA + Places.
- `.rocketride/schema/memory_internal.json` — only `agent_rocketride` can drive it; route state through that node.

## Risks and mitigations (updated)

| Risk | Mitigation |
|---|---|
| Gemini multimodal lane mismatch in RocketRide | Day-0 spike in Step 3; documented fallback to `image_vision_mistral` (schema confirmed present) |
| Spectrum Pro group API gaps | F1 already deferred to stretch; MVP demo runs in DM |
| RocketRide pipeline re-`use()` errors | Singleton client in `pipeline.ts`, `useExisting: true` |
| Custom `laneName` breaks response parsing | Always read `result_types`; `laneName: "spot"` documented |
| Flaky external APIs mid-demo | Fixture cache for USDA + Strava; demo never hits live external for the golden path |
| Test suite slows iteration | Vitest only; no integration tests against pipeline/Spectrum |
