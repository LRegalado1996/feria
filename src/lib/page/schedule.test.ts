import { describe, expect, test } from "vitest";

import { type HomeSchedule, isShowing, scheduleStatus } from "./schedule";

function makeSchedule(overrides: Partial<HomeSchedule> = {}): HomeSchedule {
  return { endsOn: null, isActive: true, startsOn: null, ...overrides };
}

describe("scheduleStatus", () => {
  test.each([
    ["switched off, inside its days", { isActive: false }, "off"],
    ["on with no days", {}, "showing"],
    ["the day before its first", { startsOn: "2026-12-05" }, "scheduled"],
    ["on its first day", { startsOn: "2026-12-04" }, "showing"],
    ["on its last day", { endsOn: "2026-12-04" }, "showing"],
    ["the day after its last", { endsOn: "2026-12-03" }, "ended"],
    [
      "inside both days",
      { endsOn: "2027-01-05", startsOn: "2026-12-01" },
      "showing",
    ],
    [
      "off and out of its days",
      { endsOn: "2026-12-01", isActive: false },
      "off",
    ],
    // Across a month: days compare in calendar order.
    ["before a start next month", { startsOn: "2027-01-01" }, "scheduled"],
  ] as const)("%s: %s", (_case, overrides, status) => {
    expect(scheduleStatus(makeSchedule(overrides), "2026-12-04")).toBe(status);
  });
});

describe("isShowing", () => {
  test.each([
    [{}, true],
    [{ endsOn: "2026-12-03" }, false],
    [{ startsOn: "2026-12-05" }, false],
    [{ isActive: false }, false],
  ] as const)("%o shows: %s", (overrides, showing) => {
    expect(isShowing(makeSchedule(overrides), "2026-12-04")).toBe(showing);
  });
});
