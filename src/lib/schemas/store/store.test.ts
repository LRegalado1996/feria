import { describe, expect, test } from "vitest";

import {
  createStoreSettingsFormSchema,
  STORE_CURRENCIES,
  type StoreSettingsFormFields,
  updateStoreSchema,
} from ".";

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

  test("drops a key it does not know: an id, the currency (fixed per store), or what the store no longer holds", () => {
    const parsed = updateStoreSchema.parse(
      makeStore({
        colorAccent: "#ff0000",
        currencyCode: "USD",
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

  test("takes where to find the store with a text, trimmed, a blank one as none; left out, it stays left out (FER-078)", () => {
    const text = { description: "Rings.", locale: "es", tagline: "Hola" };
    const locationOf = (location?: string | null) =>
      updateStoreSchema.parse(
        makeStore({
          translations: [location === undefined ? text : { ...text, location }],
        })
      ).translations[0];

    expect(locationOf("  Feria del Parque · Puesto 12 ")).toEqual({
      ...text,
      location: "Feria del Parque · Puesto 12",
    });
    expect(locationOf("   ")).toEqual({ ...text, location: null });
    expect(locationOf(null)).toEqual({ ...text, location: null });
    // A tab opened before the field existed names none: the service then
    // keeps the stored one.
    expect(locationOf()).toEqual(text);
  });

  test("holds where to find the store to 200 characters", () => {
    const text = { description: "Rings.", locale: "es", tagline: "Hola" };

    expect(
      issuesOf({ translations: [{ ...text, location: "x".repeat(200) }] })
    ).toEqual([]);
    expect(
      issuesOf({ translations: [{ ...text, location: "x".repeat(201) }] })
    ).toEqual([
      ["translations.0.location", "Keep the location to 200 characters"],
    ]);
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

/** Each message the settings form shows, named after itself. */
const FORM_MESSAGES = {
  descriptionRequired: "descriptionRequired",
  descriptionTooLong: "descriptionTooLong",
  instagramInvalid: "instagramInvalid",
  linkTooLong: "linkTooLong",
  locationTooLong: "locationTooLong",
  nameRequired: "nameRequired",
  nameTooLong: "nameTooLong",
  taglineRequired: "taglineRequired",
  taglineTooLong: "taglineTooLong",
  tiktokInvalid: "tiktokInvalid",
  whatsappInvalid: "whatsappInvalid",
};

/** The settings form's fields, as typed, every rule passing. */
function makeFields(
  overrides: Partial<StoreSettingsFormFields> = {}
): StoreSettingsFormFields {
  return {
    descriptionEn: "Rings and chains.",
    descriptionEs: "Anillos y cadenas.",
    instagramUrl: "https://instagram.com/sample",
    locationEn: "",
    locationEs: "",
    name: "Sample Store",
    taglineEn: "Hello",
    taglineEs: "Hola",
    tiktokUrl: "",
    whatsappNumber: "+59899123456",
    ...overrides,
  };
}

function parseForm(overrides: Partial<StoreSettingsFormFields>) {
  return createStoreSettingsFormSchema(FORM_MESSAGES).safeParse(
    makeFields(overrides)
  );
}

/** Every issue of a refused form, as `[field, message]`. */
function formIssuesOf(overrides: Partial<StoreSettingsFormFields>) {
  const result = parseForm(overrides);

  return result.success
    ? []
    : result.error.issues.map((issue) => [issue.path.join("."), issue.message]);
}

/** The WhatsApp number the form sends for `typed`. */
function whatsappOf(typed: string) {
  const result = parseForm({ whatsappNumber: typed });

  return result.success ? result.data.whatsappNumber : "refused";
}

describe("createStoreSettingsFormSchema", () => {
  test("sends what store.update takes: trimmed, texts in both languages, a blank link as null", () => {
    expect(
      createStoreSettingsFormSchema(FORM_MESSAGES).parse(
        makeFields({
          descriptionEn: " Rings and chains. ",
          instagramUrl: " https://instagram.com/sample ",
          name: "  Sample Store ",
          taglineEs: " Hola ",
          tiktokUrl: "   ",
          whatsappNumber: " 099 123 456 ",
        })
      )
    ).toEqual({
      instagramUrl: "https://instagram.com/sample",
      name: "Sample Store",
      tiktokUrl: null,
      translations: [
        {
          description: "Anillos y cadenas.",
          locale: "es",
          location: null,
          tagline: "Hola",
        },
        {
          description: "Rings and chains.",
          locale: "en",
          location: null,
          tagline: "Hello",
        },
      ],
      whatsappNumber: "+59899123456",
    });
  });

  test("sends where to find the store in each language, trimmed, a blank one as none (FER-078)", () => {
    const sent = createStoreSettingsFormSchema(FORM_MESSAGES).parse(
      makeFields({
        locationEn: "   ",
        locationEs: "  Feria del Parque · Puesto 12 ",
      })
    );

    expect(
      sent.translations.map(({ locale, location }) => [locale, location])
    ).toEqual([
      ["es", "Feria del Parque · Puesto 12"],
      ["en", null],
    ]);
  });

  test("what it sends is what the API accepts, as it is", () => {
    const sent = createStoreSettingsFormSchema(FORM_MESSAGES).parse(
      makeFields({ tiktokUrl: "https://tiktok.com/@sample" })
    );

    expect(updateStoreSchema.parse(sent)).toEqual(sent);
  });

  test.each([
    ["a Uruguayan mobile with its leading 0", "099 123 456", "+59899123456"],
    [
      "the country code and the leading 0 together",
      "+598 099 123 456",
      "+59899123456",
    ],
    ["a Uruguayan mobile without it", "99 123 456", "+59899123456"],
    ["dashes and dots", "099-123.456", "+59899123456"],
    ["parentheses and spaces", "+598 (99) 123 456", "+59899123456"],
    ["00 for the plus", "00598 99 123 456", "+59899123456"],
    ["another country, with its code", "+54 9 11 1234 5678", "+5491112345678"],
    ["E.164 already", "+59899123456", "+59899123456"],
    ["the shortest international number", "+12345678", "+12345678"],
    ["the longest", "+123456789012345", "+123456789012345"],
    ["blank: no WhatsApp", "", null],
    ["only spaces: no WhatsApp", "   ", null],
  ])("reads %s as %s", (_case, typed, sent) => {
    expect(whatsappOf(typed)).toBe(sent);
  });

  test.each([
    ["seven digits after the plus", "+1234567"],
    ["sixteen digits after the plus", "+1234567890123456"],
    ["a country code that starts with 0", "+0598991234567"],
    ["a local mobile a digit short", "099 123 45"],
    ["a local mobile a digit long", "099 123 4567"],
    ["a Uruguayan landline in local form", "2 123 4567"],
    ["letters", "noventa y nueve"],
    ["a plus alone", "+"],
  ])("refuses %s, under the field", (_case, typed) => {
    expect(formIssuesOf({ whatsappNumber: typed })).toEqual([
      ["whatsappNumber", "whatsappInvalid"],
    ]);
  });

  test("reads a number typed in up to 30 characters, and refuses a longer one", () => {
    // The same number, with spaces inside to make up the length.
    const typed = (length: number) =>
      `+598${" ".repeat(length - "+59899123456".length)}99123456`;

    expect(typed(30)).toHaveLength(30);
    expect(whatsappOf(typed(30))).toBe("+59899123456");
    expect(formIssuesOf({ whatsappNumber: typed(31) })).toEqual([
      ["whatsappNumber", "whatsappInvalid"],
    ]);
  });

  test.each([
    ["name", "   ", "nameRequired"],
    ["name", "x".repeat(81), "nameTooLong"],
    ["taglineEs", " ", "taglineRequired"],
    ["taglineEn", "", "taglineRequired"],
    ["taglineEs", "x".repeat(121), "taglineTooLong"],
    ["descriptionEs", "", "descriptionRequired"],
    ["descriptionEn", "  ", "descriptionRequired"],
    ["descriptionEn", "x".repeat(601), "descriptionTooLong"],
    ["locationEs", "x".repeat(201), "locationTooLong"],
    ["locationEn", "x".repeat(201), "locationTooLong"],
    ["instagramUrl", "instagram.com/sample", "instagramInvalid"],
    ["instagramUrl", "https://tiktok.com/@sample", "instagramInvalid"],
    ["tiktokUrl", "http://tiktok.com/@sample", "tiktokInvalid"],
    [
      "tiktokUrl",
      `https://tiktok.com/${"a".repeat(2049 - "https://tiktok.com/".length)}`,
      "linkTooLong",
    ],
  ] as const)("refuses %s %j with its own message", (field, typed, message) => {
    expect(formIssuesOf({ [field]: typed })).toEqual([[field, message]]);
  });

  test.each([
    ["name", "x".repeat(80)],
    ["taglineEs", "x".repeat(120)],
    ["descriptionEn", "x".repeat(600)],
    ["locationEs", "x".repeat(200)],
    [
      "tiktokUrl",
      `https://tiktok.com/${"a".repeat(2048 - "https://tiktok.com/".length)}`,
    ],
  ] as const)("accepts %s at its limit", (field, typed) => {
    expect(formIssuesOf({ [field]: typed })).toEqual([]);
  });
});
