import { daysUntilFair } from "../../../lib/brand/fair";
import { expect, STORE_SETTINGS, test } from "../../fixtures";
import { ComingSoonPage } from "../../page-objects/coming-soon.page";
import { StorePage } from "../../page-objects/store.page";

// The server Playwright starts lets this header set the launch switch for one
// request (src/lib/env/launch.ts), so both positions run against one build.
const CLOSED = { "x-e2e-storefront-launched": "false" };
const OPEN = { "x-e2e-storefront-launched": "true" };

const PHONE = { height: 812, width: 375 };
const DESKTOP = { height: 800, width: 1440 };

test.describe("Launch switch off: the store is closed", () => {
  test.use({
    extraHTTPHeaders: CLOSED,
    storageState: { cookies: [], origins: [] },
  });

  // The store's pages (FER-038), and an address no page answers.
  for (const [path, target] of [
    ["/", "/coming-soon"],
    ["/products?color=dorado", "/coming-soon"],
    ["/products/collar-de-perlas", "/coming-soon"],
    ["/cart", "/coming-soon"],
    ["/lr-market", "/coming-soon"],
    ["/en", "/en/coming-soon"],
    ["/en/products/pearl-necklace", "/en/coming-soon"],
  ] as const) {
    test(`${path} answers a temporary redirect to ${target}`, async ({
      request,
    }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      const location = new URL(
        response.headers().location ?? "",
        "http://localhost"
      );

      expect(response.status()).toBe(307);
      expect(location.pathname).toBe(target);
      expect(location.search).toBe("");
    });
  }

  test("the admin, the API and the brand files are not behind the switch", async ({
    request,
  }) => {
    // The admin's sign-in is served as itself, never sent to the
    // coming-soon page (FER-013).
    const admin = await request.get("/admin/sign-in", { maxRedirects: 0 });
    expect(admin.status()).toBe(200);
    expect(admin.headers().location).toBeUndefined();

    const health = await request.get("/api/health", { maxRedirects: 0 });
    expect(health.headers().location).toBeUndefined();
    expect(health.headers()["content-type"]).toContain("application/json");

    const logo = await request.get("/brand/lr-market-logo.svg", {
      maxRedirects: 0,
    });
    expect(logo.status()).toBe(200);
  });

  for (const [label, viewport] of [
    ["a phone", PHONE],
    ["a wide desktop", DESKTOP],
  ] as const) {
    test(`a visitor to / lands on the coming-soon page, whole on ${label}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const comingSoon = new ComingSoonPage(page);

      await page.goto("/");
      await comingSoon.waitForLoad();

      await expect(page).toHaveURL("/coming-soon");
      await expect(comingSoon.getHeading(1)).toHaveText("Muy pronto");
      await expect(
        page.getByText("Feria navideña · 5 de diciembre al 5 de enero")
      ).toBeVisible();
      await expect(comingSoon.getLink("Seguinos en Instagram")).toHaveAttribute(
        "href",
        "https://www.instagram.com/lrmarket"
      );
      await expect(comingSoon.getLink("Seguinos en TikTok")).toHaveAttribute(
        "href",
        "https://www.tiktok.com/@lrmarket"
      );
      await expect(comingSoon.getMarqueeTrack()).toBeVisible();
      await comingSoon.expectNoHorizontalScroll();
    });
  }

  test("it is titled, kept out of search engines and shares with the brand's card", async ({
    page,
  }) => {
    const comingSoon = new ComingSoonPage(page);

    await comingSoon.goto();

    await expect(page).toHaveTitle("Muy pronto · LR Market");

    const head = await comingSoon.readHeadTags();
    const meta = (key: string) => head.find((tag) => tag.key === key)?.content;

    expect(meta("robots")).toBe("noindex, nofollow");
    expect(meta("og:title")).toBe("Muy pronto · LR Market");
    expect(new URL(meta("og:image") ?? "").pathname).toBe(
      "/es/opengraph-image"
    );
  });

  test("it counts the days left until the fair, and nothing once it has opened", async ({
    page,
  }) => {
    const comingSoon = new ComingSoonPage(page);

    // The server reads its own clock between these two readings of the same
    // one: the count is the first, or the second across a day's end.
    const before = daysUntilFair(Date.now());
    await comingSoon.goto();
    const label = (days: number) =>
      `${days}${days}${days === 1 ? " día" : " días"} para la feria`;

    if (before === 0) {
      await expect(comingSoon.getCountdown()).toHaveCount(0);
      return;
    }

    // The figure is in the page twice: for screen readers, and for show.
    await expect(comingSoon.getCountdown()).toHaveText(
      new RegExp(
        `^(${label(before)}|${label(daysUntilFair(Date.now()))})$`.replaceAll(
          " ",
          "\\s*"
        )
      )
    );
  });

  test("the toggle leads to the same page in English", async ({ page }) => {
    const comingSoon = new ComingSoonPage(page);

    await comingSoon.goto();
    await expect(comingSoon.getLocaleToggle()).toHaveAttribute(
      "href",
      "/en/coming-soon"
    );
    await comingSoon.getLocaleToggle().click();

    await expect(page).toHaveURL("/en/coming-soon");
    await expect(
      page.getByRole("heading", { level: 1, name: "Opening soon" })
    ).toBeVisible();
    await comingSoon.expectDocumentLanguage("en");
  });

  test("pressing the logo blows a new burst of bubbles", async ({ page }) => {
    const comingSoon = new ComingSoonPage(page);

    await comingSoon.goto();
    await expect(comingSoon.getBubbleLayer()).toHaveAttribute(
      "data-burst",
      "0"
    );

    await comingSoon.blowBubbles();

    await expect(comingSoon.getBubbleLayer()).not.toHaveAttribute(
      "data-burst",
      "0"
    );
  });

  test("with reduced motion nothing moves: no bubbles, no bubble button, a still marquee", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const comingSoon = new ComingSoonPage(page);

    await comingSoon.goto();

    await expect(comingSoon.getBubblesButton()).toHaveCount(0);
    await expect(comingSoon.getBubbleLayer()).toHaveCount(0);
    await expect(comingSoon.getMarqueeTrack()).toHaveCSS(
      "animation-name",
      "none"
    );
    await expect(
      page.getByRole("banner").getByRole("img", { name: "LR Market" })
    ).toBeVisible();
  });
});

test.describe("Launch switch on: the store is open", () => {
  test.use({
    extraHTTPHeaders: OPEN,
    storageState: { cookies: [], origins: [] },
  });

  test("/ opens the store's home, in the language of the address", async ({
    page,
  }) => {
    const storePage = new StorePage(page);

    const response = await page.goto("/");

    expect(response?.status()).toBe(200);
    await storePage.waitForLoad();
    await expect(page).toHaveURL("/");
    await expect(storePage.getHeading(1)).toHaveText(STORE_SETTINGS.name);
    await storePage.expectDocumentLanguage("es");

    await page.goto("/en");

    await storePage.waitForLoad();
    await expect(page).toHaveURL("/en");
    await expect(storePage.getHeading(1)).toHaveText(STORE_SETTINGS.name);
    await storePage.expectDocumentLanguage("en");
  });

  for (const [path, target] of [
    ["/coming-soon", "/"],
    ["/en/coming-soon", "/en"],
  ] as const) {
    test(`${path} is unreachable: it leads home to ${target}`, async ({
      request,
    }) => {
      const response = await request.get(path, { maxRedirects: 0 });

      expect(response.status()).toBe(307);
      expect(
        new URL(response.headers().location ?? "", "http://localhost").pathname
      ).toBe(target);
    });
  }
});
