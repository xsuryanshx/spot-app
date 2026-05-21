import { userState } from "./state.js";
import {
  buildStravaConnectUrl,
  computeTodayBurn,
  exchangeStravaCode,
  formatActivitySummary,
  isStravaConfigured,
  resolveAccessToken,
  type StravaActivity
} from "./strava.js";

export type StravaCommandResult = {
  handled: true;
  reply: string;
};

export type StravaPullResult = {
  burn: number;
  activity?: StravaActivity;
  changed: boolean;
  error?: string;
};

const DEFAULT_SYNC_INTERVAL_MS = 5 * 60 * 1000;

export function parseStravaCommand(text: string): string | undefined {
  const normalized = text.trim().toLowerCase();
  if (/^strava\s+code\s+\S+$/i.test(text)) return "code";
  if (/^(strava\s+)?(connect|link)(\s+strava)?$/i.test(normalized) || normalized === "connect strava") {
    return "connect";
  }
  if (/^(strava\s+)?(sync|refresh)(\s+strava)?$/i.test(normalized) || normalized === "sync strava") {
    return "sync";
  }
  if (/^(strava\s+)?(status|info)(\s+strava)?$/i.test(normalized) || normalized === "strava") {
    return "status";
  }
  if (/^(strava\s+)?(disconnect|unlink)(\s+strava)?$/i.test(normalized)) {
    return "disconnect";
  }
  return undefined;
}

export async function handleStravaCommand(
  userId: string,
  text: string
): Promise<StravaCommandResult | undefined> {
  const command = parseStravaCommand(text);
  if (!command) return undefined;

  if (!isStravaConfigured() && process.env.SPOT_DEMO_MODE !== "1") {
    return {
      handled: true,
      reply:
        "Strava is not configured. Add STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET to .env (see https://www.strava.com/settings/api)."
    };
  }

  switch (command) {
    case "connect":
      return { handled: true, reply: renderConnectMessage(userId) };
    case "code":
      return { handled: true, reply: await linkWithCode(userId, text) };
    case "sync":
      return { handled: true, reply: await formatSyncReply(userId, true) };
    case "status":
      await autoSyncStravaIfLinked(userId, true);
      return { handled: true, reply: renderStravaStatus(userId) };
    case "disconnect":
      userState.clearStrava(userId);
      return { handled: true, reply: "Strava disconnected. Your calorie target is back to the base daily goal." };
    default:
      return undefined;
  }
}

export async function completeStravaOAuth(userId: string, code: string): Promise<string> {
  const tokens = await exchangeStravaCode(code);
  if (!tokens) {
    return "Strava authorization failed. Try again with: strava connect";
  }
  userState.setStrava(userId, tokens);
  const pull = await pullStravaBurn(userId, true);
  return [
    `Strava connected for athlete ${tokens.athleteId}.`,
    "Your workouts will sync automatically — no need to send strava sync.",
    "",
    formatPullSummary(pull)
  ].join("\n");
}

/** Pull latest Strava workout credit; respects throttle unless force=true. */
export async function autoSyncStravaIfLinked(userId: string, force = false): Promise<string | undefined> {
  if (!userState.isStravaLinked(userId)) return undefined;

  const intervalMs = Number(process.env.SPOT_STRAVA_SYNC_INTERVAL_MS ?? DEFAULT_SYNC_INTERVAL_MS);
  if (!userState.shouldSyncStrava(userId, intervalMs, force)) return undefined;

  const pull = await pullStravaBurn(userId, true);
  if (pull.error) {
    console.warn(`Strava auto-sync failed for ${userId}: ${pull.error}`);
    return undefined;
  }

  if (!pull.changed || pull.burn <= 0) return undefined;
  return pull.activity
    ? `Strava: ${formatActivitySummary(pull.activity, pull.burn)}`
    : `Strava: +${pull.burn} cal added to your budget today.`;
}

export async function pullStravaBurn(userId: string, force = false): Promise<StravaPullResult> {
  const tokens = userState.getStrava(userId);
  if (!tokens) {
    return { burn: 0, changed: false, error: "not_connected" };
  }

  const intervalMs = Number(process.env.SPOT_STRAVA_SYNC_INTERVAL_MS ?? DEFAULT_SYNC_INTERVAL_MS);
  if (!force && !userState.shouldSyncStrava(userId, intervalMs, false)) {
    return { burn: userState.getBurn(userId), changed: false };
  }

  const previousBurn = userState.getBurn(userId);
  const accessToken = await resolveAccessToken(tokens, (next) => userState.setStrava(userId, next));
  if (!accessToken) {
    userState.clearStrava(userId);
    return { burn: 0, changed: false, error: "token_expired" };
  }

  try {
    const { burn, activity } = await computeTodayBurn(accessToken);
    userState.setBurn(userId, burn);
    userState.markStravaSynced(userId);
    return {
      burn,
      activity,
      changed: burn !== previousBurn
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "strava_fetch_failed";
    return { burn: previousBurn, changed: false, error: message };
  }
}

async function formatSyncReply(userId: string, force: boolean): Promise<string> {
  const pull = await pullStravaBurn(userId, force);
  if (pull.error === "not_connected") return "Strava is not connected. Send: strava connect";
  if (pull.error === "token_expired") return "Strava session expired. Send: strava connect";
  return formatPullSummary(pull);
}

function formatPullSummary(pull: StravaPullResult): string {
  if (pull.error && pull.error !== "not_connected" && pull.error !== "token_expired") {
    return `Could not reach Strava (${pull.error}). Will retry automatically on your next message.`;
  }
  if (!pull.activity || pull.burn === 0) {
    return "No Strava workout logged for today yet. When you finish a workout, Spot will pick it up automatically.";
  }
  return `${formatActivitySummary(pull.activity, pull.burn)}. Your calorie budget includes this burn.`;
}

function renderConnectMessage(userId: string): string {
  const url = buildStravaConnectUrl(userId);
  const callback = process.env.STRAVA_REDIRECT_URI ?? "http://localhost:8787/strava/callback";
  const lines = [
    "Connect Strava to add workout calories to your daily budget automatically.",
    "",
    url
  ];

  if (callback.includes("localhost")) {
    lines.push(
      "",
      "After authorizing:",
      "1. The local callback server finishes automatically (keep the agent running), or",
      "2. Paste the code from the redirect URL: strava code YOUR_CODE",
      "",
      "Once connected, workouts sync on every message — no manual refresh needed."
    );
  } else {
    lines.push("", "Authorize once — Spot pulls today's workouts automatically after that.");
  }

  return lines.join("\n");
}

function renderStravaStatus(userId: string): string {
  const tokens = userState.getStrava(userId);
  const burn = userState.getBurn(userId);
  const target = userState.getAdjustedTarget(userId);
  const remaining = userState.getRemaining(userId);

  if (!tokens) {
    return isStravaConfigured()
      ? "Strava: not connected. Send: strava connect"
      : "Strava: not configured on this agent.";
  }

  return [
    "Strava: connected (auto-sync on)",
    `Athlete ID: ${tokens.athleteId}`,
    `Workout credit today: +${burn} cal`,
    `Calorie target today: ${target.calories} cal`,
    `Remaining now: ${remaining.calories} cal, ${remaining.protein}g protein`
  ].join("\n");
}

async function linkWithCode(userId: string, text: string): Promise<string> {
  const code = text.trim().split(/\s+/).pop();
  if (!code) return "Usage: strava code AUTHORIZATION_CODE";
  return completeStravaOAuth(userId, code);
}
