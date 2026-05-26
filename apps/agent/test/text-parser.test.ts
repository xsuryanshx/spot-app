import { describe, expect, it } from "vitest";
import { parseFoodText } from "../src/text-parser.js";

describe("parseFoodText", () => {
  it("splits comma and and-separated foods", () => {
    expect(parseFoodText("2 eggs and oatmeal")).toEqual([
      { food: "eggs", qty: 2, unit: "serving" },
      { food: "oatmeal", qty: 1, unit: "serving" }
    ]);
  });

  it("parses unit hints", () => {
    expect(parseFoodText("1 cup rice, chicken breast")).toEqual([
      { food: "rice", qty: 1, unit: "cup" },
      { food: "chicken breast", qty: 1, unit: "serving" }
    ]);
  });
});
