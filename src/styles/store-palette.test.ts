import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { STORE_PALETTE } from "./store-palette";

const GLOBALS_CSS = readFileSync(
  path.join(process.cwd(), "src/styles/globals.css"),
  "utf-8"
);

/** The default value of a `--store-*` token, as the stylesheet declares it. */
function readStoreToken(name: string) {
  return new RegExp(`--store-${name}:\\s*(#[0-9a-f]{6});`).exec(
    GLOBALS_CSS
  )?.[1];
}

describe("STORE_PALETTE", () => {
  test("covers the accent, the background, the foreground and the surface", () => {
    expect(Object.keys(STORE_PALETTE)).toEqual([
      "accent",
      "background",
      "foreground",
      "surface",
    ]);
  });

  test.each(Object.entries(STORE_PALETTE))(
    "%s is the value of its store token in globals.css",
    (name, value) => {
      expect(value).toBe(readStoreToken(name));
    }
  );
});
