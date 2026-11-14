import { describe, expect, test } from "vitest";

import {
  createStoreSchema,
  getStoreBySlugSchema,
  RESERVED_STORE_SLUGS,
  storeSlugSchema,
  updateStoreSchema,
} from ".";

const COLOR_MESSAGE =
  "Write the color as # followed by six hex digits (0 to 9, a to f)";
const SLUG_FORMAT_MESSAGE =
  "Use lowercase letters, numbers and single hyphens, such as my-store";

/** A store that passes every rule, in the default palette. */
function makeStore(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    colorAccent: "#c8f31d",
    colorBackground: "#f2f3f0",
    colorContrast: "#111312",
    colorForeground: "#111312",
    colorSurface: "#ffffff",
    currencyCode: "UYU",
    instagramUrl: null,
    isActive: true,
    logoUrl: null,
    name: "Sample Store",
    slug: "sample-store",
    tiktokUrl: null,
    translations: [],
    whatsappNumber: null,
    ...overrides,
  };
}

/** Every issue of a refused store, as `[field, message]`. */
function issuesOf(overrides: Record<string, unknown>) {
  const result = createStoreSchema.safeParse(makeStore(overrides));

  return result.success
    ? []
    : result.error.issues.map((issue) => [issue.path.join("."), issue.message]);
}

describe("storeSlugSchema", () => {
  test.each([
    ["the shortest address", "ab"],
    ["the longest address", "a".repeat(40)],
    ["digits and single hyphens", "my-store-2"],
    ["a word that only starts like a reserved one", "admins"],
  ])("accepts %s unchanged", (_case, slug) => {
    expect(storeSlugSchema.parse(slug)).toBe(slug);
  });

  test.each([
    ["one character", "a", "The address needs at least 2 characters"],
    ["41 characters", "a".repeat(41), "Keep the address to 40 characters"],
    ["an uppercase letter", "My-store", SLUG_FORMAT_MESSAGE],
    ["a leading hyphen", "-store", SLUG_FORMAT_MESSAGE],
    ["a trailing hyphen", "store-", SLUG_FORMAT_MESSAGE],
    ["a doubled hyphen", "my--store", SLUG_FORMAT_MESSAGE],
    ["a space", "my store", SLUG_FORMAT_MESSAGE],
    ["an accent", "joyería", SLUG_FORMAT_MESSAGE],
    ["a slash", "my/store", SLUG_FORMAT_MESSAGE],
    // Next's and Vercel's own paths: the pattern alone keeps them out.
    ["Next's asset path", "_next", SLUG_FORMAT_MESSAGE],
    ["Vercel's path", "_vercel", SLUG_FORMAT_MESSAGE],
    ["a file in public/", "favicon.ico", SLUG_FORMAT_MESSAGE],
  ])("refuses %s", (_case, slug, message) => {
    const result = storeSlugSchema.safeParse(slug);

    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      message,
    ]);
  });

  test("reserves every first path segment the app answers itself", () => {
    expect(RESERVED_STORE_SLUGS).toEqual([
      "admin",
      "api",
      "design",
      "en",
      "es",
      "monitoring",
    ]);
  });

  test.each(RESERVED_STORE_SLUGS)("refuses the reserved address %s", (slug) => {
    const result = storeSlugSchema.safeParse(slug);

    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "That address is reserved by the app. Choose another one",
    ]);
  });
});

describe("getStoreBySlugSchema", () => {
  test("accepts a store address", () => {
    expect(getStoreBySlugSchema.parse({ slug: "lr-market" })).toEqual({
      slug: "lr-market",
    });
  });

  test("holds the address to the same rules as a write", () => {
    expect(getStoreBySlugSchema.safeParse({ slug: "admin" }).success).toBe(
      false
    );
  });
});

describe("createStoreSchema", () => {
  test("accepts a complete store and returns it as it will be stored", () => {
    const store = makeStore({
      instagramUrl: "https://instagram.com/sample",
      logoUrl: "https://images.example.test/logo.png",
      name: "  Sample Store ",
      tiktokUrl: "https://tiktok.com/@sample",
      translations: [
        { description: " Rings and chains. ", locale: "es", tagline: " Hola " },
        { description: "Rings and chains.", locale: "en", tagline: "Hello" },
      ],
      whatsappNumber: " +59899123456 ",
    });

    expect(createStoreSchema.parse(store)).toEqual({
      ...store,
      name: "Sample Store",
      translations: [
        { description: "Rings and chains.", locale: "es", tagline: "Hola" },
        { description: "Rings and chains.", locale: "en", tagline: "Hello" },
      ],
      whatsappNumber: "+59899123456",
    });
  });

  test("drops a key it does not know, such as a client-sent id", () => {
    const parsed = createStoreSchema.parse(
      makeStore({ createdAt: "2020-01-01", id: 99 })
    );

    expect(parsed).toEqual(makeStore());
  });

  test("stores a color in lowercase, without the spaces around it", () => {
    const parsed = createStoreSchema.parse(
      makeStore({ colorAccent: " #C8F31D " })
    );

    expect(parsed.colorAccent).toBe("#c8f31d");
  });

  test.each([
    ["three digits", "#fff"],
    ["no hash", "c8f31d"],
    ["seven digits", "#c8f31d0"],
    ["a letter past f", "#c8f31g"],
    ["a color name", "red"],
    ["a CSS function", "rgb(0, 0, 0)"],
    ["an attempt to close the style", "#c8f31d;background:url(x)"],
    ["empty", ""],
  ])("refuses a color written as %s", (_case, color) => {
    expect(issuesOf({ colorAccent: color })).toEqual([
      ["colorAccent", COLOR_MESSAGE],
    ]);
  });

  test("reports a malformed color once, without a contrast message computed from it", () => {
    expect(
      issuesOf({ colorBackground: "white", colorForeground: "black" })
    ).toEqual([
      ["colorBackground", COLOR_MESSAGE],
      ["colorForeground", COLOR_MESSAGE],
    ]);
  });

  test.each([
    ["colorAccent"],
    ["colorBackground"],
    ["colorContrast"],
    ["colorForeground"],
    ["colorSurface"],
  ])("requires %s", (field) => {
    const { [field]: _omitted, ...rest } = makeStore();

    expect(createStoreSchema.safeParse(rest).success).toBe(false);
  });

  test("accepts text on a surface that just reaches 4.5:1", () => {
    // #111312 on #7d7d7d is 4.53:1.
    expect(issuesOf({ colorSurface: "#7d7d7d" })).toEqual([]);
  });

  test("refuses text on a surface one step short of 4.5:1, with the ratio it has", () => {
    // #111312 on #7c7c7c is 4.469:1: truncated, so it never reads as 4.5.
    expect(issuesOf({ colorSurface: "#7c7c7c" })).toEqual([
      [
        "colorSurface",
        "The text color on the surface color has a contrast of 4.46:1. It needs at least 4.5:1 to be readable",
      ],
    ]);
  });

  test("holds an accent heading on the contrast color to 3:1, the large-text ratio", () => {
    const headingMessage = [
      "colorAccent",
      "The accent color, as a heading on the contrast color has a contrast of 2.96:1. It needs at least 3:1 to be readable",
    ];

    // #616161 on #111312 is 3.01:1 and #606060 is 2.97:1.
    expect(issuesOf({ colorAccent: "#606060" })).toContainEqual(headingMessage);
    expect(issuesOf({ colorAccent: "#616161" })).toEqual([
      [
        "colorAccent",
        "The text color on the accent color has a contrast of 3.01:1. It needs at least 4.5:1 to be readable",
      ],
    ]);
  });

  test("names every unreadable pair of a gray-on-white palette", () => {
    expect(
      issuesOf({
        colorBackground: "#ffffff",
        colorForeground: "#777777",
        colorSurface: "#ffffff",
      })
    ).toEqual([
      [
        "colorForeground",
        "The text color on the background color has a contrast of 4.47:1. It needs at least 4.5:1 to be readable",
      ],
      [
        "colorSurface",
        "The text color on the surface color has a contrast of 4.47:1. It needs at least 4.5:1 to be readable",
      ],
      [
        "colorAccent",
        "The text color on the accent color has a contrast of 3.47:1. It needs at least 4.5:1 to be readable",
      ],
      [
        "colorForeground",
        "The small muted text on the background color has a contrast of 2.52:1. It needs at least 4.5:1 to be readable",
      ],
    ]);
  });

  test("refuses a contrast color the background cannot be read on", () => {
    expect(issuesOf({ colorContrast: "#f2f3f0" })).toEqual([
      [
        "colorContrast",
        "The background color, as text on the contrast color has a contrast of 1.00:1. It needs at least 4.5:1 to be readable",
      ],
      [
        "colorAccent",
        "The accent color, as a heading on the contrast color has a contrast of 1.15:1. It needs at least 3:1 to be readable",
      ],
      [
        "colorContrast",
        "The small muted text on the contrast color has a contrast of 1.00:1. It needs at least 4.5:1 to be readable",
      ],
    ]);
  });

  test.each([
    ["blank", "   ", "A name is required"],
    ["81 characters", "x".repeat(81), "Keep the name to 80 characters"],
  ])("refuses a %s name", (_case, name, message) => {
    expect(issuesOf({ name })).toEqual([["name", message]]);
  });

  test("accepts a name of exactly 80 characters", () => {
    expect(issuesOf({ name: "x".repeat(80) })).toEqual([]);
  });

  test.each([
    // Assembled, so the linter does not read the test itself as a script URL.
    ["a script URL", ["javascript", "alert(1)"].join(":")],
    ["plain http", "http://instagram.com/sample"],
    ["a bare handle", "@sample"],
    ["empty", ""],
  ])("refuses %s as a link", (_case, link) => {
    expect(issuesOf({ instagramUrl: link })).toEqual([
      ["instagramUrl", "Enter a full https:// link"],
    ]);
  });

  test("refuses a link longer than 2048 characters", () => {
    const link = `https://example.test/${"a".repeat(2028)}`;

    expect(issuesOf({ logoUrl: link })).toEqual([
      ["logoUrl", "Keep the link to 2048 characters"],
    ]);
  });

  test.each([
    ["a local number", "099123456"],
    ["a leading zero after the plus", "+0599123456"],
    ["seven digits", "+1234567"],
    ["sixteen digits", "+1234567890123456"],
    ["spaces inside", "+598 99 123 456"],
  ])("refuses a WhatsApp number written as %s", (_case, whatsappNumber) => {
    expect(issuesOf({ whatsappNumber })).toEqual([
      [
        "whatsappNumber",
        "Write the number in international format, such as +59899123456",
      ],
    ]);
  });

  test.each([
    ["the shortest", "+12345678"],
    ["the longest", "+123456789012345"],
  ])("accepts %s international number", (_case, whatsappNumber) => {
    expect(issuesOf({ whatsappNumber })).toEqual([]);
  });

  test("refuses a currency the product does not sell in", () => {
    expect(
      createStoreSchema.safeParse(makeStore({ currencyCode: "EUR" })).success
    ).toBe(false);
  });

  test.each([["UYU"], ["USD"]])("accepts %s", (currencyCode) => {
    expect(issuesOf({ currencyCode })).toEqual([]);
  });

  test("refuses two texts in the same language", () => {
    const text = { description: "Rings.", locale: "es", tagline: "Hola" };

    expect(issuesOf({ translations: [text, text] })).toEqual([
      ["translations", "Send each language at most once"],
    ]);
  });

  test("refuses a text in a language the product does not speak, or left blank", () => {
    expect(
      issuesOf({
        translations: [{ description: "", locale: "fr", tagline: "  " }],
      })
    ).toEqual([
      ["translations.0.description", "A description is required"],
      ["translations.0.locale", 'Invalid option: expected one of "es"|"en"'],
      ["translations.0.tagline", "A tagline is required"],
    ]);
  });

  test.each([
    ["tagline", 120, "Keep the tagline to 120 characters"],
    ["description", 600, "Keep the description to 600 characters"],
  ])("holds a %s to %i characters", (field, limit, message) => {
    const text = { description: "Rings.", locale: "es", tagline: "Hola" };

    expect(
      issuesOf({ translations: [{ ...text, [field]: "x".repeat(limit) }] })
    ).toEqual([]);
    expect(
      issuesOf({
        translations: [{ ...text, [field]: "x".repeat(limit + 1) }],
      })
    ).toEqual([[`translations.0.${field}`, message]]);
  });
});

describe("updateStoreSchema", () => {
  test("reads the id from a path segment, with the same fields as a create", () => {
    expect(updateStoreSchema.parse({ ...makeStore(), id: "7" })).toEqual({
      ...makeStore(),
      id: 7,
    });
  });

  test.each([["0"], ["-1"], ["1.5"], [""], ["abc"]])(
    "refuses %j as an id",
    (id) => {
      expect(updateStoreSchema.safeParse({ ...makeStore(), id }).success).toBe(
        false
      );
    }
  );

  test("checks the contrast of an edited palette too", () => {
    const result = updateStoreSchema.safeParse({
      ...makeStore({ colorSurface: "#7c7c7c" }),
      id: 7,
    });

    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "The text color on the surface color has a contrast of 4.46:1. It needs at least 4.5:1 to be readable",
    ]);
  });

  test("refuses a reserved address on an edit as on a create", () => {
    const result = updateStoreSchema.safeParse({
      ...makeStore({ slug: "api" }),
      id: 7,
    });

    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "That address is reserved by the app. Choose another one",
    ]);
  });
});
