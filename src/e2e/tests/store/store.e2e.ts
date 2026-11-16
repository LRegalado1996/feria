import type { Page } from "@playwright/test";

import { STORE_THEME } from "../../../styles/theme";
import { expect, STORE_SETTINGS, STORE_TEXTS, test } from "../../fixtures";
import { StorePage } from "../../page-objects/store.page";

// The store's home (FER-038: the site is one store, at `/`), with the run's
// settings (`STORE_SETTINGS`). Specs that change them are
// `store-settings.serial.e2e.ts`.
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * The home's intro, where the tagline is checked: the footer repeats it
 * (FER-021). The visible one, since a page left by a language switch stays
 * mounted, hidden.
 */
function introOf(page: Page) {
  return page.getByTestId("store-intro-header").filter({ visible: true });
}

/** A theme color as the browser computes it: `#f2f3f0` is `rgb(242, 243, 240)`. */
function rgb(hex: string) {
  const channel = (start: number) =>
    Number.parseInt(hex.slice(start, start + 2), 16);

  return `rgb(${channel(1)}, ${channel(3)}, ${channel(5)})`;
}

test.describe("Store pages", () => {
  test("the home wears the theme file's colors, which are code, not data", async ({
    page,
  }) => {
    const storePage = new StorePage(page);

    await storePage.goto();

    await expect(storePage.getHeading(1)).toHaveText(STORE_SETTINGS.name);
    // The white page, the lime bar and the moss header (FER-039).
    await expect(storePage.getTheme()).toHaveCSS(
      "background-color",
      rgb(STORE_THEME.background)
    );
    await expect(storePage.getAnnouncementBar()).toHaveCSS(
      "background-color",
      rgb(STORE_THEME.accent)
    );
    await expect(storePage.getSiteHeader()).toHaveCSS(
      "background-color",
      rgb(STORE_THEME.contrast)
    );
    // The store's name in ink on the page, never the accent on white.
    await expect(storePage.getHeader()).toHaveCSS(
      "background-color",
      rgb(STORE_THEME.background)
    );
    await expect(
      storePage.getHeading(1).getByText(STORE_SETTINGS.name)
    ).toHaveCSS("color", rgb(STORE_THEME.foreground));
    await expect(storePage.getDescription()).toHaveCSS(
      "color",
      rgb(STORE_THEME.foreground)
    );
  });

  test("shows the store in Spanish at / and in English under /en, each declaring the other", async ({
    page,
  }) => {
    const storePage = new StorePage(page);

    await storePage.goto();

    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(introOf(page).getByText(STORE_TEXTS.es.tagline)).toBeVisible();
    await expect(storePage.getDescription()).toHaveText(
      STORE_TEXTS.es.description
    );
    await expect(page).toHaveTitle(STORE_SETTINGS.name);

    await storePage.gotoEnglish();

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(introOf(page).getByText(STORE_TEXTS.en.tagline)).toBeVisible();
    await expect(storePage.getDescription()).toHaveText(
      STORE_TEXTS.en.description
    );
    await expect(storePage.getHeading(1)).toHaveText(STORE_SETTINGS.name);
    await expect(page).toHaveTitle(STORE_SETTINGS.name);
    await expect(
      page.locator('link[rel="alternate"][hreflang="es"]')
    ).toHaveAttribute("href", /^https?:\/\/[^/]+\/?$/u);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /^https?:\/\/[^/]+\/en$/u
    );
  });
});
