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
};

type StravaTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete: { id: number };
};

const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), "../test/fixtures");

export function buildStravaConnectUrl(state: string): string {
  const clientId = process.env.STRAVA_CLIENT_ID ?? "";
  const redirectUri = encodeURIComponent(
    process.env.STRAVA_REDIRECT_URI ?? "http://localhost:8787/strava/callback"
  );
  return `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&approval_prompt=auto&scope=activity:read_all&state=${encodeURIComponent(state)}`;
}

export function activityBurnCalories(activity: StravaActivity): number {
  if (activity.calories && activity.calories > 0) return Math.round(activity.calories);
  const hours = activity.moving_time / 3600;
  const met = activity.type === "Ride" ? 7 : activity.type === "Run" ? 9 : 4;
  return Math.round(met * 70 * hours);
}

export function adjustTargetForBurn(target: MacroTotals, burn: number): MacroTotals {
  return {
    ...target,
    calories: target.calories + Math.max(0, Math.round(burn))
  };
}

export function loadDemoActivity(name = "strava-run"): StravaActivity {
  const raw = readFileSync(resolve(fixtureDir, `${name}.json`), "utf8");
  return JSON.parse(raw) as StravaActivity;
}

export async function exchangeStravaCode(code: string): Promise<StravaTokenResponse | undefined> {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) return undefined;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code"
  });

  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) return undefined;
  return (await response.json()) as StravaTokenResponse;
}

export async function fetchRecentActivity(accessToken: string): Promise<StravaActivity | undefined> {
  if (process.env.SPOT_DEMO_MODE === "1") return loadDemoActivity();

  const response = await fetch("https://www.strava.com/api/v3/athlete/activities?per_page=1", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return undefined;
  const activities = (await response.json()) as StravaActivity[];
  return activities[0];
}
