import { describe, expect, test, vi } from "vitest";

import {
  APP_TIME_ZONE,
  formatDate,
  formatInteger,
  formatPrice,
  formatRelativeTime,
  fromPlainNumberText,
  toPlainNumberText,
} from "./format";

const NOW = new Date("2024-06-15T12:00:00Z").getTime();
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Intl separates a currency from its amount with a no-break space, so a price
// never wraps in the middle.
const NBSP = "\u00A0";

describe("time zone", () => {
  test("is the store's, Montevideo", () => {
    expect(APP_TIME_ZONE).toBe("America/Montevideo");
  });
});

describe("formatRelativeTime", () => {
  // Each unit's threshold is pinned from both sides, in both languages.
  test.each([
    [0, "now", "ahora"],
    [30 * SECOND, "30 seconds ago", "hace 30 segundos"],
    [59 * SECOND, "59 seconds ago", "hace 59 segundos"],
    [60 * SECOND, "1 minute ago", "hace 1 minuto"],
    [90 * SECOND, "1 minute ago", "hace 1 minuto"],
    [59 * MINUTE, "59 minutes ago", "hace 59 minutos"],
    [60 * MINUTE, "1 hour ago", "hace 1 hora"],
    [23 * HOUR, "23 hours ago", "hace 23 horas"],
    [DAY, "yesterday", "ayer"],
    [2 * DAY, "2 days ago", "anteayer"],
    [6 * DAY, "6 days ago", "hace 6 días"],
    [7 * DAY, "last week", "la semana pasada"],
    [30 * DAY, "4 weeks ago", "hace 4 semanas"],
    [31 * DAY, "last month", "el mes pasado"],
    [60 * DAY, "2 months ago", "hace 2 meses"],
    [364 * DAY, "12 months ago", "hace 12 meses"],
    [366 * DAY, "last year", "el año pasado"],
  ])(
    "a date %i ms before now reads %j in English and %j in Spanish",
    (ageMs, english, spanish) => {
      const date = new Date(NOW - ageMs);

      expect(formatRelativeTime(date, NOW, "en")).toBe(english);
      expect(formatRelativeTime(date, NOW, "es")).toBe(spanish);
    }
  );

  test.each([
    ["en", "now"],
    ["es", "ahora"],
  ] as const)(
    "a date ahead of now reads now in %s, never a future time",
    (locale, expected) => {
      expect(formatRelativeTime(new Date(NOW + 45 * SECOND), NOW, locale)).toBe(
        expected
      );
    }
  );

  test("reads the instant it is given, not the machine clock", () => {
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));

    expect(formatRelativeTime(new Date(NOW), NOW + 10 * MINUTE, "en")).toBe(
      "10 minutes ago"
    );
  });
});

describe("formatPrice", () => {
  test.each([
    // Round amounts show no cents, in either currency.
    [129_000, "UYU", `$${NBSP}1.290`, `UYU${NBSP}1,290`],
    [1200, "USD", `US$${NBSP}12`, `USD${NBSP}12`],
    [100, "USD", `US$${NBSP}1`, `USD${NBSP}1`],
    [0, "UYU", `$${NBSP}0`, `UYU${NBSP}0`],
    // An amount with cents shows both digits: never rounded away.
    [1250, "USD", `US$${NBSP}12,50`, `USD${NBSP}12.50`],
    [99, "USD", `US$${NBSP}0,99`, `USD${NBSP}0.99`],
    [5, "USD", `US$${NBSP}0,05`, `USD${NBSP}0.05`],
    [129_050, "UYU", `$${NBSP}1.290,50`, `UYU${NBSP}1,290.50`],
    [123_456_789, "UYU", `$${NBSP}1.234.567,89`, `UYU${NBSP}1,234,567.89`],
    [-1250, "USD", `-US$${NBSP}12,50`, `-USD${NBSP}12.50`],
  ] as const)(
    "%i minor units of %s read %j in Spanish and %j in English",
    (amount, currency, spanish, english) => {
      expect(formatPrice(amount, currency, "es")).toBe(spanish);
      expect(formatPrice(amount, currency, "en")).toBe(english);
    }
  );
});

describe("formatInteger", () => {
  test.each([
    [0, "0", "0"],
    [128, "128", "128"],
    // es-UY groups from four digits on; a locale that waits for five would
    // print 1280.
    [1280, "1.280", "1,280"],
    [1_234_567, "1.234.567", "1,234,567"],
    [-1280, "-1.280", "-1,280"],
    // A count has no fraction: both sides of the half.
    [12.4, "12", "12"],
    [12.6, "13", "13"],
  ] as const)(
    "%d reads %j in Spanish and %j in English",
    (value, spanish, english) => {
      expect(formatInteger(value, "es")).toBe(spanish);
      expect(formatInteger(value, "en")).toBe(english);
    }
  );
});

describe("formatDate", () => {
  test.each([
    // 02:30 UTC is still the evening before in Montevideo (UTC-3)...
    ["2026-12-05T02:30:00Z", "4 de diciembre de 2026", "December 4, 2026"],
    // ...and 03:00 UTC is its midnight: the day turns there, not at UTC's.
    ["2026-12-05T03:00:00Z", "5 de diciembre de 2026", "December 5, 2026"],
    ["2026-07-01T15:05:00Z", "1 de julio de 2026", "July 1, 2026"],
  ])(
    "%s is %j in Spanish and %j in English, on Montevideo's calendar",
    (iso, spanish, english) => {
      expect(formatDate(new Date(iso), "es")).toBe(spanish);
      expect(formatDate(new Date(iso), "en")).toBe(english);
    }
  );
});

describe("toPlainNumberText", () => {
  test.each([
    ["1,500", "1500"],
    ["1,500.25", "1500.25"],
    ["1,234,567", "1234567"],
    ["-0.5", "-0.5"],
    ["12", "12"],
    ["", ""],
  ])("reads the English %j as %j", (typed, plain) => {
    expect(toPlainNumberText(typed, "en")).toBe(plain);
  });

  test.each([
    ["1.500", "1500"],
    ["1.500,25", "1500.25"],
    ["1.234.567", "1234567"],
    ["-0,5", "-0.5"],
    ["12", "12"],
    ["", ""],
  ])("reads the Spanish %j as %j", (typed, plain) => {
    expect(toPlainNumberText(typed, "es")).toBe(plain);
  });
});

describe("fromPlainNumberText", () => {
  test.each([
    ["1500.25", "1500,25", "1500.25"],
    ["-0.5", "-0,5", "-0.5"],
    // Text still being typed keeps its dangling separator or sign.
    ["1.", "1,", "1."],
    ["-", "-", "-"],
    ["12", "12", "12"],
    ["", "", ""],
  ])(
    "writes %j as %j in Spanish and %j in English",
    (plain, spanish, english) => {
      expect(fromPlainNumberText(plain, "es")).toBe(spanish);
      expect(fromPlainNumberText(plain, "en")).toBe(english);
    }
  );

  test.each(["es", "en"] as const)(
    "what it writes in %s, toPlainNumberText reads back",
    (locale) => {
      expect(
        toPlainNumberText(fromPlainNumberText("-1234.5", locale), locale)
      ).toBe("-1234.5");
    }
  );
});

describe("formatter cache", () => {
  test("builds a formatter once per language and reuses it", async () => {
    // A fresh copy of the module, so its cache starts empty for this test.
    vi.resetModules();
    const construct = vi.spyOn(Intl, "DateTimeFormat");
    const fresh = await import("./format");
    const date = new Date("2026-12-05T02:30:00Z");

    fresh.formatDate(date, "es");
    fresh.formatDate(date, "es");
    fresh.formatDate(date, "en");
    fresh.formatDate(date, "en");

    expect(construct.mock.calls).toEqual([
      ["es-UY", { dateStyle: "long", timeZone: "America/Montevideo" }],
      ["en-US", { dateStyle: "long", timeZone: "America/Montevideo" }],
    ]);
  });
});
