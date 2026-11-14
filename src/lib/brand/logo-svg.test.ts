import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { LOGO_TAG_PATH } from "./logo";
import {
  BRAND_LOGO_FILES,
  buildLogoDataUrl,
  buildLogoSvg,
  type LogoColorway,
} from "./logo-svg";

const BRAND_DIRECTORY = path.join(process.cwd(), "public/brand");
const ACCENT = "#c8f31d";
const INK = "#111312";
const PAPER = "#ffffff";
const TAG = `<path d="${LOGO_TAG_PATH}"`;

describe("buildLogoSvg", () => {
  test("is a standalone SVG document named after the brand, in the drawing's box", () => {
    const svg = buildLogoSvg({ colorway: "accent", variant: "full" });

    expect(svg).toMatch(
      /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="2 8 116 84" width="116" height="84" role="img" aria-label="LR Market">/
    );
    expect(svg.endsWith("</svg>\n")).toBe(true);
  });

  test.each([
    ["accent", ACCENT, INK],
    ["contrast", INK, ACCENT],
  ] as const)(
    "the %s colorway fills the tag with %s and the letters with %s",
    (colorway, tag, letters) => {
      const svg = buildLogoSvg({ colorway, variant: "full" });

      expect(svg).toContain(`${TAG} fill="${tag}" fill-rule="evenodd"/>`);
      expect(svg).toContain(`<g fill="${letters}"><g transform=`);
      expect(svg).not.toContain("<mask");
    }
  );

  test.each([
    ["one-color-light", INK],
    ["one-color-dark", PAPER],
  ] as const)(
    "the %s colorway is the tag alone in %s, with the letters cut out of it",
    (colorway, ink) => {
      const svg = buildLogoSvg({ colorway, variant: "full" });
      const colors = new Set(svg.match(/#[0-9a-f]{6}/g));

      expect([...colors]).toEqual([ink]);
      expect(svg).toContain(
        '<mask id="letters"><rect x="2" y="8" width="116" height="84" fill="white"/><g fill="black">'
      );
      expect(svg).toContain(
        `${TAG} fill="${ink}" fill-rule="evenodd" mask="url(#letters)"/>`
      );
    }
  );

  test.each([
    ["full", 9],
    ["mark", 3],
  ] as const)("the %s variant draws %i paths", (variant, count) => {
    const svg = buildLogoSvg({ colorway: "accent", variant });

    expect(svg.match(/<path /g)).toHaveLength(count);
  });

  test("a letter placed inside its group carries its own transform, and one that is not carries none", () => {
    const svg = buildLogoSvg({ colorway: "accent", variant: "full" });

    expect(svg).toContain(
      '<path d="M0 0H54V21H38V100H16V21H0Z" fill-rule="evenodd" transform="translate(363 0)"/>'
    );
    expect(svg).toContain(
      '<path d="M12 14H28V70H50V86H12Z" fill-rule="evenodd"/>'
    );
  });
});

describe("buildLogoDataUrl", () => {
  test("is the same document, base64-encoded for an image source", () => {
    const options = { colorway: "contrast", variant: "mark" } as const;
    const url = buildLogoDataUrl(options);
    const prefix = "data:image/svg+xml;base64,";

    expect(url.startsWith(prefix)).toBe(true);
    expect(
      Buffer.from(url.slice(prefix.length), "base64").toString("utf-8")
    ).toBe(buildLogoSvg(options));
  });
});

describe("public/brand", () => {
  test("holds the full logo and the mark in every colorway, and nothing else", () => {
    const colorways: LogoColorway[] = [
      "accent",
      "contrast",
      "one-color-dark",
      "one-color-light",
    ];

    expect(new Set(readdirSync(BRAND_DIRECTORY))).toEqual(
      new Set(Object.keys(BRAND_LOGO_FILES))
    );
    expect(Object.values(BRAND_LOGO_FILES)).toHaveLength(8);
    expect(Object.values(BRAND_LOGO_FILES)).toEqual(
      expect.arrayContaining(
        colorways.flatMap((colorway) => [
          { colorway, variant: "full" },
          { colorway, variant: "mark" },
        ])
      )
    );
  });

  test.each(Object.entries(BRAND_LOGO_FILES))(
    "%s is what the code draws today (pnpm brand:assets rewrites it)",
    (name, options) => {
      expect(readFileSync(path.join(BRAND_DIRECTORY, name), "utf-8")).toBe(
        buildLogoSvg(options)
      );
    }
  );
});
