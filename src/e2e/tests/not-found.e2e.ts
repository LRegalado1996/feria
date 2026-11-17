import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import { StorePage } from "../page-objects/store.page";

// Every address no page answers renders the store's not-found page, under
// the store's header. One of three segments or more reaches the store's
// catch-all (`(store)/[...rest]`), and any under `/admin` its own
// (`(store)/admin/[...rest]`), a real 404 for everyone. One of one or
// two segments has the shape of a catalog page (`/burbujeros`,
// `/bijouterie/anillos`, FER-043): a crawler that runs no script gets a real
// 404, while a browser gets the page's shell first and the not-found page,
// marked `noindex`, streamed after it with a 200 (docs/agents/nextjs.md §
// Store pages).
test.use({ storageState: { cookies: [], origins: [] } });

const BINGBOT =
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)";

/**
 * Whether an address has a catalog page's shape: one or two segments, never
 * under `/admin`, whose own catch-all answers a real 404.
 */
function couldBeCatalogPage(path: string) {
  const segments = path
    .replace(/^\/en(?=\/|$)/u, "")
    .split("/")
    .filter(Boolean);

  return (
    segments[0] !== "admin" && segments.length >= 1 && segments.length <= 2
  );
}

/**
 * What a browser is told about an address no page answers: a real 404, or
 * for a catalog-shaped one the not-found page marked `noindex`, which a
 * crawler that runs no script gets as a real 404.
 */
async function expectNotFound(
  page: Page,
  path: string,
  status: number | undefined
) {
  if (!couldBeCatalogPage(path)) {
    expect(status).toBe(404);
    return;
  }

  // The shell went out first, so the browser's status is a 200.
  expect(status).toBe(200);
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
  test("an unknown address answers the store's not-found page, a real 404 where its shape allows, whose link leads home", async ({
    page,
  }) => {
    const store = new StorePage(page);

    const response = await page.goto("/this-page-does-not-exist");

    await expectNotFound(page, "/this-page-does-not-exist", response?.status());
    await expect(store.getNotFoundHeading()).toBeVisible();
    await expect(page).toHaveTitle("No encontramos esta página");
    await expect(store.getSiteHeader()).toBeVisible();
    const home = page.getByRole("link", {
      name: "Volver al inicio de la tienda",
    });
    await expect(home).toHaveAttribute("href", "/");

    await home.click();

    await store.waitForLoad();
    await expect(page).toHaveURL("/");
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
        name: "We could not find this page",
      })
    ).toBeVisible();
    await expect(page).toHaveTitle("We could not find this page");
    await store.expectDocumentLanguage("en");
    const home = page.getByRole("link", { name: "Back to the store's home" });
    await expect(home).toHaveAttribute("href", "/en");

    await home.click();

    await store.waitForLoad();
    await expect(page).toHaveURL("/en");
    await store.expectDocumentLanguage("en");
  });

  for (const path of OLD_ADDRESSES) {
    test(`the multi-store site's ${path} answers the store's not-found page, a real 404 where its shape allows`, async ({
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
    test(`the multi-store site's ${path} answers the store's not-found page, a real 404 where its shape allows in English`, async ({
      page,
    }) => {
      const store = new StorePage(page);

      const response = await page.goto(path);

      await expectNotFound(page, path, response?.status());
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "We could not find this page",
        })
      ).toBeVisible();
      await store.expectDocumentLanguage("en");
      await expect(store.getSiteHeader()).toBeVisible();
      await expect(page.getByTestId("store-home")).toHaveCount(0);
      await expect(page.getByTestId("admin-shell")).toHaveCount(0);
    });
  }
});
