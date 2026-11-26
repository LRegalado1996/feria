import type { APIRequest, Browser, Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";

import {
  page as pageTable,
  pageTranslation,
  store,
} from "../../../server/db/schema";
import {
  type DbFixture,
  expect,
  IGNORE_HTTPS_ERRORS,
  requireBaseURL,
  test,
  uniqueTag,
} from "../../fixtures";
import { clickUntilVisible } from "../../fixtures/click-until-visible";
import { AdminHomePage } from "../../page-objects/admin-home.page";
import { AdminPagesPage } from "../../page-objects/admin-pages.page";
import { StorePage } from "../../page-objects/store.page";

// FER-060. Serial: a page in the header shows on every store page, and the
// choice of the home changes `/` for every spec. Each test asks for
// `homeEdit`, whose end puts the home back and deletes every page the test
// made (through the admin or `addPage`).

const BINGBOT =
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)";

/** A category of the test's own with one published article in it. */
async function seedRow(db: DbFixture["db"], tag: string) {
  const row = await db.seed.createCategory({
    nameEs: `Regalos ${tag}`,
    slug: `regalos-${tag}`,
  });
  await db.seed.createArticle({
    categoryId: row.id,
    priceAmount: 79_000,
    title: `Taza ${tag}`,
  });

  return row;
}

/** A visitor's browser, signed out, at `width` px. */
async function visitor(
  browser: Browser,
  baseURL: string | undefined,
  width = 1440
) {
  return await browser.newContext({
    baseURL: requireBaseURL(baseURL),
    ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
    storageState: { cookies: [], origins: [] },
    viewport: { height: 900, width },
  });
}

/** A crawler's requests: signed out, so a draft is not there for it. */
async function crawler(
  playwright: { request: APIRequest },
  baseURL: string | undefined
) {
  return await playwright.request.newContext({
    baseURL: requireBaseURL(baseURL),
    extraHTTPHeaders: { "User-Agent": BINGBOT },
    ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
    storageState: { cookies: [], origins: [] },
  });
}

/** The header's line on a computer. */
function headerBar(page: Page) {
  return page.getByRole("navigation", { name: "Secciones de la tienda" });
}

test.describe("Pages from the admin", () => {
  test("an admin makes a page, gives it a row and publishes it: the store shows it at its address, in both languages and in its header", async ({
    baseURL,
    browser,
    db,
    homeEdit: _deletesThePage,
    page,
    playwright,
  }) => {
    const request = await crawler(playwright, baseURL);
    const tag = uniqueTag();
    const short = tag.slice(0, 8);
    const name = `Ofertas ${short}`;
    const slug = `ofertas-${tag}`;
    await seedRow(db, tag);
    const pages = new AdminPagesPage(page);

    await pages.open();
    await pages.openNewPage();
    const sheet = pages.sheet();
    await sheet.getByRole("textbox", { name: "Nombre en español" }).fill(name);
    // The address follows the name until one is typed.
    await expect(sheet.getByRole("textbox", { name: "Dirección" })).toHaveValue(
      `ofertas-${short}`
    );
    await sheet.getByRole("textbox", { name: "Dirección" }).fill(slug);
    await sheet
      .getByRole("checkbox", { name: "Mostrar en el encabezado" })
      .check();
    await pages.createPage({ isPublished: false, nameEs: name, slug });
    await expect(pages.heading()).toHaveText(name);

    // A draft: the public and crawlers find nothing, a real 404 for both
    // (FER-069); the admin previews it.
    const draft = await request.get(`/${slug}`, {});
    expect(draft.status()).toBe(404);
    const outsider = await visitor(browser, baseURL);

    try {
      const response = await (await outsider.newPage()).goto(`/${slug}`);
      expect(response?.status()).toBe(404);
    } finally {
      await outsider.close();
    }

    const preview = await page.context().newPage();
    await preview.goto(`/${slug}`);
    await expect(preview.getByRole("note")).toHaveText(
      "Borrador: la ves porque iniciaste sesión. El público todavía no la ve."
    );
    await preview.close();

    await pages.addBlock(`Regalos ${tag}`);
    await new AdminHomePage(page).saveOrder();
    await pages.settings().getByRole("checkbox", { name: "Publicada" }).check();
    await pages.saveSettings({ isPublished: true, slug });

    const context = await visitor(browser, baseURL);

    try {
      const shopper = await context.newPage();

      for (const path of [`/${slug}`, `/en/${slug}`]) {
        await shopper.goto(path);
        // Its name is its h1, in Spanish when it has no English one.
        await expect(
          shopper.getByRole("heading", { level: 1, name })
        ).toHaveAttribute("lang", "es");
        await expect(
          shopper.getByRole("link", { name: new RegExp(`Taza ${tag}`, "u") })
        ).toBeVisible();
      }

      // In the header's line. Its place before the categories is
      // store-shell's unit test: here, other published pages of the store
      // can stand before it.
      await shopper.goto("/");
      await expect(
        headerBar(shopper).getByRole("link", { name })
      ).toHaveAttribute("href", `/${slug}`);
    } finally {
      await context.close();
    }

    // And in the phone's menu.
    const phone = await visitor(browser, baseURL, 390);

    try {
      const shopper = await phone.newPage();
      await shopper.goto("/");
      const storePage = new StorePage(shopper);
      await clickUntilVisible(
        storePage.getMenuButton("Menú"),
        storePage.getMobileMenu()
      );
      await expect(
        storePage.getMobileMenu().getByRole("link", { name })
      ).toHaveAttribute("href", `/${slug}`);
    } finally {
      await phone.close();
    }

    // A crawler that runs no script reads it all in the HTML.
    const html = await request.get(`/${slug}`, {});
    expect(html.status()).toBe(200);
    expect(await html.text()).toContain(`Taza ${tag}`);

    // Unpublished, it is gone for the public, and from the header.
    await pages
      .settings()
      .getByRole("checkbox", { name: "Publicada" })
      .uncheck();
    await pages.saveSettings({ isPublished: false });
    const gone = await request.get(`/${slug}`, {});
    expect(gone.status()).toBe(404);
    const after = await request.get("/", {});
    expect(await after.text()).not.toContain(`href="/${slug}"`);
    await request.dispose();
  });

  test("any published page can be the home: `/` shows it, its address leads there, the old home is back at its own, and the home cannot be deleted", async ({
    baseURL,
    browser,
    db,
    homeEdit,
    page,
    playwright,
  }) => {
    const request = await crawler(playwright, baseURL);
    const tag = uniqueTag();
    const name = `Portada ${tag.slice(0, 8)}`;
    const slug = `portada-${tag}`;
    const row = await seedRow(db, tag);
    await homeEdit.addPage({ categoryIds: [row.id], nameEs: name, slug });
    // The home as the test finds it: named "Home" after `0025`, unless an
    // admin of a development database renamed it.
    const [own] = await db.drizzle
      .select({ name: pageTranslation.name, slug: pageTable.slug })
      .from(store)
      .innerJoin(pageTable, eq(pageTable.id, store.homePageId))
      .innerJoin(
        pageTranslation,
        and(
          eq(pageTranslation.pageId, pageTable.id),
          eq(pageTranslation.locale, "es")
        )
      )
      .where(eq(store.id, db.storeId));

    if (!own) {
      throw new Error("The store has no home page");
    }

    const oldHome = own.name;
    const pages = new AdminPagesPage(page);

    await pages.open();
    // The home is marked and cannot be deleted; a page can.
    await expect(pages.row(oldHome)).toHaveAttribute("data-home", "true");
    await expect(
      pages.row(oldHome).getByRole("button", { name: `Borrar: ${oldHome}` })
    ).toHaveCount(0);
    await pages.useAsHome(name);

    await expect(pages.row(name)).toHaveAttribute("data-home", "true");
    await expect(
      pages.row(name).getByRole("button", { name: `Borrar: ${name}` })
    ).toHaveCount(0);
    await expect(
      pages.row(oldHome).getByRole("button", { name: `Borrar: ${oldHome}` })
    ).toBeVisible();

    const context = await visitor(browser, baseURL);

    try {
      const shopper = await context.newPage();
      await shopper.goto("/");
      await expect(
        shopper.getByRole("link", { name: new RegExp(`Taza ${tag}`, "u") })
      ).toBeVisible();
      // The old home is an ordinary page at its own address.
      await shopper.goto(`/${own.slug}`);
      await expect(
        shopper.getByRole("heading", { level: 1, name: oldHome })
      ).toBeVisible();
    } finally {
      await context.close();
    }

    // The home's own address leads to `/`, in each language, as the
    // response itself (FER-070): for a crawler, a browser's request, and a
    // browser without script. The proxy may trust addresses it read a few
    // seconds before the choice to let a page through, so the browser's
    // request is polled.
    const browserRequest = await playwright.request.newContext({
      baseURL: requireBaseURL(baseURL),
      ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
      storageState: { cookies: [], origins: [] },
    });

    for (const [path, home] of [
      [`/${slug}`, "/"],
      [`/en/${slug}`, "/en"],
    ] as const) {
      const moved = await request.get(path, {
        maxRedirects: 0,
      });
      expect(moved.status()).toBe(307);
      expect(moved.headers().location).toBe(home);

      await expect
        .poll(async () => {
          const response = await browserRequest.get(path, {
            maxRedirects: 0,
          });

          return [response.status(), response.headers().location];
        })
        .toEqual([307, home]);
    }

    // The old home answers at its address, without a redirect.
    const oldAddress = await browserRequest.get(`/${own.slug}`, {
      maxRedirects: 0,
    });
    expect(oldAddress.status()).toBe(200);

    const noScript = await browser.newContext({
      baseURL: requireBaseURL(baseURL),
      ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
      javaScriptEnabled: false,
      storageState: { cookies: [], origins: [] },
    });

    try {
      const shopper = await noScript.newPage();
      await shopper.goto(`/en/${slug}`);
      await expect(shopper).toHaveURL("/en");
      await expect(
        shopper.getByRole("link", { name: new RegExp(`Taza ${tag}`, "u") })
      ).toBeVisible();
    } finally {
      await noScript.close();
    }

    await browserRequest.dispose();
    await request.dispose();
  });
});
