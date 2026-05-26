import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { MacroTotals } from "./types.js";

export type StravaActivity = {
  id: number;
  name: string;
  type: string;
  sport_type?: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  calories?: number;
  start_date?: string;
  start_date_local?: string;
};

export type StravaTokens = {
  athleteId: number;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

type StravaTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete: { id: number };
};

const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), "../test/fixtures");
const TOKEN_URL = "https://www.strava.com/oauth/token";
const ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities";

export function isStravaConfigured(): boolean {
  return Boolean(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET);
}

export function buildStravaConnectUrl(userId: string): string {
  const clientId = process.env.STRAVA_CLIENT_ID ?? "";
  const redirectUri = encodeURIComponent(
    process.env.STRAVA_REDIRECT_URI ?? "http://localhost:8787/strava/callback"
  );
  return `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&approval_prompt=auto&scope=activity:read_all&state=${encodeURIComponent(userId)}`;
}

export function activityBurnCalories(activity: StravaActivity): number {
  if (activity.calories && activity.calories > 0) return Math.round(activity.calories);
  const hours = activity.moving_time / 3600;
  const met = activity.type === "Ride" || activity.sport_type === "Ride" ? 7 : activity.type === "Run" || activity.sport_type === "Run" ? 9 : 4;
  return Math.round(met * 70 * hours);
}

export function adjustTargetForBurn(target: MacroTotals, burn: number): MacroTotals {
  return {
    ...target,
    calories: target.calories + Math.max(0, Math.round(burn))
  };
}

export function formatActivitySummary(activity: StravaActivity, burn: number): string {
  const miles = (activity.distance / 1609.34).toFixed(1);
  const minutes = Math.round(activity.moving_time / 60);
  return `${activity.name} (${activity.type}, ${miles} mi / ${minutes} min) → +${burn} cal budget`;
}

export function loadDemoActivity(name = "strava-run"): StravaActivity {
  const today = new Date().toISOString().slice(0, 10);
  const activity = JSON.parse(
    readFileSync(resolve(fixtureDir, `${name}.json`), "utf8")
  ) as StravaActivity;
  return {
    ...activity,
    start_date_local: `${today}T08:00:00`,
    calories: activity.calories ?? activityBurnCalories(activity)
  };
}

export async function exchangeStravaCode(code: string): Promise<StravaTokens | undefined> {
  const payload = await requestStravaTokens({
    client_id: process.env.STRAVA_CLIENT_ID ?? "",
    client_secret: process.env.STRAVA_CLIENT_SECRET ?? "",
    code,
    grant_type: "authorization_code"
  });
  return payload ? toStravaTokens(payload) : undefined;
}

export async function refreshStravaToken(refreshToken: string): Promise<StravaTokens | undefined> {
  const payload = await requestStravaTokens({
    client_id: process.env.STRAVA_CLIENT_ID ?? "",
    client_secret: process.env.STRAVA_CLIENT_SECRET ?? "",
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });
  return payload ? toStravaTokens(payload) : undefined;
}

export async function resolveAccessToken(
  tokens: StravaTokens,
  onRefresh: (next: StravaTokens) => void
): Promise<string | undefined> {
  const now = Math.floor(Date.now() / 1000);
  if (tokens.expiresAt > now + 60) return tokens.accessToken;

  const refreshed = await refreshStravaToken(tokens.refreshToken);
  if (!refreshed) return undefined;
  onRefresh(refreshed);
  return refreshed.accessToken;
}

export async function fetchRecentActivities(accessToken: string, count = 5): Promise<StravaActivity[]> {
  if (process.env.SPOT_DEMO_MODE === "1") {
    return [loadDemoActivity()];
  }

  const url = new URL(ACTIVITIES_URL);
  url.searchParams.set("per_page", String(count));
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return [];
  return (await response.json()) as StravaActivity[];
}

export function pickTodayActivity(
  activities: StravaActivity[],
  timeZone = process.env.SPOT_TIMEZONE ?? "UTC"
): StravaActivity | undefined {
  const today = new Date().toLocaleDateString("en-CA", { timeZone });
  return activities.find((activity) => activityDate(activity, timeZone) === today);
}

export function activityDate(activity: StravaActivity, timeZone: string): string | undefined {
  const raw = activity.start_date_local ?? activity.start_date;
  if (!raw) return undefined;
  return new Date(raw).toLocaleDateString("en-CA", { timeZone });
}

export async function computeTodayBurn(
  accessToken: string,
  timeZone = process.env.SPOT_TIMEZONE ?? "UTC"
): Promise<{ burn: number; activity?: StravaActivity }> {
  const activities = await fetchRecentActivities(accessToken, 8);
  const today = pickTodayActivity(activities, timeZone);
  if (!today) return { burn: 0 };
  const burn = activityBurnCalories(today);
  return { burn, activity: today };
}

async function requestStravaTokens(
  body: Record<string, string>
): Promise<StravaTokenResponse | undefined> {
  if (!body.client_id || !body.client_secret) return undefined;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body)
  });
  if (!response.ok) return undefined;
  return (await response.json()) as StravaTokenResponse;
}

function toStravaTokens(payload: StravaTokenResponse): StravaTokens {
  return {
    athleteId: payload.athlete.id,
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: payload.expires_at
  };
}
