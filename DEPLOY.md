# Deploying Spot

Spot is **two services**, not one monolith. RocketRide does not host the full app.

## What runs where

| Component | What it is | Where to deploy |
|-----------|------------|-----------------|
| **`pipelines/spot.pipe`** | Gemini food-parsing pipeline | **RocketRide** (local, Docker, or [RocketRide Cloud](https://cloud.rocketride.ai)) |
| **`apps/agent/`** | Node process: Spectrum iMessage, USDA, Strava, state | **Your host** (Fly.io, Railway, Render, VPS, or always-on laptop) |
| **Photon Spectrum** | iMessage transport | Already cloud — [app.photon.codes](https://app.photon.codes) |

```
Phone (iMessage)
      │
      ▼
Photon Spectrum Cloud  ──websocket──►  Spot agent (Node, 24/7)
                                              │
                                              ├──► USDA API
                                              ├──► Strava API
                                              └──► RocketRide Cloud (spot.pipe)
```

### Can the whole app live on RocketRide?

**No.** RocketRide runs **AI pipelines** (`.pipe` files). It does not run a long-lived Spectrum/iMessage bot.

You **should** deploy the pipeline to RocketRide (Cloud or self-hosted). You **must** deploy the agent somewhere else that can:

- Stay online 24/7
- Hold your Photon, USDA, Strava, and RocketRide secrets
- Expose HTTPS for Strava OAuth in production (`/strava/callback`)

---

## Step 1 — RocketRide (pipeline only)

### Option A: RocketRide Cloud (recommended for deploy)

1. Sign in at [cloud.rocketride.ai](https://cloud.rocketride.ai) (or your team’s RocketRide Cloud URL).
2. Open the VS Code RocketRide extension → deploy/upload `pipelines/spot.pipe`.
3. Copy the **cloud API key** and **URI** from the dashboard.

In production `.env`:

```env
ROCKETRIDE_URI=https://cloud.rocketride.ai
ROCKETRIDE_APIKEY=your_cloud_api_key
ROCKETRIDE_GEMINI_APIKEY=your_gemini_key
SPOT_SKIP_ROCKETRIDE=0
```

The agent loads the same `spot.pipe` via `client.use({ filepath })` — the SDK uploads or uses the file against the cloud runtime (verify in extension that the pipeline is registered to your cloud project).

### Option B: Self-hosted RocketRide (Docker)

Clone [rocketride-server](https://github.com/rocketride-org/rocketride-server), run the engine container, point:

```env
ROCKETRIDE_URI=http://your-rocketride-host:5565
```

---

## Step 2 — Deploy the Spectrum agent

The agent is a single Node 20 process. It does **not** need RocketRide installed on the same machine — only network access to `ROCKETRIDE_URI`.

### Required secrets (production)

| Variable | Purpose |
|----------|---------|
| `PHOTON_PROJECT_ID` / `PHOTON_PROJECT_SECRET` | iMessage |
| `ROCKETRIDE_URI` / `ROCKETRIDE_APIKEY` / `ROCKETRIDE_GEMINI_APIKEY` | Food parsing |
| `USDA_FDC_API_KEY` | Macro grounding |
| `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` | Workout credit |
| `STRAVA_REDIRECT_URI` | Public HTTPS callback (see below) |

Optional:

```env
SPOT_SKIP_ROCKETRIDE=1          # USDA-only parsing (no RocketRide)
SPOT_STRAVA_SYNC_INTERVAL_MS=300000
SPOT_STATE_PATH=/data/.spot-state.json
```

### Docker (from repo root)

```bash
docker build -t spot-agent .
docker run --env-file .env -v spot-state:/data spot-agent
```

### Fly.io (example)

```bash
fly launch --no-deploy
fly secrets import < .env
fly deploy
```

Set in `fly.toml` (or Fly dashboard):

- `PORT=8080`
- `STRAVA_REDIRECT_URI=https://YOUR_APP.fly.dev/strava/callback`
- `SPOT_STRAVA_CALLBACK=1` (optional; HTTPS redirect auto-starts callback server)

Strava app settings:

| Field | Value |
|-------|--------|
| **Authorization Callback Domain** | `YOUR_APP.fly.dev` |
| **Website** | `https://YOUR_APP.fly.dev` |

Health check: `GET /health`

### Railway / Render

- **Root directory:** `apps/agent` or use repo-root Dockerfile
- **Start command:** `npm start`
- **Health check:** `/health` on assigned `PORT`
- Mount a **volume** for `SPOT_STATE_PATH` so daily logs survive restarts

---

## Step 3 — Strava OAuth in production

Local dev uses `localhost:8787`. Production needs a **public HTTPS** URL:

```env
STRAVA_REDIRECT_URI=https://your-agent-host/strava/callback
```

The agent starts an HTTP server on `PORT` (Fly/Railway set this automatically) with:

- `GET /strava/callback` — OAuth return
- `GET /health` — load balancer health

Users still send `strava connect` in iMessage; the link opens Strava; redirect hits your deployed host.

---

## Step 4 — Verify

```bash
cd apps/agent
npm run check
```

Deploy logs should show:

```text
Spot agent listening on N Spectrum provider(s).
Strava OAuth callback listening on https://...  (if Strava configured)
```

Text your Spot number:

1. `strava connect` → authorize
2. `2 eggs and oatmeal` → macro card with USDA + remaining (including Strava burn if linked)

---

## Minimal production `.env` template

```env
# Photon (iMessage)
PHOTON_PROJECT_ID=
PHOTON_PROJECT_SECRET=

# RocketRide Cloud (pipeline)
ROCKETRIDE_URI=https://cloud.rocketride.ai
ROCKETRIDE_APIKEY=
ROCKETRIDE_GEMINI_APIKEY=

# USDA + Strava
USDA_FDC_API_KEY=
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_REDIRECT_URI=https://YOUR_HOST/strava/callback

# Agent
SPOT_PIPELINE_PATH=../../pipelines/spot.pipe
SPOT_STATE_PATH=/data/.spot-state.json
SPOT_TIMEZONE=America/Los_Angeles
PORT=8080
```

---

## Hackathon / demo shortcut

Keep the agent on your laptop (`npm run dev`) with Photon + RocketRide local, and only move to cloud when judging requires it. For demos without RocketRide:

```env
SPOT_SKIP_ROCKETRIDE=1
```

USDA + Strava still work; Gemini parsing is skipped for a simpler offline path.
