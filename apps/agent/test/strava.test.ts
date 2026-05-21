import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DAILY_TARGET } from "../src/macros.js";
import { autoSyncStravaIfLinked, parseStravaCommand, pullStravaBurn } from "../src/strava-handlers.js";
import { userState } from "../src/state.js";
import {
  activityBurnCalories,
  adjustTargetForBurn,
  formatActivitySummary,
  pickTodayActivity,
  refreshStravaToken,
  type StravaActivity
} from "../src/strava.js";

const fixture = (name: string) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, `fixtures/${name}.json`), "utf8")) as StravaActivity;

describe("strava math", () => {
  it("uses reported calories when present", () => {
    expect(activityBurnCalories(fixture("strava-run"))).toBe(520);
  });

  it("estimates burn from duration when calories missing", () => {
    const activity: StravaActivity = {
      id: 1,
      name: "Run",
      type: "Run",
      distance: 5000,
      moving_time: 1800,
      elapsed_time: 1900
    };
    expect(activityBurnCalories(activity)).toBeGreaterThan(0);
  });

  it("adds burn to the daily calorie target", () => {
    expect(adjustTargetForBurn(DEFAULT_DAILY_TARGET, 400).calories).toBe(2600);
  });

  it("formats activity summaries", () => {
    const summary = formatActivitySummary(fixture("strava-run"), 520);
    expect(summary).toContain("Morning Run");
    expect(summary).toContain("+520 cal");
  });
});

describe("strava activity selection", () => {
  it("picks an activity from today", () => {
    const today = new Date().toISOString().slice(0, 10);
    const activities: StravaActivity[] = [
      { ...fixture("strava-walk"), start_date_local: "2020-01-01T10:00:00" },
      { ...fixture("strava-run"), start_date_local: `${today}T09:00:00` }
    ];
    expect(pickTodayActivity(activities, "UTC")?.name).toBe("Morning Run");
  });
});

describe("strava commands", () => {
  beforeEach(() => {
    vi.stubEnv("SPOT_DEMO_MODE", "1");
    vi.stubEnv("SPOT_TIMEZONE", "UTC");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("parses connect and sync commands", () => {
    expect(parseStravaCommand("strava connect")).toBe("connect");
    expect(parseStravaCommand("sync strava")).toBe("sync");
    expect(parseStravaCommand("strava status")).toBe("status");
    expect(parseStravaCommand("2 eggs")).toBeUndefined();
  });

  it("syncs demo burn into user state", async () => {
    const userId = `runner-${Date.now()}`;
    userState.setStrava(userId, {
      athleteId: 42,
      accessToken: "demo-token",
      refreshToken: "demo-refresh",
      expiresAt: Math.floor(Date.now() / 1000) + 3600
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [fixture("strava-run")]
      })
    );

    const pull = await pullStravaBurn(userId, true);
    expect(pull.burn).toBe(520);
    expect(pull.changed).toBe(true);
    expect(userState.getBurn(userId)).toBe(520);
    expect(userState.getAdjustedTarget(userId).calories).toBe(DEFAULT_DAILY_TARGET.calories + 520);
  });

  it("auto-syncs when linked and throttles repeat pulls", async () => {
    const userId = `runner-auto-${Date.now()}`;
    userState.setStrava(userId, {
      athleteId: 42,
      accessToken: "demo-token",
      refreshToken: "demo-refresh",
      expiresAt: Math.floor(Date.now() / 1000) + 3600
    });

    vi.stubEnv("SPOT_STRAVA_SYNC_INTERVAL_MS", "600000");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [fixture("strava-run")]
      })
    );

    const first = await autoSyncStravaIfLinked(userId);
    expect(first).toContain("Strava:");
    expect(userState.getBurn(userId)).toBe(520);

    const fetchMock = vi.mocked(fetch);
    fetchMock.mockClear();
    const second = await autoSyncStravaIfLinked(userId);
    expect(second).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes expired tokens", async () => {
    vi.stubEnv("STRAVA_CLIENT_ID", "test-client");
    vi.stubEnv("STRAVA_CLIENT_SECRET", "test-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_at: Math.floor(Date.now() / 1000) + 7200,
          athlete: { id: 99 }
        })
      })
    );

    const refreshed = await refreshStravaToken("old-refresh");
    expect(refreshed?.accessToken).toBe("new-access");
    expect(refreshed?.athleteId).toBe(99);
  });
});
