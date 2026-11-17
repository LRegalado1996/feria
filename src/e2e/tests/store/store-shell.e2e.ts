import type { Locator } from "@playwright/test";

import {
  expect,
  STORE_SETTINGS,
  STORE_TEXTS,
  test,
  uniqueTag,
} from "../../fixtures";
import { clickUntilVisible } from "../../fixtures/click-until-visible";
import { expectDialogRemoved } from "../../fixtures/expect-dialog-removed";
import { StorePage } from "../../page-objects/store.page";

/** The bar's words until FER-020, as Lucas wrote them (FER-039). */
const ANNOUNCEMENT = {
  en: {
    full: "See you at the Paseo Prado Fair from December 5 to January 5, stall 86",
    short: "Paseo Prado Fair · Stall 86",
  },
  es: {
    full: "Te esperamos en la Feria Paseo Prado del 5 de diciembre al 5 de enero, puesto 86",
    short: "Feria Paseo Prado · Puesto 86",
  },
} as const;

/** Where an element is on screen; it must be there. */
async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();

  return box ?? { height: 0, width: 0, x: 0, y: 0 };
}

// FER-021. Every page of the store sits between one header and one footer;
// the footer reads the store's settings, the run's (`STORE_SETTINGS`).
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Storefront shell", () => {
  test("the bar shows the fair and the stall, the full logo leads home, the links lead to the catalog, and the skip link to the content", async ({
    page,
  }) => {
    const storePage = new StorePage(page);
    await storePage.goto();

    await expect(storePage.getAnnouncementFull()).toHaveText(
      ANNOUNCEMENT.es.full
    );
    const header = storePage.getSiteHeader();
    const home = header.getByRole("link", { name: "LR Market, ir al inicio" });
    await expect(home).toHaveAttribute("href", "/");
    await expect(home.locator('[data-slot="store-logo"]')).toHaveAttribute(
      "data-variant",
      "full"
    );
    const nav = header.getByRole("navigation", {
      name: "Secciones de la tienda",
    });
    await expect(nav.getByRole("link", { name: "Catálogo" })).toHaveAttribute(
      "href",
      "/productos"
    );

    // The first Tab of the page reaches the skip link, which moves focus to
    // the page's content.
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Saltar al contenido" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("store-main")).toBeFocused();
  });

  test("an address that nothing answers is a 404 inside the store's shell", async ({
    page,
  }) => {
    const storePage = new StorePage(page);

    // Three segments: no catalog page has that shape (FER-043), so the
    // catch-all answers it, a real 404 for a browser too (not-found.e2e.ts).
    const response = await page.goto("/no/such/page");

    expect(response?.status()).toBe(404);
    await expect(storePage.getNotFoundHeading()).toBeVisible();
    await expect(storePage.getSiteHeader()).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Volver al inicio de la tienda" })
    ).toHaveAttribute("href", "/");
  });

  for (const [width, shown, hidden] of [
    [375, "short", "full"],
    [390, "short", "full"],
    [1440, "full", "short"],
  ] as const) {
    test(`at ${width} px the bar is one line, the ${shown} notice on screen, the whole one in the HTML for every reader`, async ({
      page,
    }) => {
      await page.setViewportSize({ height: 844, width });
      const storePage = new StorePage(page);

      for (const [locale, open] of [
        [
          "es",
          async () => {
            await storePage.goto();
          },
        ],
        [
          "en",
          async () => {
            await storePage.gotoEnglish();
          },
        ],
      ] as const) {
        await open();
        const texts = ANNOUNCEMENT[locale];
        const visible =
          shown === "full"
            ? storePage.getAnnouncementFull()
            : storePage.getAnnouncementShort();
        const other =
          hidden === "full"
            ? storePage.getAnnouncementFull()
            : storePage.getAnnouncementShort();

        await expect(visible).toHaveText(texts[shown]);
        await expect(other).toHaveText(texts[hidden]);
        // Below lg the whole notice is visually hidden, never removed; the
        // short one is display: none from lg up.
        if (hidden === "full") {
          await expect(other).toHaveCSS("position", "absolute");
          await expect(other).toHaveCSS("width", "1px");
        } else {
          await expect(other).toBeHidden();
        }
        // The bar names its words to a screen reader as the whole notice.
        await expect(storePage.getAnnouncementShort()).toHaveAttribute(
          "aria-hidden",
          "true"
        );
        expect(await storePage.announcementLines()).toBe(1);
        await storePage.expectNoHorizontalScroll();
      }
    });
  }

  for (const { name, viewport } of [
    { name: "a computer", viewport: { height: 900, width: 1440 } },
    // On a phone the pill is in the menu.
    { name: "a phone", viewport: { height: 844, width: 390 } },
  ]) {
    test(`on ${name}, the language pill leads to the same page in English with its query, and back`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const storePage = new StorePage(page);
      const reachToggle = async (menuName: string) => {
        if (viewport.width < 768) {
          await clickUntilVisible(
            storePage.getMenuButton(menuName),
            storePage.getMobileMenu()
          );
        }
      };
      await page.goto("/?ref=qr");
      await storePage.waitForLoad();
      await reachToggle("Menú");

      const toggle = storePage.getLocaleToggle();
      // React reads the URL before the link carries it (src/e2e/AGENTS.md).
      await expect(toggle).toHaveAttribute("href", "/en?ref=qr");
      await expect(toggle).toHaveAccessibleName("English");
      await expect(toggle).toHaveAttribute("lang", "en");
      await expect(storePage.getLocaleToggleThumb()).toHaveAttribute(
        "data-side",
        "start"
      );
      await toggle.click();

      await expect(page).toHaveURL("/en?ref=qr");
      await expect(storePage.getFooter()).toContainText(
        "For more than 20 years my family has set up its stall"
      );
      await storePage.expectDocumentLanguage("en");
      await reachToggle("Menu");
      await expect(toggle).toHaveAccessibleName("Español");
      await expect(storePage.getLocaleToggleThumb()).toHaveAttribute(
        "data-side",
        "end"
      );
      await expect(toggle).toHaveAttribute("href", "/?ref=qr");
      await toggle.click();

      await expect(page).toHaveURL("/?ref=qr");
      await storePage.expectDocumentLanguage("es");
    });
  }

  test.describe("on a phone", () => {
    test.use({ viewport: { height: 812, width: 375 } });

    test("the menu opens full screen with the links, and closes with its button and with Escape", async ({
      page,
    }) => {
      const storePage = new StorePage(page);
      await storePage.goto();
      const menu = storePage.getMobileMenu();

      // The first open after the page loaded: repeated until React owns it.
      await clickUntilVisible(storePage.getMenuButton("Menú"), menu);
      // Full screen: it covers the whole window.
      expect(await menu.boundingBox()).toEqual({
        height: 812,
        width: 375,
        x: 0,
        y: 0,
      });
      await expect(menu.getByRole("link", { name: "Catálogo" })).toBeVisible();
      await expect(menu.getByRole("link", { name: "English" })).toBeVisible();
      await menu.getByRole("button", { name: "Cerrar el menú" }).click();
      await expectDialogRemoved(page, menu);

      await storePage.getMenuButton("Menú").click();
      await expect(menu).toBeVisible();
      await page.keyboard.press("Escape");
      await expectDialogRemoved(page, menu);
    });
  });

  test.describe("on a 390 px phone", () => {
    test.use({ viewport: { height: 844, width: 390 } });

    test("the menu opens on the logo, centered over the links, which leads home and closes it; the language pill sits in the bottom-left corner", async ({
      page,
    }) => {
      const storePage = new StorePage(page);
      await page.goto("/productos");
      const menu = storePage.getMobileMenu();

      // The first open after the page loaded: repeated until React owns it.
      await clickUntilVisible(storePage.getMenuButton("Menú"), menu);

      const home = menu.getByRole("link", { name: "LR Market, inicio" });
      await expect(home).toHaveAttribute("href", "/");
      await expect(
        menu.getByRole("link", { exact: true, name: "Inicio" })
      ).toHaveCount(0);
      const panel = await boxOf(menu);
      const logo = await boxOf(home);
      const catalog = await boxOf(menu.getByRole("link", { name: "Catálogo" }));
      // Centered in the panel, above the links with room under it.
      expect(Math.abs(logo.x + logo.width / 2 - 390 / 2)).toBeLessThanOrEqual(
        1
      );
      expect(catalog.y - (logo.y + logo.height)).toBeGreaterThanOrEqual(32);
      // The pill in the bottom-left corner: the panel's padding from its
      // left and bottom edges (16 and 24 px), nothing under it.
      const pill = await boxOf(menu.getByRole("link", { name: "English" }));
      expect(pill.x - panel.x).toBeLessThanOrEqual(16);
      expect(
        panel.y + panel.height - (pill.y + pill.height)
      ).toBeLessThanOrEqual(24);

      await home.click();

      await expect(page).toHaveURL("/");
      await storePage.waitForLoad();
      await expectDialogRemoved(page, menu);
    });

    test("the footer's blocks stack one under the other, apart, the shop's links side by side under their title", async ({
      db,
      page,
    }) => {
      // A category of the test's own, so the shop lists more than the
      // catalog; a catalog page reads the categories as they are now.
      const tag = uniqueTag();
      await db.seed.createCategory({
        nameEs: `Aros ${tag}`,
        slug: `aros-${tag}`,
      });
      const storePage = new StorePage(page);
      await page.goto("/productos");
      const footer = storePage.getFooter();
      await footer.scrollIntoViewIfNeeded();
      const shop = footer.getByRole("navigation", { name: "Tienda" });
      // The run's store has Instagram: four blocks, in this order.
      const blocks = await Promise.all(
        [
          footer.getByTestId("store-footer-brand"),
          shop,
          footer.getByRole("region", { name: "Ayuda" }),
          footer.getByRole("region", { name: "Seguinos" }),
        ].map(boxOf)
      );

      // Each at the page's 16 px margin, the whole width.
      expect(blocks.map((block) => [block.x, block.width])).toEqual(
        blocks.map(() => [16, 390 - 32])
      );
      // One under the other, in the reading order, apart: from what one
      // block shows to what the next shows, its room below, a hairline and
      // the next one's room above (32 + 1 + 32 px).
      const between = await footer
        .getByTestId("store-footer-blocks")
        .evaluate((row) =>
          [...row.children].slice(1).map((block) => ({
            gap: Math.round(
              (block.firstElementChild?.getBoundingClientRect().top ?? 0) -
                (block.previousElementSibling?.lastElementChild?.getBoundingClientRect()
                  .bottom ?? 0)
            ),
            rule: getComputedStyle(block).borderTopWidth,
          }))
        );
      expect(between).toEqual([
        { gap: 65, rule: "1px" },
        { gap: 65, rule: "1px" },
        { gap: 65, rule: "1px" },
      ]);

      // The shop's title on its own line, its links on the next, side by
      // side: a link starts a new line only when it would not fit after the
      // one before it. Every spec's categories are listed, so how many fit,
      // and which one comes after which, varies: the rule holds for each.
      const expectSideBySide = async () => {
        const title = await boxOf(
          shop.getByRole("heading", { name: "Tienda" })
        );
        const edge = await boxOf(shop);
        const links = await Promise.all(
          (await shop.getByRole("link").all()).map(boxOf)
        );
        expect(links[0]?.y ?? 0).toBeGreaterThanOrEqual(title.y + title.height);
        for (const [index, link] of links.slice(1).entries()) {
          const before = links[index];
          if (before && link.y === before.y) {
            expect(link.x).toBeGreaterThanOrEqual(before.x + before.width + 24);
          } else if (before) {
            expect(before.x + before.width + 24 + link.width).toBeGreaterThan(
              edge.x + edge.width
            );
          }
        }
      };
      await expectSideBySide();

      // Wider, still stacked, the links still side by side.
      await page.setViewportSize({ height: 1024, width: 768 });
      await expectSideBySide();
    });
  });
  test("the footer tells Pepe's story, shows only the links the store has, and the credit", async ({
    page,
  }) => {
    const storePage = new StorePage(page);
    await storePage.goto();
    const footer = storePage.getFooter();

    // Under the logo, the stall's story, signed (FER-044); not the tagline.
    const story = footer.getByTestId("store-footer-story");
    await expect(story).toContainText(
      "Hace más de 20 años que mi familia arma su puesto en la feria navideña."
    );
    await expect(story).toContainText(
      "pasá por el puesto 86 o pedí desde acá."
    );
    await expect(story.getByText("Pepe", { exact: true })).toBeVisible();
    await expect(footer).not.toContainText(STORE_TEXTS.es.tagline);
    await expect(
      footer.getByRole("link", { name: `Instagram de ${STORE_SETTINGS.name}` })
    ).toHaveAttribute("href", STORE_SETTINGS.instagramUrl);
    await expect(
      footer.getByRole("link", { name: "Escribinos por WhatsApp" })
    ).toHaveAttribute(
      "href",
      `https://wa.me/${STORE_SETTINGS.whatsappNumber.slice(1)}`
    );
    // The store has no TikTok in the run's settings.
    await expect(footer.getByRole("link", { name: /TikTok/u })).toHaveCount(0);
    await expect(
      footer.getByRole("link", { name: "Hecho por Lucas Regalado" })
    ).toHaveAttribute("href", "https://lucasregalado.com");
  });

  for (const width of [1440, 2000]) {
    test(`at ${width} px, the footer's blocks span its whole width, the first on the left edge, the last on the right, with even gaps`, async ({
      page,
    }) => {
      await page.setViewportSize({ height: 900, width });
      const storePage = new StorePage(page);
      await storePage.goto();
      const footer = storePage.getFooter();
      await footer.scrollIntoViewIfNeeded();
      // The run's store has Instagram: four blocks (FER-044).
      const boxes = await Promise.all(
        [
          footer.getByTestId("store-footer-brand"),
          footer.getByRole("navigation", { name: "Tienda" }),
          footer.getByRole("region", { name: "Ayuda" }),
          footer.getByRole("region", { name: "Seguinos" }),
        ].map(async (block) => await block.boundingBox())
      );
      const credit = await footer
        .getByRole("link", { name: /Hecho por Lucas Regalado/u })
        .boundingBox();
      const left = boxes[0]?.x ?? 0;
      const last = boxes.at(-1);

      // The page's margin on both sides: 28 px from md up.
      expect(left).toBe(28);
      expect(Math.round((last?.x ?? 0) + (last?.width ?? 0))).toBe(width - 28);
      // The bottom row keeps its place: the credit on the right edge.
      expect(Math.round((credit?.x ?? 0) + (credit?.width ?? 0))).toBe(
        width - 28
      );
      const gaps = boxes
        .slice(1)
        .map(
          (box, index) =>
            (box?.x ?? 0) -
            ((boxes[index]?.x ?? 0) + (boxes[index]?.width ?? 0))
        );
      for (const gap of gaps) {
        expect(Math.abs(gap - (gaps[0] ?? 0))).toBeLessThanOrEqual(1);
      }
      // All on one row.
      expect(new Set(boxes.map((box) => Math.round(box?.y ?? 0))).size).toBe(1);
      // The story's measure is held, however wide the window.
      expect(
        (await footer.getByTestId("store-footer-story").boundingBox())?.width
      ).toBeLessThanOrEqual(400);
    });
  }

  test("the cart button says how many units the browser's one cart holds", async ({
    page,
  }) => {
    const storePage = new StorePage(page);
    await storePage.goto();
    await expect(storePage.getCartButton()).toHaveAccessibleName(
      "Carrito, vacío"
    );

    await page.evaluate(() => {
      localStorage.setItem(
        "feria:cart",
        JSON.stringify([
          { productId: 1, quantity: 2 },
          { productId: 2, quantity: 1 },
        ])
      );
    });
    await storePage.goto();

    await expect(storePage.getCartButton()).toHaveAccessibleName(
      "Carrito, 3 unidades"
    );
    await expect(storePage.getCartButton()).toHaveAttribute("href", "/cart");
  });
});
