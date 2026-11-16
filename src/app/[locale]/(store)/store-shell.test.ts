import { describe, expect, test, vi } from "vitest";

import type { PublicStore } from "@/server/services/store";

import { announcementOf, shellOf, streamedShell } from "./store-shell";

const { connection, readCategories, readStore } = vi.hoisted(() => ({
  connection: vi.fn(async () => undefined),
  readCategories: vi.fn(async (_store: { id: number }, locale: string) => [
    { lang: locale, name: `anillos-${locale}`, slug: "anillos" },
  ]),
  readStore: vi.fn<() => Promise<PublicStore | null>>(),
}));

vi.mock("next/server", () => ({ connection }));

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

describe("announcementOf", () => {
  test.each([
    ["es", SPANISH.tagline],
    ["en", ENGLISH.tagline],
  ] as const)(
    "says the store's tagline in %s, the page's language",
    (locale, text) => {
      expect(announcementOf(makeStore(), locale)).toEqual({
        lang: locale,
        text,
      });
    }
  );

  test("says the Spanish tagline, marked as Spanish, on an English page of a store written in Spanish only", () => {
    expect(
      announcementOf(makeStore({ translations: [SPANISH] }), "en")
    ).toEqual({ lang: "es", text: SPANISH.tagline });
  });

  test.each([
    ["no texts", []],
    ["a blank tagline", [{ ...SPANISH, tagline: "  " }]],
  ])("says nothing for a store with %s", (_case, translations) => {
    expect(announcementOf(makeStore({ translations }), "es")).toBeNull();
  });
});

describe("streamedShell", () => {
  test("reads the store only once a request is there, then its tagline and its categories", async () => {
    const store = makeStore();
    readStore.mockResolvedValue(store);

    const shell = streamedShell("en");

    await expect(shell.announcement).resolves.toEqual({
      lang: "en",
      text: ENGLISH.tagline,
    });
    await expect(shell.categories).resolves.toEqual([
      { lang: "en", name: "anillos-en", slug: "anillos" },
    ]);
    expect(readStore).toHaveBeenCalledOnce();
    expect(readCategories).toHaveBeenCalledExactlyOnceWith(store, "en");
    expect(connection.mock.invocationCallOrder[0]).toBeLessThan(
      readStore.mock.invocationCallOrder[0] ?? 0
    );
  });

  test("shows no bar and no category before the store's row exists", async () => {
    readStore.mockResolvedValue(null);

    const shell = streamedShell("es");

    await expect(shell.announcement).resolves.toBeNull();
    await expect(shell.categories).resolves.toEqual([]);
    expect(readCategories).not.toHaveBeenCalled();
  });
});

describe("shellOf", () => {
  test("from a store already read, its tagline and its cached categories", async () => {
    const store = makeStore();

    const shell = shellOf(store, "es");

    await expect(shell.announcement).resolves.toEqual({
      lang: "es",
      text: SPANISH.tagline,
    });
    await expect(shell.categories).resolves.toEqual([
      { lang: "es", name: "anillos-es", slug: "anillos" },
    ]);
    expect(readCategories).toHaveBeenCalledExactlyOnceWith(store, "es");
    expect(readStore).not.toHaveBeenCalled();
    expect(connection).not.toHaveBeenCalled();
  });
});
