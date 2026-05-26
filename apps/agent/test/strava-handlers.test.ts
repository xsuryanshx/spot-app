import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleStravaCommand } from "../src/strava-handlers.js";

describe("handleStravaCommand", () => {
  beforeEach(() => {
    vi.stubEnv("STRAVA_CLIENT_ID", "test-client");
    vi.stubEnv("STRAVA_CLIENT_SECRET", "test-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a connect URL for strava connect", async () => {
    const result = await handleStravaCommand("user-abc", "strava connect");
    expect(result?.handled).toBe(true);
    expect(result?.reply).toContain("strava.com/oauth/authorize");
    expect(result?.reply).toContain("user-abc");
  });
});
