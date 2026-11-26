import { describe, expect, test } from "vitest";

import { lastDays, metricsPath, readMetricsRange } from "./metrics";

const TODAY = "2026-12-05";
const DEFAULT = { from: "2026-11-06", to: TODAY };

describe("readMetricsRange", () => {
  test("reads a range the API takes as it is", () => {
    expect(
      readMetricsRange({ from: "2026-11-01", to: "2026-11-30" }, TODAY)
    ).toEqual({ from: "2026-11-01", to: "2026-11-30" });
  });

  test("takes the first of a repeated parameter", () => {
    expect(
      readMetricsRange(
        { from: ["2026-11-01", "2026-01-01"], to: "2026-11-30" },
        TODAY
      )
    ).toEqual({ from: "2026-11-01", to: "2026-11-30" });
  });

  test("takes a one-day range and a range of exactly a leap year", () => {
    expect(readMetricsRange({ from: TODAY, to: TODAY }, TODAY)).toEqual({
      from: TODAY,
      to: TODAY,
    });
    expect(
      readMetricsRange({ from: "2028-01-01", to: "2028-12-31" }, TODAY)
    ).toEqual({ from: "2028-01-01", to: "2028-12-31" });
  });

  test.each([
    ["no range", {}],
    ["only a start", { from: "2026-11-01" }],
    ["a day that does not exist", { from: "2026-02-31", to: "2026-03-05" }],
    [
      "a range that ends before it starts",
      { from: "2026-12-05", to: "2026-12-04" },
    ],
    [
      "a range one day past a leap year",
      { from: "2028-01-01", to: "2029-01-01" },
    ],
    ["text that is no day", { from: "ayer", to: "hoy" }],
  ])("opens on the last 30 days for %s", (_case, searchParams) => {
    expect(readMetricsRange(searchParams, TODAY)).toEqual(DEFAULT);
  });
});

describe("lastDays", () => {
  test.each([
    [1, { from: TODAY, to: TODAY }],
    [7, { from: "2026-11-29", to: TODAY }],
    [30, DEFAULT],
  ])("the last %i days end today, today included", (days, range) => {
    expect(lastDays(days, TODAY)).toEqual(range);
  });
});

describe("metricsPath", () => {
  test.each([
    ["es", "/admin/metrics?from=2026-11-01&to=2026-11-30"],
    ["en", "/en/admin/metrics?from=2026-11-01&to=2026-11-30"],
  ] as const)("in %s carries the range", (locale, path) => {
    expect(metricsPath(locale, { from: "2026-11-01", to: "2026-11-30" })).toBe(
      path
    );
  });

  test("is the bare screen without a range", () => {
    expect(metricsPath("es")).toBe("/admin/metrics");
  });
});
