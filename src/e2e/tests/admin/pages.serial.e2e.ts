import type { APIRequest, Browser, Page } from "@playwright/test";
import { eq } from "drizzle-orm";

import { page as pageTable, store } from "../../../server/db/schema";
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

    // A draft: the public and crawlers find nothing; the admin previews it.
    const draft = await request.get(`/${slug}`, {});
    expect(draft.status()).toBe(404);
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

      // In the header's line, right after "Catálogo".
      await shopper.goto("/");
      await expect(
        headerBar(shopper).getByRole("link", { name })
      ).toHaveAttribute("href", `/${slug}`);
      await expect(headerBar(shopper).getByRole("link").nth(1)).toHaveText(
        name
      );
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
    const [own] = await db.drizzle
      .select({ slug: pageTable.slug })
      .from(store)
      .innerJoin(pageTable, eq(pageTable.id, store.homePageId))
      .where(eq(store.id, db.storeId));
    const oldHome = own?.slug ?? "";
    const pages = new AdminPagesPage(page);

    await pages.open();
    // The home is marked and cannot be deleted; a page can.
    await expect(pages.row("Home")).toHaveAttribute("data-home", "true");
    await expect(
      pages.row("Home").getByRole("button", { name: "Borrar: Home" })
    ).toHaveCount(0);
    await pages.useAsHome(name);

    await expect(pages.row(name)).toHaveAttribute("data-home", "true");
    await expect(
      pages.row(name).getByRole("button", { name: `Borrar: ${name}` })
    ).toHaveCount(0);
    await expect(
      pages.row("Home").getByRole("button", { name: "Borrar: Home" })
    ).toBeVisible();

    const context = await visitor(browser, baseURL);

    try {
      const shopper = await context.newPage();
      await shopper.goto("/");
      await expect(
        shopper.getByRole("link", { name: new RegExp(`Taza ${tag}`, "u") })
      ).toBeVisible();
      // The old home is an ordinary page at its own address.
      await shopper.goto(`/${oldHome}`);
      await expect(
        shopper.getByRole("heading", { level: 1, name: "Home" })
      ).toBeVisible();
    } finally {
      await context.close();
    }

    // The home's own address leads to `/`, in each language.
    for (const [path, home] of [
      [`/${slug}`, "/"],
      [`/en/${slug}`, "/en"],
    ] as const) {
      const moved = await request.get(path, {
        maxRedirects: 0,
      });
      expect(moved.status()).toBe(307);
      expect(moved.headers().location).toBe(home);
    }

    await request.dispose();
  });
});
