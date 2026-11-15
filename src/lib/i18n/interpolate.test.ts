import { describe, expect, test } from "vitest";

import { interpolate } from "./interpolate";

describe("interpolate", () => {
  test.each([
    [
      "More actions: {row}",
      { row: "Weekend plans" },
      "More actions: Weekend plans",
    ],
    ["{count} of {total}", { count: 2, total: 10 }, "2 of 10"],
    ["{name}, {name}!", { name: "Ada" }, "Ada, Ada!"],
    ["Zero is a value: {count}", { count: 0 }, "Zero is a value: 0"],
    ["No placeholders", { row: "unused" }, "No placeholders"],
    ["", { row: "unused" }, ""],
  ])("fills %j with %j", (template, values, expected) => {
    expect(interpolate(template, values)).toBe(expected);
  });

  test("leaves a placeholder without a value as written", () => {
    expect(interpolate("Delete: {row} ({count})", { row: "Chain" })).toBe(
      "Delete: Chain ({count})"
    );
  });

  test("reads only the values it was given, never an inherited property", () => {
    expect(interpolate("{constructor} {toString}", {})).toBe(
      "{constructor} {toString}"
    );
  });

  test("inserts a value as text, without reading it as a template", () => {
    expect(interpolate("Delete: {row}", { row: "{count}", count: 3 })).toBe(
      "Delete: {count}"
    );
  });
});
