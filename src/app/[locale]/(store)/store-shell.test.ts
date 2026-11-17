import { describe, expect, test, vi } from "vitest";

import type { PublicStore } from "@/server/services/store";
import { holdRequest, settle } from "@/test/connection";

import { announcementOf, shellOf, streamedShell } from "./store-shell";

const { connection, readCategories, readStore } = vi.hoisted(() => ({
  connection: vi.fn(async () => undefined),
  readCategories: vi.fn(async (_store: { id: number }, locale: string) => [
    { lang: locale, name: `anillos-${locale}`, slug: "anillos" },
  ]),
  readStore: vi.fn<() => Promise<PublicStore | null>>(),
}));

vi.mock("next/server", () => ({ connection }));

vi.mock("server-only", () => ({}));

// The cached reads have their own tests; here they answer what the test says.
vi.mock("@/server/cache/store", () => ({ readStore }));

vi.mock("@/server/cache/catalog", () => ({ readCategories }));

const SPANISH = {
  description: "Anillos y cadenas.",
  locale: "es",
  tagline: "Burbujeros y joyas en la feria",
} as const;
const ENGLISH = {
  description: "Rings and chains.",
  locale: "en",
  tagline: "Bubble guns and jewelry at the fair",
} as const;

function makeStore(overrides: Partial<PublicStore> = {}): PublicStore {
  return {
    currencyCode: "UYU",
    id: 7,
    instagramUrl: null,
    name: "LR Market",
    tiktokUrl: null,
    translations: [SPANISH, ENGLISH],
    whatsappNumber: null,
    ...overrides,
  };
}

/** The bar's words in each language, as Lucas wrote them (FER-039). */
const ANNOUNCEMENT = {
  en: {
    lang: "en",
    short: "Paseo Prado Fair · Stall 86",
    text: "See you at the Paseo Prado Fair from December 5 to January 5, stall 86",
  },
  es: {
    lang: "es",
    short: "Feria Paseo Prado · Puesto 86",
    text: "Te esperamos en la Feria Paseo Prado del 5 de diciembre al 5 de enero, puesto 86",
  },
} as const;

/**
 * The store `readStore` answers, or none when its row is `missing` (a
 * database whose migrations have not run); `held` keeps the request from
 * arriving until `arrive()`.
 */
function setup({
  held = false,
  missing = false,
}: { held?: boolean; missing?: boolean } = {}) {
  const store = makeStore();
  readStore.mockResolvedValue(missing ? null : store);
  const request = held ? holdRequest(connection) : null;

  return {
    arrive: () => {
      request?.arrive();
    },
    store,
  };
}

describe("announcementOf", () => {
  test.each(["es", "en"] as const)(
    "says the fair and the stall in %s, the page's language, with a phone's version, not the store's tagline",
    (locale) => {
      const announcement = announcementOf(locale);

      expect(announcement).toEqual(ANNOUNCEMENT[locale]);
      expect(announcement.text).not.toBe(
        locale === "es" ? SPANISH.tagline : ENGLISH.tagline
      );
    }
  );
});

describe("streamedShell", () => {
  test("reads the store only once a request is there, then its categories; the bar needs no read", async () => {
    const { arrive, store } = setup({ held: true });

    const shell = streamedShell("en");
    await settle();

    expect(connection).toHaveBeenCalledExactlyOnceWith();
    expect(readStore).not.toHaveBeenCalled();
    expect(readCategories).not.toHaveBeenCalled();
    // The bar's words are there while the request is still held.
    await expect(
      Promise.race([shell.announcement, settle().then(() => "still waiting")])
    ).resolves.toEqual(ANNOUNCEMENT.en);

    arrive();

    await expect(shell.categories).resolves.toEqual([
      { lang: "en", name: "anillos-en", slug: "anillos" },
    ]);
    expect(readStore).toHaveBeenCalledExactlyOnceWith();
    expect(readCategories).toHaveBeenCalledExactlyOnceWith(store, "en");
  });

  test("shows the bar but no category before the store's row exists", async () => {
    setup({ missing: true });

    const shell = streamedShell("es");

    await expect(shell.announcement).resolves.toEqual(ANNOUNCEMENT.es);
    await expect(shell.categories).resolves.toEqual([]);
    expect(readCategories).not.toHaveBeenCalled();
  });
});

describe("shellOf", () => {
  test("from a store already read, the fixed announcement and its cached categories", async () => {
    const { store } = setup();

    const shell = shellOf(store, "es");

    await expect(shell.announcement).resolves.toEqual(ANNOUNCEMENT.es);
    await expect(shell.categories).resolves.toEqual([
      { lang: "es", name: "anillos-es", slug: "anillos" },
    ]);
    expect(readCategories).toHaveBeenCalledExactlyOnceWith(store, "es");
    expect(readStore).not.toHaveBeenCalled();
    expect(connection).not.toHaveBeenCalled();
  });
});
