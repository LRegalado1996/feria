import type { Locator, Page } from "@playwright/test";

import { expect, test } from "../../fixtures";
import { clickUntilVisible } from "../../fixtures/click-until-visible";
import { expectInPlace } from "../../fixtures/expect-in-place";
import { StorePage } from "../../page-objects/store.page";

// FER-064. Every store page renders its own frame, and Next keeps the pages
// left behind mounted and hidden (Cache Components): however the visitor
// got to a page, the content its skip link leads to has an id no other
// element in the document carries, and the skip link lands there.
test.use({ storageState: { cookies: [], origins: [] } });

const SIZES = [
  ["a phone", { height: 812, width: 375 }],
  ["a computer", { height: 900, width: 1440 }],
] as const;

/** The content of the page on show, the skip link's target. */
function shownContent(page: Page) {
  return page.getByTestId("store-main").filter({ visible: true });
}

/**
 * The page on show has one main landmark and one content its skip link
 * targets, by an id on no other element; the hidden pages' contents have
 * ids of their own.
 */
async function expectOwnContent(store: StorePage, page: Page) {
  await expect(page.getByRole("main")).toHaveCount(1);
  const content = shownContent(page);
  await expect(content).toHaveCount(1);
  const id = await content.getAttribute("id");
  expect(id).toBeTruthy();
  expect(await store.countId(id ?? "")).toBe(1);
  const ids = await page
    .getByTestId("store-main")
    .evaluateAll((contents) => contents.map((element) => element.id));
  expect(new Set(ids).size).toBe(ids.length);
  await expect(
    page.getByRole("link", { name: "Saltar al contenido" })
  ).toHaveAttribute("href", `#${id}`);
}

/** The skip link, once focused, moves focus into the page on show. */
async function expectSkipToContent(page: Page) {
  const skip = page.getByRole("link", { name: "Saltar al contenido" });
  await skip.focus();
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(shownContent(page)).toBeFocused();
}

for (const [size, viewport] of SIZES) {
  test.describe(`The store's content on ${size}`, () => {
    test.use({ viewport });

    test("after moving between three pages and back, its own content the skip link reaches", async ({
      page,
    }) => {
      const store = new StorePage(page);
      const phone = viewport.width < 768;

      /** Follows a link to another page, in place, and waits for it. */
      const follow = async (link: () => Locator, path: string) => {
        await expectInPlace(page, async () => {
          await link().click();
          await expect(page).toHaveURL(path);
          await expect(shownContent(page)).toHaveCount(1);
        });
      };

      await store.goto();
      await expectOwnContent(store, page);
      await expectSkipToContent(page);
      // React must own the links before they navigate in place.
      await store.getLiveCartButton();

      // The catalog: from the header on a computer, from its menu on a
      // phone.
      if (phone) {
        await clickUntilVisible(
          store.getMenuButton("Menú"),
          store.getMobileMenu()
        );
      }
      await follow(
        () =>
          (phone ? store.getMobileMenu() : store.getSiteHeader()).getByRole(
            "link",
            { exact: true, name: "Catálogo" }
          ),
        "/productos"
      );
      await expectOwnContent(store, page);
      await expectSkipToContent(page);

      await follow(
        () =>
          store.getFooter().getByRole("link", { name: "Página de contacto" }),
        "/contacto"
      );
      await expectOwnContent(store, page);
      await expectSkipToContent(page);

      // The pages left behind are still in the document, hidden: what made
      // the ids clash.
      await expect
        .poll(async () => await page.getByTestId("store-main").count())
        .toBeGreaterThan(1);

      // And back home, through the header's logo.
      await follow(
        () =>
          store
            .getSiteHeader()
            .getByRole("link", { name: "LR Market, ir a la home" }),
        "/"
      );
      await expectOwnContent(store, page);
      await expectSkipToContent(page);
    });
  });
}
