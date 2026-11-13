import { expect, test } from "../../fixtures";
import { DesignPage } from "../../page-objects/design.page";

const PHONE = { height: 812, width: 375 };
const DESKTOP = { height: 800, width: 1280 };

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
      await expect(page.getByRole("heading", { level: 2 })).toHaveText([
        "Titulares",
        "Chips y avisos",
        "Precio",
        "Enlace con flecha",
        "Número que cuenta",
        "Tarjeta de artículo y carrusel",
        "Banda en movimiento",
        "Aparición al bajar",
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
    await expect(
      designPage.getSection("price").getByText("UYU 1,290", { exact: true })
    ).toBeVisible();
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

    await pause.click();

    await expect(pause).toHaveAttribute("aria-pressed", "false");
  });

  test("under reduced motion the marquee does not move and offers nothing to pause", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const designPage = new DesignPage(page);

    await designPage.goto();

    await expect(designPage.getMarqueePause()).toBeHidden();
    await designPage.expectNoHorizontalScroll();
  });

  test("the slider moves with its buttons and the counter follows", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    const designPage = new DesignPage(page);
    await designPage.goto();
    const cards = designPage.getSection("cards");
    const next = cards.getByRole("button", { name: "Siguiente" });
    const previous = cards.getByRole("button", { name: "Anterior" });

    await expect(designPage.getSliderPosition()).toHaveText("1 / 6");
    await expect(previous).toHaveAttribute("aria-disabled", "true");

    // Another "next" on a slider that has not moved yet is harmless.
    await expect(async () => {
      await next.click();
      await expect(previous).toHaveAttribute("aria-disabled", "false", {
        timeout: 1000,
      });
    }).toPass();
    await expect(designPage.getSliderPosition()).not.toHaveText("1 / 6");

    await designPage.getSliderTrack().evaluate((track) => {
      track.scrollTo({ behavior: "instant", left: 0 });
    });

    await expect(designPage.getSliderPosition()).toHaveText("1 / 6");
    await expect(previous).toHaveAttribute("aria-disabled", "true");
  });

  test("the slider scrolls with the arrow keys once it has focus", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    const designPage = new DesignPage(page);
    await designPage.goto();
    const track = designPage.getSliderTrack();

    await track.focus();
    await page.keyboard.press("ArrowRight");

    await expect
      .poll(async () => await track.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0);
  });

  test("a block below the fold waits, then reveals when scrolled to", async ({
    page,
  }) => {
    const designPage = new DesignPage(page);
    await designPage.goto();
    const reveal = designPage.getReveal();

    // Held back only once React has seen it is off screen.
    await expect(reveal).toHaveAttribute("data-state", "pending");

    await reveal.scrollIntoViewIfNeeded();

    await expect(reveal).toHaveAttribute("data-state", "entered");
    await expect(reveal).toBeVisible();
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
