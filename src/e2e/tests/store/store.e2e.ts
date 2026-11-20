import { STORE_THEME } from "../../../styles/theme";
import {
  expect,
  IGNORE_HTTPS_ERRORS,
  requireBaseURL,
  STORE_SETTINGS,
  STORE_TEXTS,
  test,
} from "../../fixtures";
import { StorePage } from "../../page-objects/store.page";

const BINGBOT =
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)";

// The store's home (FER-038: the site is one store, at `/`), with the run's
// settings (`STORE_SETTINGS`). Specs that change them are
// `store-settings.serial.e2e.ts`. What the home shows under its header is the
// curation every spec shares, and parallel specs add articles to it, so this
// spec asserts only what holds whatever it shows; the sections themselves
// are `home.serial.e2e.ts` (FER-022).
test.use({ storageState: { cookies: [], origins: [] } });

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
  });

  test("shows the store in Spanish at / and in English under /en, each declaring the other", async ({
    page,
  }) => {
    const storePage = new StorePage(page);

    await storePage.goto();

    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(storePage.getHeading(1)).toHaveText(STORE_SETTINGS.name);
    await expect(page).toHaveTitle(STORE_SETTINGS.name);
    // Next streams the metadata into the body for a browser: read it once
    // it is there.
    await expect
      .poll(async () => await storePage.readMeta("description"))
      .toBe(STORE_TEXTS.es.description);
    expect(await storePage.readMeta("og:description")).toBe(
      STORE_TEXTS.es.tagline
    );

    await storePage.gotoEnglish();

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(storePage.getHeading(1)).toHaveText(STORE_SETTINGS.name);
    await expect(page).toHaveTitle(STORE_SETTINGS.name);
    await expect
      .poll(async () => await storePage.readMeta("description"))
      .toBe(STORE_TEXTS.en.description);
    await expect(
      page.locator('link[rel="alternate"][hreflang="es"]')
    ).toHaveAttribute("href", /^https?:\/\/[^/]+\/?$/u);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /^https?:\/\/[^/]+\/en$/u
    );
  });

  // A crawler that reads only the HTML, such as Bingbot, sees only what the
  // server wrote in place: a boundary's content that a script would reveal
  // never shows to it, so the home and its footer must sit behind none
  // (docs/agents/nextjs.md § Store pages). The sections are checked the same
  // way in `home.serial.e2e.ts`, where the test sets them.
  test("a crawler that runs no script finds the whole home in the HTML: the store's name, what it shows and its footer", async ({
    baseURL,
    browser,
  }) => {
    // A hand-made context gets none of the config's `use` options.
    const context = await browser.newContext({
      baseURL: requireBaseURL(baseURL),
      ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
      javaScriptEnabled: false,
      userAgent: BINGBOT,
    });

    try {
      const page = await context.newPage();
      const storePage = new StorePage(page);
      await storePage.goto();

      await expect(storePage.getHeading(1)).toHaveText(STORE_SETTINGS.name);
      await expect(storePage.getHomeView()).toBeAttached();
      await expect(
        storePage.getFooter().getByRole("link", {
          name: `Instagram de ${STORE_SETTINGS.name}`,
        })
      ).toHaveAttribute("href", STORE_SETTINGS.instagramUrl);
    } finally {
      await context.close();
    }
  });
});
