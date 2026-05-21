import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeRemaining, computeTotals, DEFAULT_DAILY_TARGET } from "./macros.js";
import type { StravaTokens } from "./strava.js";
import type { FoodLogItem, MacroTotals } from "./types.js";

export type DailyLog = {
  dateKey: string;
  meals: FoodLogItem[][];
  burnCalories: number;
  stravaSyncedAt?: number;
};

export type UserProfile = {
  goals: MacroTotals;
  logs: Record<string, DailyLog>;
  strava?: StravaTokens;
};

export class UserStateStore {
  private readonly profiles = new Map<string, UserProfile>();
  private readonly statePath: string;
  private readonly timeZone: string;

  constructor(statePath = process.env.SPOT_STATE_PATH, timeZone = process.env.SPOT_TIMEZONE ?? "UTC") {
    this.statePath = resolve(process.cwd(), statePath ?? "../../.spot-state.json");
    this.timeZone = timeZone;
    this.load();
  }

  getGoals(userId: string): MacroTotals {
    return this.ensureProfile(userId).goals;
  }

  recordMeal(userId: string, items: FoodLogItem[]): MacroTotals {
    const profile = this.ensureProfile(userId);
    const day = this.dayKey();
    const log = profile.logs[day] ?? { dateKey: day, meals: [], burnCalories: 0 };
    if (items.length > 0) log.meals.push(items);
    profile.logs[day] = log;
    this.persist();
    return this.getDailyTotals(userId);
  }

  setBurn(userId: string, calories: number): void {
    const profile = this.ensureProfile(userId);
    const day = this.dayKey();
    const log = profile.logs[day] ?? { dateKey: day, meals: [], burnCalories: 0 };
    log.burnCalories = Math.max(0, Math.round(calories));
    profile.logs[day] = log;
    this.persist();
  }

  setStrava(userId: string, tokens: StravaTokens): void {
    const profile = this.ensureProfile(userId);
    profile.strava = tokens;
    this.persist();
  }

  getStrava(userId: string): StravaTokens | undefined {
    return this.ensureProfile(userId).strava;
  }

  clearStrava(userId: string): void {
    const profile = this.ensureProfile(userId);
    profile.strava = undefined;
    const day = this.dayKey();
    const log = profile.logs[day];
    if (log) log.burnCalories = 0;
    this.persist();
  }

  getBurn(userId: string): number {
    return this.ensureProfile(userId).logs[this.dayKey()]?.burnCalories ?? 0;
  }

  isStravaLinked(userId: string): boolean {
    return Boolean(this.getStrava(userId));
  }

  shouldSyncStrava(userId: string, intervalMs: number, force = false): boolean {
    if (!this.isStravaLinked(userId)) return false;
    if (force) return true;
    const log = this.ensureProfile(userId).logs[this.dayKey()];
    if (!log?.stravaSyncedAt) return true;
    return Date.now() - log.stravaSyncedAt >= intervalMs;
  }

  markStravaSynced(userId: string): void {
    const profile = this.ensureProfile(userId);
    const day = this.dayKey();
    const log = profile.logs[day] ?? { dateKey: day, meals: [], burnCalories: 0 };
    log.stravaSyncedAt = Date.now();
    profile.logs[day] = log;
    this.persist();
  }

  getDailyTotals(userId: string): MacroTotals {
    const log = this.ensureProfile(userId).logs[this.dayKey()];
    if (!log) return { calories: 0, protein: 0, carbs: 0, fat: 0 };
    return log.meals.reduce((totals, meal) => {
      const mealTotals = computeTotals(meal);
      return {
        calories: totals.calories + mealTotals.calories,
        protein: totals.protein + mealTotals.protein,
        carbs: totals.carbs + mealTotals.carbs,
        fat: totals.fat + mealTotals.fat
      };
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
  }

  getAdjustedTarget(userId: string): MacroTotals {
    const goals = this.getGoals(userId);
    const burn = this.ensureProfile(userId).logs[this.dayKey()]?.burnCalories ?? 0;
    return {
      ...goals,
      calories: goals.calories + burn
    };
  }

  getRemaining(userId: string): MacroTotals {
    const totals = this.getDailyTotals(userId);
    return computeRemaining(totals, this.getAdjustedTarget(userId));
  }

  private ensureProfile(userId: string): UserProfile {
    const existing = this.profiles.get(userId);
    if (existing) return existing;

    const profile: UserProfile = {
      goals: { ...DEFAULT_DAILY_TARGET },
      logs: {}
    };
    this.profiles.set(userId, profile);
    return profile;
  }

  private dayKey(reference = new Date()): string {
    return reference.toLocaleDateString("en-CA", { timeZone: this.timeZone });
  }

  private load(): void {
    if (!existsSync(this.statePath)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.statePath, "utf8")) as Record<string, UserProfile>;
      for (const [userId, profile] of Object.entries(parsed)) {
        this.profiles.set(userId, profile);
      }
    } catch {
      // Start fresh if state file is corrupt.
    }
  }

  private persist(): void {
    const payload = Object.fromEntries(this.profiles.entries());
    writeFileSync(this.statePath, JSON.stringify(payload, null, 2));
  }
}

export const userState = new UserStateStore();
