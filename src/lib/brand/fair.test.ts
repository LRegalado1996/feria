import { describe, expect, test } from "vitest";

import { countdownTarget, daysUntil, FAIR_OPENS_AT } from "./fair";

const at = (iso: string) => new Date(iso).getTime();

describe("countdownTarget", () => {
  test("without a chosen day, it is the fair's opening: December 5, 2026, at midnight in Montevideo", () => {
    expect(countdownTarget(null)).toBe(FAIR_OPENS_AT);
    expect(FAIR_OPENS_AT.toISOString()).toBe("2026-12-05T03:00:00.000Z");
  });

  test.each([
    ["2026-12-20", "2026-12-20T03:00:00.000Z"],
    ["2027-01-01", "2027-01-01T03:00:00.000Z"],
    // Winter in the south: still UTC-3, Uruguay has no daylight saving.
    ["2027-07-15", "2027-07-15T03:00:00.000Z"],
  ])("a chosen day %s is its midnight in Montevideo, %s", (day, instant) => {
    expect(countdownTarget(day).toISOString()).toBe(instant);
  });
});

describe("daysUntil", () => {
  test.each([
    ["three weeks before, to the minute", "2026-11-14T03:00:00.000Z", 21],
    ["a minute later the same day", "2026-11-14T03:01:00.000Z", 21],
    ["the evening before", "2026-12-04T23:00:00.000Z", 1],
    ["one millisecond before opening", "2026-12-05T02:59:59.999Z", 1],
    ["exactly a day before", "2026-12-04T03:00:00.000Z", 1],
    ["just over a day before", "2026-12-04T02:59:59.999Z", 2],
  ])("%s, counts the day in progress", (_name, now, days) => {
    expect(daysUntil(FAIR_OPENS_AT, at(now))).toBe(days);
  });

  test.each([
    ["at the opening", "2026-12-05T03:00:00.000Z"],
    ["during the fair", "2026-12-20T15:00:00.000Z"],
    ["after it", "2027-02-01T00:00:00.000Z"],
  ])("%s, there is nothing left to count", (_name, now) => {
    expect(daysUntil(FAIR_OPENS_AT, at(now))).toBe(0);
  });

  test("counts to a chosen day the same way", () => {
    expect(
      daysUntil(countdownTarget("2026-12-20"), at("2026-12-18T12:00:00.000Z"))
    ).toBe(2);
  });
});
