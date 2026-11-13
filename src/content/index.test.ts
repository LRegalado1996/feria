import { describe, expect, test, vi } from "vitest";

import { type Dictionary, getDictionary } from ".";
import { en } from "./en";
import { es } from "./es";

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

const PLACEHOLDER = /\{\w+\}/g;

/** A dictionary, or one of its areas: strings, nested by key. */
interface CopyTree {
  [key: string]: CopyTree | string;
}

/** Every string of a dictionary, by its dotted key. */
function flatten(node: CopyTree, prefix = ""): [key: string, text: string][] {
  return Object.entries(node).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    return typeof value === "string"
      ? [[path, value] satisfies [string, string]]
      : flatten(value, path);
  });
}

function placeholdersByKey(dictionary: Dictionary) {
  return Object.fromEntries(
    flatten(dictionary).map(([key, text]) => [
      key,
      new Set(text.match(PLACEHOLDER)),
    ])
  );
}

describe("getDictionary", () => {
  test.each([
    ["es", "Hola de nuevo", "Reintentar"],
    ["en", "Welcome back", "Try again"],
  ] as const)("returns the %s interface text", (locale, welcome, tryAgain) => {
    const dictionary = getDictionary(locale);

    expect(dictionary.auth.welcome.title).toBe(welcome);
    expect(dictionary.common.tryAgain).toBe(tryAgain);
  });
});

describe("dictionaries", () => {
  test("a dictionary that lacks a key, or adds one, does not type-check", () => {
    // Proven by `pnpm typecheck`, which fails on an unused `@ts-expect-error`:
    // delete either directive's reason to exist and the suite goes red.
    // @ts-expect-error -- `system` is missing
    const missingKey: Dictionary["theme"] = {
      change: "Change theme",
      dark: "Dark",
      light: "Light",
    };
    const extraKey: Dictionary["theme"] = {
      ...en.theme,
      // @ts-expect-error -- `sepia` exists in no other language
      sepia: "Sepia",
    };

    expect(Object.keys(missingKey)).toEqual(["change", "dark", "light"]);
    expect(Object.keys(extraKey)).toContain("sepia");
  });

  test("both languages take the same values in the same strings", () => {
    expect(placeholdersByKey(en)).toEqual(placeholdersByKey(es));
    // The comparison above is not vacuous: some strings do take values.
    expect(placeholdersByKey(es)["common.deleteRow"]).toEqual(
      new Set(["{row}"])
    );
  });

  test.each([
    ["es", es],
    ["en", en],
  ] as const)("no %s string is left empty", (_locale, dictionary) => {
    const empty = flatten(dictionary)
      .filter(([, text]) => text.trim() === "")
      .map(([key]) => key);

    expect(empty).toEqual([]);
  });
});
