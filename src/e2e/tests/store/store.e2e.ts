import {
  expect,
  IGNORE_HTTPS_ERRORS,
  requireBaseURL,
  test,
} from "../../fixtures";
import { StorePage } from "../../page-objects/store.page";

const SPANISH = {
  description: "Anillos y cadenas hechos a mano.",
  locale: "es",
  tagline: "Joyas en la feria",
} as const;
const ENGLISH = {
  description: "Handmade rings and chains.",
  locale: "en",
  tagline: "Jewelry at the fair",
} as const;

/** A second palette: every color differs from the default one's. */
const WARM = {
  colorAccent: "#ff8a3d",
  colorBackground: "#fff4e6",
  colorContrast: "#3d1f47",
  colorForeground: "#26160f",
  colorSurface: "#fffaf5",
};

test.describe("Store pages", () => {
  // The storefront is public: no session decides what it shows.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("two stores in one deployment each wear their own colors at their own path", async ({
    db,
    page,
  }) => {
    const lime = await db.seed.createStore({ name: "Lime Store" }, [SPANISH]);
    const warm = await db.seed.createStore({ ...WARM, name: "Warm Store" }, [
      SPANISH,
    ]);

    const limePage = new StorePage(page, lime.slug);
    await limePage.goto();

    await expect(limePage.getHeading(1)).toHaveText("Lime Store");
    // #f2f3f0, #111312 and #c8f31d, as the browser computes them.
    await expect(limePage.getTheme()).toHaveCSS(
      "background-color",
      "rgb(242, 243, 240)"
    );
    await expect(limePage.getHeader()).toHaveCSS(
      "background-color",
      "rgb(17, 19, 18)"
    );
    await expect(limePage.getHeading(1).getByText("Lime Store")).toHaveCSS(
      "color",
      "rgb(200, 243, 29)"
    );

    const warmPage = new StorePage(page, warm.slug);
    await warmPage.goto();

    await expect(warmPage.getHeading(1)).toHaveText("Warm Store");
    // #fff4e6, #3d1f47, #ff8a3d, #26160f and #fffaf5.
    await expect(warmPage.getTheme()).toHaveCSS(
      "background-color",
      "rgb(255, 244, 230)"
    );
    await expect(warmPage.getHeader()).toHaveCSS(
      "background-color",
      "rgb(61, 31, 71)"
    );
    await expect(warmPage.getHeading(1).getByText("Warm Store")).toHaveCSS(
      "color",
      "rgb(255, 138, 61)"
    );
    await expect(warmPage.getDescription()).toHaveCSS(
      "color",
      "rgb(38, 22, 15)"
    );
    await expect(warmPage.getDescription()).toHaveCSS(
      "background-color",
      "rgb(255, 250, 245)"
    );
  });

  test("the muted text is derived from the store's own palette, not the default one", async ({
    db,
    page,
  }) => {
    const warm = await db.seed.createStore({ ...WARM }, [SPANISH]);
    const storePage = new StorePage(page, warm.slug);

    await storePage.goto();

    // color-mix(in srgb, #fff4e6 74%, #3d1f47), the tagline on the contrast
    // block, as Chromium reports a mixed color: a warm pink. Derived from the
    // default palette instead, it would be a gray with three equal channels.
    await expect(page.getByText("Joyas en la feria")).toHaveCSS(
      "color",
      "color(srgb 0.802196 0.739686 0.739843)"
    );
  });

  test("shows the store in Spanish at its path and in English under /en, each declaring the other", async ({
    db,
    page,
  }) => {
    const store = await db.seed.createStore({ name: "Bilingual Store" }, [
      SPANISH,
      ENGLISH,
    ]);
    const storePage = new StorePage(page, store.slug);

    await storePage.goto();

    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByText("Joyas en la feria")).toBeVisible();
    await expect(storePage.getDescription()).toHaveText(
      "Anillos y cadenas hechos a mano."
    );
    await expect(page).toHaveTitle("Bilingual Store");

    await storePage.gotoEnglish();

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByText("Jewelry at the fair")).toBeVisible();
    await expect(storePage.getDescription()).toHaveText(
      "Handmade rings and chains."
    );
    await expect(storePage.getHeading(1)).toHaveText("Bilingual Store");
    await expect(
      page.locator('link[rel="alternate"][hreflang="es"]')
    ).toHaveAttribute("href", new RegExp(`/${store.slug}$`));
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      new RegExp(`/en/${store.slug}$`)
    );
  });

  test("fits a phone without scrolling sideways, long name included", async ({
    db,
    page,
  }) => {
    await page.setViewportSize({ height: 812, width: 375 });
    const store = await db.seed.createStore(
      { name: "Bisutería-Internacional-Montevideo y compañía" },
      [SPANISH]
    );
    const storePage = new StorePage(page, store.slug);

    await storePage.goto();

    await expect
      .poll(
        async () =>
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth
          )
      )
      .toBe(0);
  });

  test("an inactive store answers 404, like an address nobody holds", async ({
    db,
    page,
  }) => {
    const inactive = await db.seed.createStore({ isActive: false }, [SPANISH]);

    const response = await page.goto(`/${inactive.slug}`);

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: "Página no encontrada" })
    ).toBeVisible();
    await expect(page.getByTestId("store-home")).toHaveCount(0);
  });

  test("an inactive store answers 404 in English too", async ({ db, page }) => {
    const inactive = await db.seed.createStore({ isActive: false }, [ENGLISH]);

    const response = await page.goto(`/en/${inactive.slug}`);

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: "Page not found" })
    ).toBeVisible();
  });

  for (const reserved of ["admin", "es/admin", "en/admin", "en/en"]) {
    test(`the reserved address /${reserved} is never a store`, async ({
      page,
    }) => {
      const response = await page.goto(`/${reserved}`);

      expect(response?.status()).toBe(404);
      await expect(page.getByTestId("store-home")).toHaveCount(0);
    });
  }
});

test.describe("Editing a store", () => {
  // Signed in as the worker's user: the write procedures need a session.
  test("an edit through the API reaches the cached storefront at once: new colors, new texts, and a 404 that becomes a page", async ({
    db,
    page,
  }) => {
    const store = await db.seed.createStore(
      { isActive: false, name: "Edited Store" },
      [SPANISH]
    );
    const storePage = new StorePage(page, store.slug);

    // The address is visited while the store is inactive, so "no such store"
    // is what the cache holds for it.
    const before = await page.goto(`/${store.slug}`);
    expect(before?.status()).toBe(404);

    const edit = await page.request.post("/api/orpc/store/update", {
      data: {
        json: {
          ...WARM,
          currencyCode: "UYU",
          id: store.id,
          instagramUrl: null,
          isActive: true,
          logoUrl: null,
          name: "Edited Store",
          slug: store.slug,
          tiktokUrl: null,
          translations: [{ ...SPANISH, tagline: "Texto nuevo" }],
          whatsappNumber: null,
        },
      },
    });
    expect(edit.status()).toBe(200);

    await storePage.goto();

    await expect(storePage.getHeading(1)).toHaveText("Edited Store");
    await expect(storePage.getTheme()).toHaveCSS(
      "background-color",
      "rgb(255, 244, 230)"
    );
    await expect(page.getByText("Texto nuevo")).toBeVisible();

    // A second edit, now of a page that is cached as found.
    const recolor = await page.request.post("/api/orpc/store/update", {
      data: {
        json: {
          ...WARM,
          colorBackground: "#f2f3f0",
          currencyCode: "UYU",
          id: store.id,
          instagramUrl: null,
          isActive: true,
          logoUrl: null,
          name: "Edited Store",
          slug: store.slug,
          tiktokUrl: null,
          translations: [SPANISH],
          whatsappNumber: null,
        },
      },
    });
    expect(recolor.status()).toBe(200);

    await storePage.goto();

    await expect(storePage.getTheme()).toHaveCSS(
      "background-color",
      "rgb(242, 243, 240)"
    );
    await expect(page.getByText("Joyas en la feria")).toBeVisible();
  });

  test("the API refuses a reserved address and an unreadable palette, and the store keeps its own", async ({
    db,
    page,
  }) => {
    const store = await db.seed.createStore({ name: "Kept Store" }, [SPANISH]);
    const valid = {
      colorAccent: "#c8f31d",
      colorBackground: "#f2f3f0",
      colorContrast: "#111312",
      colorForeground: "#111312",
      colorSurface: "#ffffff",
      currencyCode: "UYU",
      id: store.id,
      instagramUrl: null,
      isActive: true,
      logoUrl: null,
      name: "Kept Store",
      slug: store.slug,
      tiktokUrl: null,
      translations: [],
      whatsappNumber: null,
    };

    const reserved = await page.request.post("/api/orpc/store/update", {
      data: { json: { ...valid, slug: "admin" } },
    });
    const unreadable = await page.request.post("/api/orpc/store/update", {
      data: { json: { ...valid, colorForeground: "#f2f3f0" } },
    });

    expect(reserved.status()).toBe(400);
    expect(unreadable.status()).toBe(400);

    const storePage = new StorePage(page, store.slug);
    await storePage.goto();

    await expect(storePage.getHeading(1)).toHaveText("Kept Store");
    await expect(page.getByText("Joyas en la feria")).toBeVisible();
  });

  test("a signed-out caller cannot edit a store", async ({
    browser,
    db,
    baseURL,
  }) => {
    const store = await db.seed.createStore({ name: "Guarded Store" });
    const context = await browser.newContext({
      baseURL: requireBaseURL(baseURL),
      ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
      storageState: { cookies: [], origins: [] },
    });

    const response = await context.request.post("/api/orpc/store/update", {
      data: {
        json: {
          ...WARM,
          currencyCode: "UYU",
          id: store.id,
          instagramUrl: null,
          isActive: true,
          logoUrl: null,
          name: "Taken Over",
          slug: store.slug,
          tiktokUrl: null,
          translations: [],
          whatsappNumber: null,
        },
      },
    });
    await context.close();

    expect(response.status()).toBe(401);
    await expect(
      db.drizzle.query.store.findFirst({
        columns: { name: true },
        where: (table, { eq }) => eq(table.id, store.id),
      })
    ).resolves.toEqual({ name: "Guarded Store" });
  });
});
