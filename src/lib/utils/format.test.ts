import { describe, expect, test, vi } from "vitest";

import {
  APP_LOCALE,
  APP_TIME_ZONE,
  formatRelativeTime,
  toPlainNumberText,
} from "./format";

const NOW = new Date("2024-06-15T12:00:00Z").getTime();
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How a date `ageMs` before `NOW` reads. */
function ago(ageMs: number) {
  return formatRelativeTime(new Date(NOW - ageMs), NOW);
}

describe("app locale", () => {
  test("is US English in UTC until the project picks its own", () => {
    expect(APP_LOCALE).toBe("en-US");
    expect(APP_TIME_ZONE).toBe("UTC");
  });
});

describe("formatRelativeTime", () => {
  // Each unit's threshold is pinned from both sides.
  test.each([
    [0, "now"],
    [30 * SECOND, "30 seconds ago"],
    [59 * SECOND, "59 seconds ago"],
    [60 * SECOND, "1 minute ago"],
    [90 * SECOND, "1 minute ago"],
    [59 * MINUTE, "59 minutes ago"],
    [60 * MINUTE, "1 hour ago"],
    [23 * HOUR, "23 hours ago"],
    [DAY, "yesterday"],
    [2 * DAY, "2 days ago"],
    [6 * DAY, "6 days ago"],
    [7 * DAY, "last week"],
    [30 * DAY, "4 weeks ago"],
    [31 * DAY, "last month"],
    [60 * DAY, "2 months ago"],
    [364 * DAY, "12 months ago"],
    [366 * DAY, "last year"],
  ])("a date %i ms before now reads %s", (ageMs, expected) => {
    expect(ago(ageMs)).toBe(expected);
  });

  test("a date ahead of now reads now, never a future time", () => {
    expect(ago(-45 * SECOND)).toBe("now");
  });

  test("reads the instant it is given, not the machine clock", () => {
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));

    expect(formatRelativeTime(new Date(NOW), NOW + 10 * MINUTE)).toBe(
      "10 minutes ago"
    );
  });
});

describe("toPlainNumberText", () => {
  test.each([
    ["1,500", "1500"],
    ["1,500.25", "1500.25"],
    ["1,234,567", "1234567"],
    ["-0.5", "-0.5"],
    ["12", "12"],
    ["", ""],
  ])("reads the en-US %j as %j", (typed, plain) => {
    expect(toPlainNumberText(typed)).toBe(plain);
  });
});
