import { describe, expect, test, vi } from "vitest";

import type { ShownAnnouncement } from "@/lib/page/content";
import type { PublicStore } from "@/server/services/store";
import { holdRequest, settle } from "@/test/connection";

import { announcementOf, shellOf, streamedShell } from "./store-shell";

const {
  connection,
  readAnnouncement,
  readCategories,
  readHeaderPages,
  readStore,
} = vi.hoisted(() => ({
  connection: vi.fn(async () => undefined),
  readAnnouncement:
    vi.fn<(store: { id: number }, locale: string) => Promise<unknown>>(),
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
  // A page the admin shows in the header (FER-060).
  readHeaderPages: vi.fn(async (_store: { id: number }, locale: string) => [
    {
      id: 9,
      lang: locale,
      name: `regalos-${locale}`,
      path: "/regalos",
      slug: "regalos",
    },
  ]),
  readStore: vi.fn<() => Promise<PublicStore | null>>(),
}));

vi.mock("next/server", () => ({ connection }));

vi.mock("server-only", () => ({}));

// The cached reads have their own tests; here they answer what the test says.
vi.mock("@/server/cache/store", () => ({ readStore }));

vi.mock("@/server/cache/catalog", () => ({ readCategories }));

vi.mock("@/server/cache/page", () => ({ readAnnouncement, readHeaderPages }));

/** The header's entry for page 9, as a category in no group. */
function pageEntry(locale: string) {
  return {
    id: -9,
    lang: locale,
    name: `regalos-${locale}`,
    parentId: null,
    path: "/regalos",
    showInHeader: true,
    slug: "regalos",
  };
}

const SPANISH = {
  description: "Anillos y cadenas.",
  locale: "es",
  location: null,
  tagline: "Burbujeros y joyas en la feria",
} as const;

function makeStore(overrides: Partial<PublicStore> = {}): PublicStore {
  return {
    currencyCode: "UYU",
    id: 7,
    instagramUrl: null,
    name: "LR Market",
    tiktokUrl: null,
    translations: [SPANISH],
    whatsappNumber: null,
    ...overrides,
  };
}

/** The announcement the cached read answers, in its own words. */
function makeAnnouncement(
  overrides: Partial<ShownAnnouncement> = {}
): ShownAnnouncement {
  return {
    href: "/productos",
    lang: "es",
    shortText: "En la feria · 5/12 al 5/1",
    text: "Encontranos en la feria, del 5/12 al 5/1",
    ...overrides,
  };
}

/**
 * The store `readStore` answers, or none when its row is `missing` (a
 * database whose migrations have not run); the announcement the cached read
 * answers (none when `null`); `held` keeps the request from arriving until
 * `arrive()`.
 */
function setup({
  announcement = makeAnnouncement(),
  held = false,
  missing = false,
}: {
  announcement?: ShownAnnouncement | null;
  held?: boolean;
  missing?: boolean;
} = {}) {
  const store = makeStore();
  readStore.mockResolvedValue(missing ? null : store);
  readAnnouncement.mockResolvedValue(announcement);
  const request = held ? holdRequest(connection) : null;

  return {
    arrive: () => {
      request?.arrive();
    },
    store,
  };
}

describe("announcementOf", () => {
  test.each([
    ["es", "/productos", "/productos"],
    ["en", "/productos", "/en/productos"],
    ["en", "https://instagram.com/lr", "https://instagram.com/lr"],
  ] as const)(
    "in %s, gives the bar the store's announcement, its link %s as %s",
    async (locale, link, href) => {
      const { store } = setup({
        announcement: makeAnnouncement({ href: link }),
      });

      await expect(announcementOf(store, locale)).resolves.toEqual({
        href,
        lang: "es",
        short: "En la feria · 5/12 al 5/1",
        text: "Encontranos en la feria, del 5/12 al 5/1",
      });
      expect(readAnnouncement).toHaveBeenCalledExactlyOnceWith(store, locale);
    }
  );

  test("keeps an announcement without a link or a short line as only words", async () => {
    const { store } = setup({
      announcement: makeAnnouncement({ href: null, shortText: null }),
    });

    await expect(announcementOf(store, "es")).resolves.toEqual({
      href: null,
      lang: "es",
      short: null,
      text: "Encontranos en la feria, del 5/12 al 5/1",
    });
  });

  test("gives no bar when nothing is to be said", async () => {
    const { store } = setup({ announcement: null });

    await expect(announcementOf(store, "es")).resolves.toBeNull();
  });
});

describe("streamedShell", () => {
  test("reads the store only once a request is there, then its announcement and categories", async () => {
    const { arrive, store } = setup({ held: true });

    const shell = streamedShell("en");
    await settle();

    expect(connection).toHaveBeenCalledExactlyOnceWith();
    expect(readStore).not.toHaveBeenCalled();
    expect(readAnnouncement).not.toHaveBeenCalled();
    expect(readCategories).not.toHaveBeenCalled();

    arrive();

    await expect(shell.announcement).resolves.toEqual({
      href: "/en/productos",
      lang: "es",
      short: "En la feria · 5/12 al 5/1",
      text: "Encontranos en la feria, del 5/12 al 5/1",
    });
    // Only those the header shows (FER-051).
    await expect(shell.categories).resolves.toEqual([
      // The pages it shows there first, then the categories (FER-060).
      pageEntry("en"),
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
    expect(readHeaderPages).toHaveBeenCalledExactlyOnceWith(store, "en");
    expect(readStore).toHaveBeenCalledExactlyOnceWith();
    expect(readAnnouncement).toHaveBeenCalledExactlyOnceWith(store, "en");
    expect(readCategories).toHaveBeenCalledExactlyOnceWith(store, "en");
  });

  test("shows no bar and no category before the store's row exists", async () => {
    setup({ missing: true });

    const shell = streamedShell("es");

    await expect(shell.announcement).resolves.toBeNull();
    await expect(shell.categories).resolves.toEqual([]);
    expect(readAnnouncement).not.toHaveBeenCalled();
    expect(readCategories).not.toHaveBeenCalled();
    expect(readHeaderPages).not.toHaveBeenCalled();
  });
});

describe("shellOf", () => {
  test("from a store already read, its announcement and cached categories, read before it answers", async () => {
    const { store } = setup();

    const shell = await shellOf(store, "es");

    // Read before `shellOf` answered: the promise is already settled.
    expect(readAnnouncement).toHaveBeenCalledExactlyOnceWith(store, "es");
    await expect(shell.announcement).resolves.toEqual({
      href: "/productos",
      lang: "es",
      short: "En la feria · 5/12 al 5/1",
      text: "Encontranos en la feria, del 5/12 al 5/1",
    });
    // The list itself, not a promise of it: the header renders it in place,
    // behind no boundary, in the first response (FER-043).
    // Only those the header shows (FER-051).
    expect(shell.categories).toEqual([
      pageEntry("es"),
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

  test("does not answer before its announcement is read, then hands that announcement", async () => {
    const { store } = setup();
    let answer: (value: ShownAnnouncement) => void = () => undefined;
    readAnnouncement.mockReturnValueOnce(
      new Promise<ShownAnnouncement>((resolve) => {
        answer = resolve;
      })
    );
    const state = { answered: false };

    const shell = shellOf(store, "es").then((value) => {
      state.answered = true;
      return value;
    });
    await settle();

    expect(state.answered).toBe(false);
    answer(makeAnnouncement({ href: null, text: "Cerrado por feriado" }));
    await expect((await shell).announcement).resolves.toEqual({
      href: null,
      lang: "es",
      short: "En la feria · 5/12 al 5/1",
      text: "Cerrado por feriado",
    });
    expect(state.answered).toBe(true);
  });

  test("from a page that read its categories as of now, those, reading no cached list (FER-043)", async () => {
    setup();
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
    expect(shell.categories).toEqual([pageEntry("es"), aros]);
    expect(readCategories).not.toHaveBeenCalled();
  });
});
