import { describe, expect, test, vi } from "vitest";

import type { PublicStore } from "@/server/services/store";
import { holdRequest, settle } from "@/test/connection";

import { announcementOf, shellOf, streamedShell } from "./store-shell";

const { connection, readCategories, readStore } = vi.hoisted(() => ({
  connection: vi.fn(async () => undefined),
  // One the header shows, one the admin took out of it (FER-051).
  readCategories: vi.fn(async (_store: { id: number }, locale: string) => [
    {
      id: 1,
      lang: locale,
      name: `anillos-${locale}`,
      parentId: null,
      path: "/anillos",
      showInHeader: true,
      slug: "anillos",
    },
    {
      id: 2,
      lang: locale,
      name: `relojes-${locale}`,
      parentId: null,
      path: "/relojes",
      showInHeader: false,
      slug: "relojes",
    },
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
    const store = makeStore();
    readStore.mockResolvedValue(store);
    const request = holdRequest(connection);

    const shell = streamedShell("en");
    await settle();

    expect(connection).toHaveBeenCalledExactlyOnceWith();
    expect(readStore).not.toHaveBeenCalled();
    expect(readCategories).not.toHaveBeenCalled();

    request.arrive();

    await expect(shell.announcement).resolves.toEqual(ANNOUNCEMENT.en);
    // Only those the header shows (FER-051).
    await expect(shell.categories).resolves.toEqual([
      {
        id: 1,
        lang: "en",
        name: "anillos-en",
        parentId: null,
        path: "/anillos",
        showInHeader: true,
        slug: "anillos",
      },
    ]);
    expect(readStore).toHaveBeenCalledExactlyOnceWith();
    expect(readCategories).toHaveBeenCalledExactlyOnceWith(store, "en");
  });

  test("shows the bar but no category before the store's row exists", async () => {
    readStore.mockResolvedValue(null);

    const shell = streamedShell("es");

    await expect(shell.announcement).resolves.toEqual(ANNOUNCEMENT.es);
    await expect(shell.categories).resolves.toEqual([]);
    expect(readCategories).not.toHaveBeenCalled();
  });
});

describe("shellOf", () => {
  test("from a store already read, the fixed announcement and its cached categories, read before it answers", async () => {
    const store = makeStore();

    const shell = await shellOf(store, "es");

    await expect(shell.announcement).resolves.toEqual(ANNOUNCEMENT.es);
    // The list itself, not a promise of it: the header renders it in place,
    // behind no boundary, in the first response (FER-043).
    // Only those the header shows (FER-051).
    expect(shell.categories).toEqual([
      {
        id: 1,
        lang: "es",
        name: "anillos-es",
        parentId: null,
        path: "/anillos",
        showInHeader: true,
        slug: "anillos",
      },
    ]);
    expect(readCategories).toHaveBeenCalledExactlyOnceWith(store, "es");
    expect(readStore).not.toHaveBeenCalled();
    expect(connection).not.toHaveBeenCalled();
  });

  test("from a page that read its categories as of now, those, reading no cached list (FER-043)", async () => {
    const aros = {
      id: 4,
      lang: "es",
      name: "Aros",
      parentId: null,
      path: "/aros",
      showInHeader: true,
      slug: "aros",
    };
    const own = [aros, { ...aros, id: 5, showInHeader: false, slug: "x" }];

    const shell = await shellOf(makeStore(), "es", own);

    // Those the header shows (FER-051).
    expect(shell.categories).toEqual([aros]);
    expect(readCategories).not.toHaveBeenCalled();
  });
});
