import { expect, test } from "../../fixtures";
import { DesignPage } from "../../page-objects/design.page";

const PHONE = { height: 812, width: 375 };
const DESKTOP = { height: 800, width: 1280 };

/** How long each banner of the cover stays (`COVER_DELAY_MS` in its component). */
const COVER_DELAY_MS = 6000;

test.describe("Storefront design system", () => {
  // The gallery is public: no session decides what it shows.
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const [label, viewport] of [
    ["a phone", PHONE],
    ["a desktop", DESKTOP],
  ] as const) {
    test(`shows every component in Spanish on ${label}, never wider than the window`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const designPage = new DesignPage(page);

      await designPage.goto();

      await expect(designPage.getHeading(1)).toHaveText("Sistema de diseño");
      await expect(page.locator("html")).toHaveAttribute("lang", "es");
      await expect(
        designPage.getByTestId("design-page").getByRole("heading", {
          level: 2,
        })
      ).toHaveText([
        "Logo",
        "Colores",
        "Titulares",
        "Botones",
        "Chips y etiquetas",
        "Precio",
        "Enlace con flecha",
        "Número que cuenta",
        "Fila de artículos",
        "Banner",
        "Artículo en vidriera",
        "Cómo comprar",
        "Portada que se mueve",
        "Banda en movimiento",
        "Burbujas",
        "Aparición al bajar",
        "Barra, encabezado y pie",
        // The sample footer's own headings close the gallery.
        "Tienda",
        "Ayuda",
        "Contacto",
      ]);
      await expect(
        designPage.getSection("cards").getByRole("article")
      ).toHaveCount(6);
      await designPage.expectNoHorizontalScroll();
    });
  }

  test("is the same page in English under /en, with English prices", async ({
    page,
  }) => {
    const designPage = new DesignPage(page);

    await designPage.gotoEnglish();

    await expect(designPage.getHeading(1)).toHaveText("Design system");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    // The large price, then the reduced one, read with what it cost before.
    await expect(
      designPage
        .getSection("price")
        .locator('[data-slot="store-price-tag"][data-size="lg"]')
    ).toHaveText("UYU 1,290");
    await expect(
      designPage.getSection("price").getByText("Was UYU 1,290")
    ).toBeVisible();
    await expect(page).toHaveTitle("Storefront design system");
  });

  test("is kept out of search engines", async ({ page }) => {
    const designPage = new DesignPage(page);

    await designPage.goto();

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, nofollow"
    );
  });

  test("with motion allowed the marquee moves", async ({ page }) => {
    const designPage = new DesignPage(page);

    await designPage.goto();

    await expect(designPage.getMarqueeTrack()).toHaveCSS(
      "animation-name",
      "store-marquee"
    );
  });

  test("the marquee stops and starts again from its pause button", async ({
    page,
  }) => {
    const designPage = new DesignPage(page);
    await designPage.goto();
    const pause = designPage.getMarqueePause();
    await pause.scrollIntoViewIfNeeded();

    // A click before React owns the button is lost and leaves it unpressed,
    // so the click is repeated only while it has not landed.
    await expect(async () => {
      await pause.click();
      await expect(pause).toHaveAttribute("aria-pressed", "true", {
        timeout: 1000,
      });
    }).toPass();
    await expect(designPage.getMarqueeTrack()).toHaveCSS(
      "animation-play-state",
      "paused"
    );

    await pause.click();

    await expect(pause).toHaveAttribute("aria-pressed", "false");
    await expect(designPage.getMarqueeTrack()).toHaveCSS(
      "animation-play-state",
      "running"
    );
  });

  test("under reduced motion the marquee does not move and offers nothing to pause", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const designPage = new DesignPage(page);

    await designPage.goto();

    await expect(designPage.getMarqueePause()).toBeHidden();
    await expect(designPage.getMarqueeTrack()).toHaveCSS(
      "animation-name",
      "none"
    );
    await designPage.expectNoHorizontalScroll();
  });

  test("the row's round arrow pages through the cards, then leads back to the start", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    const designPage = new DesignPage(page);
    await designPage.goto();
    const row = designPage.getRow();
    const next = row.getByRole("button", { name: "Ver más de Novedades" });
    const restart = row.getByRole("button", {
      name: "Volver al principio de Novedades",
    });
    await row.scrollIntoViewIfNeeded();

    // A click before React owns the arrow is lost. It is repeated only while
    // the row has not left its start, so exactly one lands.
    await expect(async () => {
      if ((await designPage.firstCardOffset()) === 0) {
        await next.click();
      }

      await expect
        .poll(async () => await designPage.firstCardOffset(), {
          timeout: 1000,
        })
        .toBeLessThan(0);
    }).toPass();

    // The arrow pages until the last card is in view, then turns back.
    await expect(async () => {
      if (await next.isVisible()) {
        await next.click();
      }

      await expect(restart).toBeVisible({ timeout: 1000 });
    }).toPass();
    await restart.click();

    await expect.poll(async () => await designPage.firstCardOffset()).toBe(0);
    await expect(next).toBeVisible();
  });

  test("the row steps with the arrow keys while a card has focus", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    const designPage = new DesignPage(page);
    await designPage.goto();
    const firstCard = designPage
      .getRow()
      .getByRole("link", { name: "Collar de perlas" });
    await firstCard.scrollIntoViewIfNeeded();

    // A key pressed before React owns the row moves nothing: pressed again
    // only while the row still rests at its start.
    await expect(async () => {
      if ((await designPage.firstCardOffset()) === 0) {
        await firstCard.focus();
        await page.keyboard.press("ArrowRight");
      }

      await expect
        .poll(async () => await designPage.firstCardOffset(), {
          timeout: 1000,
        })
        .toBeLessThan(0);
    }).toPass();
  });

  test("the cover moves to its next banner on its own, and its pause button says it stopped", async ({
    page,
  }) => {
    const designPage = new DesignPage(page);
    await designPage.goto();
    const cover = designPage.getCover();
    await cover.scrollIntoViewIfNeeded();
    // Moving the pointer off the cover: hovering it holds it.
    await page.mouse.move(0, 0);

    // Each banner stays six seconds before the next one comes.
    await expect(
      cover.getByRole("button", { name: "Ver la portada 2" })
    ).toHaveAttribute("aria-current", "true", { timeout: 15_000 });

    const pause = cover.getByRole("button", { name: "Pausar la portada" });
    await pause.click();
    await expect(pause).toHaveAttribute("aria-pressed", "true");
    // Still, it announces the banner a dot shows.
    await expect(cover.locator('[data-slot="carousel-track"]')).toHaveAttribute(
      "aria-live",
      "polite"
    );
    await cover.getByRole("button", { name: "Ver la portada 3" }).click();
    await expect(
      cover.getByRole("button", { name: "Ver la portada 3" })
    ).toHaveAttribute("aria-current", "true");
  });

  test("under reduced motion the cover stays still past a banner's time and offers no pause button", async ({
    page,
  }) => {
    // The page's timers follow a clock the test moves, so the cover's
    // delay is passed without being waited out.
    await page.clock.install();
    await page.emulateMedia({ reducedMotion: "reduce" });
    const designPage = new DesignPage(page);
    await designPage.goto();
    const cover = designPage.getCover();
    await cover.scrollIntoViewIfNeeded();
    // Hovering would hold it still too, and hide a cover that moves.
    await page.mouse.move(0, 0);

    // The server renders a pause button: its going says React has read
    // the setting, and the cover is announced as a still one.
    await expect(
      cover.getByRole("button", { name: "Pausar la portada" })
    ).toHaveCount(0);
    await expect(cover.locator('[data-slot="carousel-track"]')).toHaveAttribute(
      "aria-live",
      "polite"
    );

    // From here time moves only when the test says: a check retried while
    // it flowed could wait for a moving cover to come round to its first
    // banner again.
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    // Half again the time a banner stays: a cover that moved would show
    // its second banner, too soon to have come round to the first again.
    await page.clock.runFor(COVER_DELAY_MS * 1.5);

    await expect(
      cover.getByRole("button", { name: "Ver la portada 1" })
    ).toHaveAttribute("aria-current", "true");
  });

  test("a block below the fold waits, then reveals when scrolled to", async ({
    page,
  }) => {
    const designPage = new DesignPage(page);
    await designPage.goto();
    const reveal = designPage.getReveal();

    const line = reveal.getByText("Collares", { exact: true });

    // Held back only once React has seen it is off screen, and its heading
    // waits with it instead of playing where nobody is looking.
    await expect(reveal).toHaveAttribute("data-state", "pending");
    await expect(line).toHaveCSS("animation-name", "none");

    await reveal.scrollIntoViewIfNeeded();

    await expect(reveal).toHaveAttribute("data-state", "entered");
    await expect(reveal).toBeVisible();
    await expect(line).toHaveCSS("animation-name", "store-line");
  });

  test("the count-up ends on its figure after scrolling to it", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    const designPage = new DesignPage(page);
    await designPage.goto();
    const figure = designPage.getCountUpFigure();

    await expect(figure).toHaveAttribute("data-state", "pending");

    await figure.scrollIntoViewIfNeeded();

    await expect(figure).toHaveAttribute("data-state", "entered");
    await expect(figure).toHaveText("128128");
  });
});
