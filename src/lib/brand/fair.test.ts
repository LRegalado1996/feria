import { describe, expect, test } from "vitest";

import { daysUntilFair, FAIR_OPENS_AT } from "./fair";

const at = (iso: string) => new Date(iso).getTime();

describe("daysUntilFair", () => {
  test("the fair opens on December 5, 2026, at midnight in Montevideo", () => {
    expect(FAIR_OPENS_AT.toISOString()).toBe("2026-12-05T03:00:00.000Z");
  });

  test.each([
    ["three weeks before, to the minute", "2026-11-14T03:00:00.000Z", 21],
    ["a minute later the same day", "2026-11-14T03:01:00.000Z", 21],
    ["the evening before", "2026-12-04T23:00:00.000Z", 1],
    ["one millisecond before opening", "2026-12-05T02:59:59.999Z", 1],
    ["exactly a day before", "2026-12-04T03:00:00.000Z", 1],
    ["just over a day before", "2026-12-04T02:59:59.999Z", 2],
  ])("%s, counts the day in progress", (_name, now, days) => {
    expect(daysUntilFair(at(now))).toBe(days);
  });

  test.each([
    ["at the opening", "2026-12-05T03:00:00.000Z"],
    ["during the fair", "2026-12-20T15:00:00.000Z"],
    ["after it", "2027-02-01T00:00:00.000Z"],
  ])("%s, there is nothing left to count", (_name, now) => {
    expect(daysUntilFair(at(now))).toBe(0);
  });
});
