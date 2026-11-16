import { expect, test } from "../fixtures";
import { StorePage } from "../page-objects/store.page";

// Every address no page answers reaches the store's catch-all
// (`(store)/[...rest]`) and its not-found page, under the store's header,
// with a real 404 (docs/agents/nextjs.md § Store pages).
test.use({ storageState: { cookies: [], origins: [] } });

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
  test("an unknown address answers 404 with the store's not-found page, whose link leads home", async ({
    page,
  }) => {
    const store = new StorePage(page);

    const response = await page.goto("/this-page-does-not-exist");

    expect(response?.status()).toBe(404);
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

    expect(response?.status()).toBe(404);
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
    test(`the multi-store site's ${path} answers 404 with the store's not-found page`, async ({
      page,
    }) => {
      const store = new StorePage(page);

      const response = await page.goto(path);

      expect(response?.status()).toBe(404);
      await expect(store.getNotFoundHeading()).toBeVisible();
      await expect(store.getSiteHeader()).toBeVisible();
      await expect(page.getByTestId("store-home")).toHaveCount(0);
      await expect(page.getByTestId("admin-shell")).toHaveCount(0);
    });
  }

  for (const path of OLD_ENGLISH_ADDRESSES) {
    test(`the multi-store site's ${path} answers 404 with the store's not-found page in English`, async ({
      page,
    }) => {
      const store = new StorePage(page);

      const response = await page.goto(path);

      expect(response?.status()).toBe(404);
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
