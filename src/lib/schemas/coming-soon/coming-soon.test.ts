import { describe, expect, test } from "vitest";

import {
  type ComingSoonFormFields,
  type ComingSoonTextMessages,
  createComingSoonFormSchema,
  isCountdownDate,
  linesOf,
  setComingSoonPublishedSchema,
  updateComingSoonSchema,
} from ".";

/** One language's texts that pass every rule. */
function makeTexts(overrides: Record<string, unknown> = {}) {
  return {
    eyebrow: "Feria · 5 al 20 de diciembre",
    headline: "Abrimos\npronto",
    lead: "Te esperamos.",
    locale: "es",
    marquee: "Bijou\nBurbujas",
    ...overrides,
  };
}

/** Every issue of a refused page, as `[field, message]`. */
function issuesOf(input: Record<string, unknown>) {
  const result = updateComingSoonSchema.safeParse(input);

  return result.success
    ? []
    : result.error.issues.map((issue) => [issue.path.join("."), issue.message]);
}

const MESSAGES: ComingSoonTextMessages = {
  dateInvalid: "date",
  eyebrowTooLong: "eyebrow long",
  headlineTooLong: "headline long",
  headlineTooManyLines: "headline lines",
  leadTooLong: "lead long",
  marqueeTooLong: "band long",
  marqueeTooManyLines: "band lines",
};

function makeFields(
  overrides: Partial<ComingSoonFormFields> = {}
): ComingSoonFormFields {
  return {
    countdownTo: "",
    eyebrowEn: "",
    eyebrowEs: "",
    headlineEn: "",
    headlineEs: "",
    leadEn: "",
    leadEs: "",
    marqueeEn: "",
    marqueeEs: "",
    ...overrides,
  };
}

describe("linesOf", () => {
  test.each([
    ["", []],
    ["  \n \n", []],
    ["Muy", ["Muy"]],
    [" Muy \r\n\r\n pronto ", ["Muy", "pronto"]],
    ["a\rb\nc", ["a", "b", "c"]],
  ])("reads %j as the lines %j", (text, lines) => {
    expect(linesOf(text)).toEqual(lines);
  });
});

describe("isCountdownDate", () => {
  test.each([
    ["2026-12-05", true],
    ["2026-01-01", true],
    ["2100-12-31", true],
    // A day the calendar does not have.
    ["2026-02-31", false],
    ["2026-13-01", false],
    // Outside the years a countdown may name.
    ["2025-12-31", false],
    ["2101-01-01", false],
    // Not a day as an input sends it.
    ["2026-12-5", false],
    ["05/12/2026", false],
    ["2026-12-05T00:00", false],
    ["", false],
  ])("%s is a countdown day: %s", (value, valid) => {
    expect(isCountdownDate(value)).toBe(valid);
  });
});

describe("updateComingSoonSchema", () => {
  test("keeps the headline and the band as trimmed lines, the text under it as one paragraph", () => {
    expect(
      updateComingSoonSchema.parse({
        countdownTo: " 2026-12-20 ",
        translations: [
          makeTexts({
            eyebrow: " Feria \n del 5 ",
            headline: "  Abrimos \n\n  pronto  ",
            lead: " Te   esperamos\nen la feria. ",
            marquee: "Bijou \r\n\r\n Burbujas",
          }),
        ],
      })
    ).toEqual({
      countdownTo: "2026-12-20",
      translations: [
        {
          eyebrow: "Feria del 5",
          headline: "Abrimos\npronto",
          lead: "Te esperamos en la feria.",
          locale: "es",
          marquee: "Bijou\nBurbujas",
        },
      ],
    });
  });

  test("a text that is blank once trimmed is null: the page says the dictionary's", () => {
    expect(
      updateComingSoonSchema.parse({
        countdownTo: null,
        translations: [
          makeTexts({
            eyebrow: "  ",
            headline: " \n ",
            lead: "   ",
            marquee: null,
          }),
        ],
      }).translations
    ).toEqual([
      {
        eyebrow: null,
        headline: null,
        lead: null,
        locale: "es",
        marquee: null,
      },
    ]);
  });

  test.each([
    ["eyebrow", "x".repeat(80), "y".repeat(81)],
    ["headline", "x".repeat(50), "y".repeat(51)],
    ["lead", "x".repeat(240), "y".repeat(241)],
    ["marquee", "x".repeat(120), "y".repeat(121)],
  ])(
    "%s takes its limit and refuses one character more",
    (field, fits, over) => {
      expect(
        issuesOf({
          countdownTo: null,
          translations: [makeTexts({ [field]: fits })],
        })
      ).toEqual([]);
      expect(
        issuesOf({
          countdownTo: null,
          translations: [makeTexts({ [field]: over })],
        })
      ).toEqual([
        [
          `translations.0.${field}`,
          {
            eyebrow: "Keep the line over the headline to 80 characters",
            headline: "Keep the headline to 50 characters",
            lead: "Keep the text to 240 characters",
            marquee: "Keep the band to 120 characters",
          }[field],
        ],
      ]);
    }
  );

  test.each([
    ["headline", "a\nb", "a\nb\nc", "Keep the headline to 2 lines"],
    ["marquee", "a\nb\nc\nd", "a\nb\nc\nd\ne", "Keep the band to 4 phrases"],
  ])(
    "%s takes its lines and refuses one more",
    (field, fits, over, message) => {
      expect(
        issuesOf({
          countdownTo: null,
          translations: [makeTexts({ [field]: fits })],
        })
      ).toEqual([]);
      expect(
        issuesOf({
          countdownTo: null,
          translations: [makeTexts({ [field]: over })],
        })
      ).toEqual([[`translations.0.${field}`, message]]);
    }
  );

  test("the text under the headline is a paragraph: its line breaks are not counted as lines", () => {
    expect(
      issuesOf({
        countdownTo: null,
        translations: [makeTexts({ lead: "a\nb\nc\nd\ne\nf" })],
      })
    ).toEqual([]);
  });

  test("refuses a day the calendar does not have", () => {
    expect(issuesOf({ countdownTo: "2026-02-31", translations: [] })).toEqual([
      ["countdownTo", "Enter a real day between 2026 and 2100, as YYYY-MM-DD"],
    ]);
  });

  test("refuses a language sent twice, and a language it does not speak", () => {
    expect(
      issuesOf({
        countdownTo: null,
        translations: [makeTexts(), makeTexts()],
      })
    ).toEqual([["translations", "Send each language at most once"]]);
    expect(
      issuesOf({
        countdownTo: null,
        translations: [makeTexts({ locale: "fr" })],
      })
    ).toEqual([
      ["translations.0.locale", 'Invalid option: expected one of "es"|"en"'],
    ]);
  });

  test("has no switch: saving texts can never publish or hide the page", () => {
    expect(
      updateComingSoonSchema.parse({
        countdownTo: null,
        published: false,
        translations: [],
      })
    ).toEqual({ countdownTo: null, translations: [] });
  });
});

describe("setComingSoonPublishedSchema", () => {
  test.each([true, false])("takes published: %s", (published) => {
    expect(setComingSoonPublishedSchema.parse({ published })).toEqual({
      published,
    });
  });

  test("refuses anything but a boolean", () => {
    expect(
      setComingSoonPublishedSchema.safeParse({ published: "true" }).success
    ).toBe(false);
  });
});

describe("createComingSoonFormSchema", () => {
  test("sends both languages and the day, blank fields as null", () => {
    expect(
      createComingSoonFormSchema(MESSAGES).parse(
        makeFields({
          countdownTo: "2026-12-20",
          eyebrowEs: "Feria · del 20",
          headlineEs: "Abrimos\npronto",
          leadEn: " We open soon. ",
          marqueeEn: "Jewelry",
        })
      )
    ).toEqual({
      countdownTo: "2026-12-20",
      translations: [
        {
          eyebrow: "Feria · del 20",
          headline: "Abrimos\npronto",
          lead: null,
          locale: "es",
          marquee: null,
        },
        {
          eyebrow: null,
          headline: null,
          lead: "We open soon.",
          locale: "en",
          marquee: "Jewelry",
        },
      ],
    });
  });

  test("a blank day is null: the countdown goes to the fair", () => {
    expect(
      createComingSoonFormSchema(MESSAGES).parse(
        makeFields({ countdownTo: "  " })
      ).countdownTo
    ).toBeNull();
  });

  test.each([
    ["countdownTo", "2026-02-31", "date"],
    ["eyebrowEn", "x".repeat(81), "eyebrow long"],
    ["headlineEs", "a\nb\nc", "headline lines"],
    ["headlineEn", "x".repeat(51), "headline long"],
    ["leadEs", "x".repeat(241), "lead long"],
    ["marqueeEn", "x".repeat(121), "band long"],
    ["marqueeEs", "a\nb\nc\nd\ne", "band lines"],
  ] as const)(
    "says %s's refusal in the page's words",
    (field, value, message) => {
      const result = createComingSoonFormSchema(MESSAGES).safeParse(
        makeFields({ [field]: value })
      );

      expect(
        result.success
          ? []
          : result.error.issues.map((issue) => [
              issue.path.join("."),
              issue.message,
            ])
      ).toEqual([[field, message]]);
    }
  );
});
