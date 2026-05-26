# Spot

Spot is an iMessage-native nutrition coach: log food by text (and eventually photo or voice), get macro totals, daily remaining budget, and actionable suggestions. Built for [HackWithSeattle](https://hackwithseattle.com) using **Photon Spectrum** (messaging) and **RocketRide** (AI pipelines).

## How it works

```
User (iMessage or terminal)
        │
        ▼
┌─────────────────────────┐
│  Spectrum agent (TS)    │  apps/agent/src/index.ts
│  spectrum-ts            │  - receives messages
└───────────┬─────────────┘  - builds a pipeline turn
            │ runPipeline()
            ▼
┌─────────────────────────┐
│  RocketRide pipeline    │  pipelines/spot.pipe
│  (Gemini 2.5 Flash)     │  - structured nutrition JSON
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  Macro card reply       │  apps/agent/src/renderers.ts
└─────────────────────────┘
```

The Spectrum layer stays thin: it routes messages, calls RocketRide once per turn, and formats the reply. Macro math, JSON normalization, and a local food estimator live in TypeScript (`apps/agent/src/`). If RocketRide is down, text logs still work via the built-in fallback estimator.

**Current scope:** text food logs with USDA grounding and **Strava workout credit**. Images and voice notes receive a friendly “coming soon” message until the multimodal pipeline spike lands.

## Prerequisites

| Requirement | Notes |
|-------------|--------|
| **Node.js 20+** | 20.18.1+ recommended (some dependencies warn on older 20.x). |
| **RocketRide runtime** | Local server on port **5565** (VS Code extension) or [RocketRide Cloud](https://cloud.rocketride.ai). |
| **Gemini API key** | Used by `pipelines/spot.pipe` (`ROCKETRIDE_GEMINI_APIKEY`). |
| **RocketRide API key** | `ROCKETRIDE_APIKEY` from your RocketRide deployment. |
| **Photon Spectrum** (optional) | Only needed for real iMessage. Sign up at [app.photon.codes](https://app.photon.codes). Terminal mode works without it. |

Install the [RocketRide VS Code extension](https://marketplace.visualstudio.com/items?itemName=RocketRide.rocketride) and start a **local** server (default `http://localhost:5565`). Docs: [docs.rocketride.org](https://docs.rocketride.org).

## Quick start (terminal — no iMessage)

Best way to try Spot locally without Photon credentials.

### 1. Clone and configure environment

```bash
cd spot-app
cp .env.example .env
```

Edit `.env` at the **repo root** and set at minimum:

```env
ROCKETRIDE_URI=http://localhost:5565
ROCKETRIDE_APIKEY=your_rocketride_api_key
ROCKETRIDE_GEMINI_APIKEY=your_gemini_api_key
SPOT_ENABLE_TERMINAL=1
```

Optional daily macro targets (defaults shown in `.env.example`):

- `SPOT_DAILY_CALORIES`, `SPOT_DAILY_PROTEIN`, `SPOT_DAILY_CARBS`, `SPOT_DAILY_FAT`

### 2. Install agent dependencies

```bash
cd apps/agent
npm install
```

### 3. Start RocketRide (separate terminal)

Use the RocketRide VS Code extension: open `pipelines/spot.pipe`, deploy/start the local server, and confirm it listens on **5565**.

Alternatively, point `ROCKETRIDE_URI` at RocketRide Cloud and use a cloud API key.

### 4. Preflight check

```bash
npm run check
```

Expect `"ok": true`, `"pipelineExists": true`, and no `missing` env keys. If RocketRide is not running, `ok` may still be true for env/pipeline file checks, but `npm run dev` will fall back to the local estimator when chat fails.

### 5. Run the agent

```bash
npm run dev
```

In the **terminal provider** session, send a text message such as:

```text
2 eggs and a cup of oatmeal
```

You should get a macro card with logged items, meal totals, remaining daily budget, and a nudge.

## Full setup (iMessage via Spectrum Cloud)

1. Complete the quick start steps above (RocketRide + `.env` keys).
2. Add Photon credentials to `.env`:

   ```env
   PHOTON_PROJECT_ID=...
   PHOTON_PROJECT_SECRET=...
   PHOTON_ACCOUNT_ID=...   # optional: ignore messages from your own account
   ```

3. Configure iMessage in the [Photon console](https://app.photon.codes) and link your agent number.
4. Run `npm run dev` from `apps/agent/`.
5. Text your Spot number from your phone; replies use the same macro card format as terminal mode.

When both Photon and `SPOT_ENABLE_TERMINAL=1` are set, **both** iMessage and terminal providers are enabled.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ROCKETRIDE_URI` | Yes | RocketRide server URL (default `http://localhost:5565`). |
| `ROCKETRIDE_APIKEY` | Yes | RocketRide authentication. |
| `ROCKETRIDE_GEMINI_APIKEY` | Yes | Gemini key for the pipeline LLM node. |
| `PHOTON_PROJECT_ID` | For iMessage | Spectrum Cloud project ID. |
| `PHOTON_PROJECT_SECRET` | For iMessage | Spectrum Cloud project secret. |
| `PHOTON_ACCOUNT_ID` | No | Skip messages sent by this account (avoid echo loops). |
| `SPOT_PIPELINE_PATH` | No | Path to `.pipe` file (default `../../pipelines/spot.pipe` from `apps/agent`). |
| `SPOT_ENABLE_TERMINAL` | No | Set to `1` to enable terminal provider (auto-enabled if Photon is unset). |
| `SPOT_DAILY_*` | No | Daily calorie/protein/carbs/fat targets. |

The agent loads `.env` from the repo root (`../../.env` relative to `apps/agent`) and from the current working directory.

## Strava integration

Connect Strava so today's workout calories are **added to your daily calorie budget** (remaining macros use the higher target).

### Setup

1. Create an app at [Strava API settings](https://www.strava.com/settings/api).
2. Set **Authorization Callback Domain** to `localhost` (local dev).
3. Add to `.env`:

   ```env
   STRAVA_CLIENT_ID=your_client_id
   STRAVA_CLIENT_SECRET=your_client_secret
   STRAVA_REDIRECT_URI=http://localhost:8787/strava/callback
   SPOT_STRAVA_CALLBACK=1
   ```

4. Restart the agent (`npm run dev`). You should see: `Strava OAuth callback listening on http://localhost:8787/...`

### Commands (text Spot in iMessage or terminal)

| Message | Action |
|---------|--------|
| `strava connect` | Get OAuth link to authorize |
| `strava status` | Connection + burn + remaining calories |
| `strava disconnect` | Remove Strava link |
| `strava code AUTH_CODE` | Manual OAuth if the browser callback did not run |
| `strava sync` | Optional force-refresh (not required day-to-day) |

After you authorize once, **workouts sync automatically** on every message (throttled to every 5 minutes by default). Log food as usual — macro cards show `Strava credit: +520 cal` when a workout is applied.

**Demo without Strava API:** set `SPOT_DEMO_MODE=1`, then `strava connect` + `strava sync` uses canned run fixtures.

## Scripts (`apps/agent`)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Spectrum agent (`tsx src/index.ts`). |
| `npm run check` | JSON preflight: env vars, pipeline path, Photon readiness. |
| `npm test` | Run Vitest unit tests (macro math, renderers, payload, local estimator). |
| `npm run test:watch` | Vitest in watch mode. |
| `npm run build` | Typecheck with `tsc --noEmit`. |

From the repo root, run tests with:

```bash
cd apps/agent && npm test
```

## Project layout

```
spot-app/
├── README.md                 # This file
├── PLAN.md                   # Hackathon implementation plan
├── CLAUDE.md                 # Contributor conventions (testing, architecture)
├── .env.example              # Environment template (copy to .env)
├── pipelines/
│   └── spot.pipe             # RocketRide pipeline (chat → prompt → Gemini → JSON)
└── apps/agent/
    ├── package.json
    ├── src/
    │   ├── index.ts          # Spectrum entrypoint
    │   ├── pipeline.ts       # RocketRide client + chat API
    │   ├── payload.ts        # Message → pipeline turn
    │   ├── macros.ts         # JSON parse, totals, remaining
    │   ├── renderers.ts      # iMessage/terminal macro card text
    │   ├── local-estimator.ts# Fallback when RocketRide is unavailable
    │   ├── usda.ts           # USDA FDC real-time macro lookup
    │   ├── strava.ts         # Strava OAuth + activity burn
    │   ├── strava-handlers.ts# strava connect/sync commands
    │   └── check.ts          # Preflight script
    └── test/                 # Vitest unit tests
```

## RocketRide pipeline

`pipelines/spot.pipe` is a minimal chat pipeline:

1. **chat_in** — receives the user question from the SDK `client.chat()` API.
2. **nutrition_prompt** — Spot system instructions and JSON schema.
3. **gemini_parse** — `llm_gemini` (Gemini 2.5 Flash).
4. **response** — returns answers on lane `spot`.

The TypeScript agent loads this file once at startup with `useExisting: true` and reuses the session token for each message.

## Troubleshooting

| Symptom | What to try |
|---------|-------------|
| `RocketRide unavailable; using local estimator` | Start RocketRide on `:5565`, verify `ROCKETRIDE_APIKEY`, run `npm run check`. |
| `Missing RocketRide pipeline at ...` | Run commands from `apps/agent/` or set `SPOT_PIPELINE_PATH` to an absolute path to `pipelines/spot.pipe`. |
| Photo/voice only get a short fallback | Expected today; multimodal nodes are planned in `PLAN.md`. |
| No iMessage replies | Confirm `PHOTON_PROJECT_ID` / `PHOTON_PROJECT_SECRET`, Photon console agent status, and that `PHOTON_ACCOUNT_ID` is not filtering your messages. |
| Tests fail after clone | `cd apps/agent && npm install && npm test`. |

## Development notes

- **Testing:** Pure TypeScript logic is covered by Vitest; pipeline and Spectrum I/O are not integration-tested (see `CLAUDE.md`).
- **Architecture:** Keep heavy AI in `pipelines/spot.pipe`; extend `macros.ts`, `renderers.ts`, and future modules in `apps/agent/src/` for app-side logic.
- **Roadmap:** Google Places suggestions and group accountability are documented in `PLAN.md`.

## Deployment

Spot splits across **RocketRide** (pipeline) and a **Node host** (agent). You cannot run the full iMessage bot on RocketRide alone.

See **[DEPLOY.md](DEPLOY.md)** for RocketRide Cloud, Docker, Fly.io, and production Strava callback setup.

## Links

- [RocketRide documentation](https://docs.rocketride.org)
- [RocketRide GitHub](https://github.com/rocketride-org/rocketride-server)
- [Spectrum (Photon) documentation](https://docs.photon.codes)
- [Spectrum Cloud signup](https://app.photon.codes)
