import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import { StorePage } from "../page-objects/store.page";

// Every address no page answers renders the store's not-found page, under
// the store's header, with a real 404 for a browser and a crawler alike.
// One of three segments or more reaches the store's catch-all
// (`(store)/[...rest]`), and any under `/admin` its own
// (`(store)/admin/[...rest]`). One of one or two segments has the shape of
// a catalog page (`/burbujeros`, `/bijouterie/anillos`, FER-043), whose
// route streams: the proxy, which knows the store's pages and categories,
// sends it to the catch-all before the route starts (FER-069,
// docs/agents/nextjs.md § Store pages).
test.use({ storageState: { cookies: [], origins: [] } });

const BINGBOT =
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)";

/**
 * What a browser and a crawler that runs no script are told about an
 * address no page answers: a real 404, the page marked `noindex`.
 */
async function expectNotFound(
  page: Page,
  path: string,
  status: number | undefined
) {
  expect(status).toBe(404);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex"
  );
  const crawler = await page.request.get(path, {
    headers: { "User-Agent": BINGBOT },
  });
  expect(crawler.status()).toBe(404);
}

/**
 * The multi-store site's addresses (FER-038): a store's pages, its
 * `llms.txt`, the store's and the platform's admin, and the slugs it kept
 * from ever being a store's. Nothing was ever published under them, so they
 * are addresses like any other the site does not answer.
 */
const OLD_ADDRESSES = [
  "/lr-market",
  "/lr-market/products",
  "/lr-market/products/x",
  "/lr-market/llms.txt",
  "/admin/lr-market",
  "/admin/lr-market/orders",
  "/admin/platform",
  "/admin/platform/stores",
  "/platform",
  "/sign-in",
] as const;

/** The same, under the English prefix: the not-found page in English. */
const OLD_ENGLISH_ADDRESSES = [
  "/en/lr-market/cart",
  "/en/admin/platform/stores",
  "/en/platform",
  "/en/en",
] as const;

test.describe("Not found", () => {
  test("an unknown address answers the store's not-found page with a real 404, whose link leads home", async ({
    page,
  }) => {
    const store = new StorePage(page);

    const response = await page.goto("/this-page-does-not-exist");

    await expectNotFound(page, "/this-page-does-not-exist", response?.status());
    await expect(store.getNotFoundHeading()).toBeVisible();
    await expect(page).toHaveTitle("Esta página no existe");
    await expect(store.getSiteHeader()).toBeVisible();
    const home = page.getByRole("link", {
      name: "Volver a la home de la tienda",
    });
    await expect(home).toHaveAttribute("href", "/");

    await home.click();

    await store.waitForLoad();
    await expect(page).toHaveURL("/");
  });

  test("the not-found page's main action leads to the catalog, in the address's language", async ({
    page,
  }) => {
    for (const [path, name, catalog, heading] of [
      [
        "/this-page-does-not-exist",
        "Ver el catálogo",
        "/productos",
        "Catálogo",
      ],
      [
        "/en/this-page-does-not-exist",
        "See the catalog",
        "/en/productos",
        "Catalog",
      ],
    ] as const) {
      await page.goto(path);
      const action = page.getByRole("link", { name });
      await expect(action).toHaveAttribute("href", catalog);

      await action.click();

      await expect(page).toHaveURL(catalog);
      await expect(
        page.getByRole("heading", { exact: true, level: 1, name: heading })
      ).toBeVisible();
    }
  });

  test("an unknown English address answers 404 in English, whose link leads to the English home", async ({
    page,
  }) => {
    const store = new StorePage(page);

    const response = await page.goto("/en/this-page-does-not-exist");

    await expectNotFound(
      page,
      "/en/this-page-does-not-exist",
      response?.status()
    );
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "This page doesn't exist",
      })
    ).toBeVisible();
    await expect(page).toHaveTitle("This page doesn't exist");
    await store.expectDocumentLanguage("en");
    const home = page.getByRole("link", { name: "Back to the store's home" });
    await expect(home).toHaveAttribute("href", "/en");

    await home.click();

    await store.waitForLoad();
    await expect(page).toHaveURL("/en");
    await store.expectDocumentLanguage("en");
  });

  for (const path of OLD_ADDRESSES) {
    test(`the multi-store site's ${path} answers the store's not-found page with a real 404`, async ({
      page,
    }) => {
      const store = new StorePage(page);

      const response = await page.goto(path);

      await expectNotFound(page, path, response?.status());
      await expect(store.getNotFoundHeading()).toBeVisible();
      await expect(store.getSiteHeader()).toBeVisible();
      await expect(page.getByTestId("store-home")).toHaveCount(0);
      await expect(page.getByTestId("admin-shell")).toHaveCount(0);
    });
  }

  for (const path of OLD_ENGLISH_ADDRESSES) {
    test(`the multi-store site's ${path} answers the store's not-found page with a real 404 in English`, async ({
      page,
    }) => {
      const store = new StorePage(page);

      const response = await page.goto(path);

      await expectNotFound(page, path, response?.status());
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "This page doesn't exist",
        })
      ).toBeVisible();
      await store.expectDocumentLanguage("en");
      await expect(store.getSiteHeader()).toBeVisible();
      await expect(page.getByTestId("store-home")).toHaveCount(0);
      await expect(page.getByTestId("admin-shell")).toHaveCount(0);
    });
  }
});
