import { describe, expect, test } from "vitest";

import { STORE_CURRENCIES, updateStoreSchema } from ".";

// The store's colors are code now, with their contrast rules in
// `src/styles/theme.test.ts`; its address, its logo and the default mark are
// gone (FER-038). What is left is what a person sets in the admin.

const INSTAGRAM_MESSAGE =
  "Enter a full link, such as https://instagram.com/my-store";

/** A store that passes every rule. */
function makeStore(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    currencyCode: "UYU",
    instagramUrl: null,
    name: "Sample Store",
    tiktokUrl: null,
    translations: [],
    whatsappNumber: null,
    ...overrides,
  };
}

/** Every issue of a refused store, as `[field, message]`. */
function issuesOf(overrides: Record<string, unknown>) {
  const result = updateStoreSchema.safeParse(makeStore(overrides));

  return result.success
    ? []
    : result.error.issues.map((issue) => [issue.path.join("."), issue.message]);
}

describe("updateStoreSchema", () => {
  test("accepts a complete store and returns it as it will be stored", () => {
    const store = makeStore({
      instagramUrl: "https://instagram.com/sample",
      name: "  Sample Store ",
      tiktokUrl: "https://tiktok.com/@sample",
      translations: [
        { description: " Rings and chains. ", locale: "es", tagline: " Hola " },
        { description: "Rings and chains.", locale: "en", tagline: "Hello" },
      ],
      whatsappNumber: " +59899123456 ",
    });

    expect(updateStoreSchema.parse(store)).toEqual({
      ...store,
      name: "Sample Store",
      translations: [
        { description: "Rings and chains.", locale: "es", tagline: "Hola" },
        { description: "Rings and chains.", locale: "en", tagline: "Hello" },
      ],
      whatsappNumber: "+59899123456",
    });
  });

  test("drops a key it does not know: an id, or what the store no longer holds", () => {
    const parsed = updateStoreSchema.parse(
      makeStore({
        colorAccent: "#ff0000",
        createdAt: "2020-01-01",
        id: 99,
        isActive: false,
        isDefault: true,
        logoUrl: "https://images.example.test/logo.png",
        slug: "another-store",
      })
    );

    expect(parsed).toEqual(makeStore());
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
    ["another site", "https://example.test/instagram.com"],
    [
      "a host that only starts like Instagram's",
      "https://instagram.com.example.test/sample",
    ],
    [
      "Instagram as a user name in front of another host",
      "https://instagram.com@example.test/login",
    ],
    ["a port", "https://instagram.com:8443/sample"],
    ["a tab a browser would drop", "https:\t//instagram.com/sample"],
    ["backslashes for slashes", "https:\\\\instagram.com\\sample"],
    [
      "a user name and password",
      "https://user:synthetic-secret@instagram.com/sample",
    ],
    ["only a user name", "https://user@instagram.com/sample"],
    ["only a password", "https://:synthetic-secret@instagram.com/sample"],
    // A browser drops the tab and then reads the user name.
    [
      "a user name hidden behind a tab",
      "https:\t//user:synthetic-secret@instagram.com/sample",
    ],
    ["a line break inside", "https://instagram.com/sam\nple"],
    ["a space inside", "https://instagram.com/my sample"],
  ])("refuses %s as the Instagram link", (_case, link) => {
    expect(issuesOf({ instagramUrl: link })).toEqual([
      ["instagramUrl", INSTAGRAM_MESSAGE],
    ]);
  });

  test.each([
    ["instagramUrl", "https://instagram.com/sample"],
    ["instagramUrl", "https://www.instagram.com/sample/?hl=es"],
    ["tiktokUrl", "https://tiktok.com/@sample"],
    ["tiktokUrl", "https://www.tiktok.com/@sample"],
  ])("accepts %s %s, trimmed", (field, link) => {
    const parsed = updateStoreSchema.parse(makeStore({ [field]: ` ${link} ` }));

    expect(parsed[field as "instagramUrl"]).toBe(link);
  });

  test.each([
    ["an Instagram link", "https://instagram.com/sample"],
    ["plain http", "http://tiktok.com/@sample"],
  ])("refuses %s as the TikTok link", (_case, link) => {
    expect(issuesOf({ tiktokUrl: link })).toEqual([
      ["tiktokUrl", "Enter a full link, such as https://tiktok.com/@my-store"],
    ]);
  });

  test("holds a link to 2048 characters", () => {
    const at = (length: number) =>
      `https://instagram.com/${"a".repeat(length - "https://instagram.com/".length)}`;

    expect(issuesOf({ instagramUrl: at(2048) })).toEqual([]);
    expect(issuesOf({ instagramUrl: at(2049) })).toEqual([
      ["instagramUrl", "Keep the link to 2048 characters"],
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

  test("sells in pesos or dollars, pesos first", () => {
    expect(STORE_CURRENCIES).toEqual(["UYU", "USD"]);
  });

  test("refuses a currency the product does not sell in", () => {
    expect(
      updateStoreSchema.safeParse(makeStore({ currencyCode: "EUR" })).success
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
