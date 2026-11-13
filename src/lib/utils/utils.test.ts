import { expect, test } from "vitest";

import { cn } from ".";

test.each([
  ["joins class names", ["foo", "bar"], "foo bar"],
  ["drops a false condition", ["base", "included", false], "base included"],
  ["drops undefined and null", ["base", undefined, null, "end"], "base end"],
  ["flattens arrays", [["foo", "bar"], "baz"], "foo bar baz"],
  [
    "keeps the truthy keys of an object",
    [{ foo: true, bar: false, baz: true }],
    "foo baz",
  ],
  ["returns nothing for no input", [], ""],
  ["returns nothing for an empty string", [""], ""],
  [
    "lets the later of two conflicting utilities win",
    ["px-4 py-2", "px-6"],
    "py-2 px-6",
  ],
  [
    "resolves a conflicting color",
    ["text-red-500", "text-blue-500"],
    "text-blue-500",
  ],
  [
    "keeps a variant beside the base utility it replaces",
    ["bg-red-500 hover:bg-red-600", "bg-blue-500"],
    "hover:bg-red-600 bg-blue-500",
  ],
  [
    "keeps utilities that do not conflict",
    ["rounded-lg shadow-md", "m-2 p-4"],
    "rounded-lg shadow-md m-2 p-4",
  ],
] as const)("cn %s", (_case, inputs, expected) => {
  expect(cn(...inputs)).toBe(expected);
});
