import {
  expect,
  IGNORE_HTTPS_ERRORS,
  requireBaseURL,
  STORE_SETTINGS,
  test,
  uniqueTag,
} from "../../fixtures";
import { AdminComingSoonPage } from "../../page-objects/admin-coming-soon.page";
import { AdminSignInPage } from "../../page-objects/admin-sign-in.page";
import { AdminPage } from "../../page-objects/admin.page";
import { ComingSoonPage } from "../../page-objects/coming-soon.page";
import { StorePage } from "../../page-objects/store.page";

// FER-034. The `closed` project's worker publishes the coming-soon page
// through the admin's API before these tests and takes it down after them
// (`storefrontSwitch`), with every text empty: the store is closed to the
// public for this file alone. A test that edits the page or flips the switch
// asks for `comingSoonEdit`, which writes the closed, empty page back when
// it ends.

const SIGNED_OUT = { cookies: [], origins: [] };
const PHONE = { height: 812, width: 375 };
const DESKTOP = { height: 800, width: 1440 };
const DAY_MS = 86_400_000;

/** The day `days` from now in Montevideo, as a date input holds it. */
function montevideoDay(days: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montevideo",
  }).format(new Date(Date.now() + days * DAY_MS));
}

/** The fair's first day in Montevideo, as the page counts to it unchosen. */
const FAIR_DAY = "2026-12-05";

/**
 * Calendar days from `today` to `day` (both `YYYY-MM-DD` in Montevideo): date
 * arithmetic, independent of the app's own countdown. The page counts the
 * day in progress, so the evening before is 1 and the day itself 0.
 */
function daysBetween(today: string, day: string): number {
  return Math.max(0, (Date.parse(day) - Date.parse(today)) / DAY_MS);
}

/**
 * The countdown's text for `day`, with `today` the Montevideo day read
 * before the page was asked for: the server reads its own clock after it, so
 * across a midnight the count is the next day's. The figure is in the page
 * twice: for screen readers, and for show.
 */
function countdownText(
  day: string,
  labels: { many: string; one: string },
  today: string
): RegExp {
  const label = (days: number) =>
    `${days}${days}${days === 1 ? labels.one : labels.many}`;
  const counts = new Set([
    daysBetween(today, day),
    daysBetween(montevideoDay(0), day),
  ]);

  return new RegExp(
    `^(${[...counts].map(label).join("|")})$`.replaceAll(" ", "\\s*")
  );
}

test.describe("Published: the public sees only the coming-soon page", () => {
  test.use({ storageState: SIGNED_OUT });

  // The store's pages in both languages: the home, a catalog page, an
  // article, the cart, and an address no page answers.
  for (const [path, target] of [
    ["/", "/coming-soon"],
    ["/productos?color=dorado", "/coming-soon"],
    ["/bijouterie/anillos", "/coming-soon"],
    ["/productos/collar-de-perlas", "/coming-soon"],
    ["/cart", "/coming-soon"],
    ["/lr-market", "/coming-soon"],
    ["/en", "/en/coming-soon"],
    ["/en/productos", "/en/coming-soon"],
    ["/en/productos/pearl-necklace", "/en/coming-soon"],
  ] as const) {
    test(`${path} answers a temporary redirect to ${target}, kept by no cache`, async ({
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
      expect(response.headers()["cache-control"]).toBe("private, no-store");
    });
  }

  test("a session cookie or a notice cookie set by hand opens nothing", async ({
    request,
  }) => {
    const response = await request.get("/", {
      headers: {
        cookie:
          "better-auth.session_token=forged.signature; lr-store-preview=1",
      },
      maxRedirects: 0,
    });

    expect(response.status()).toBe(307);
    expect(
      new URL(response.headers().location ?? "", "http://x").pathname
    ).toBe("/coming-soon");
  });

  test("the admin, the API and the brand files are not behind the switch", async ({
    request,
  }) => {
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

  test("the sitemap lists nothing while the store is closed", async ({
    request,
  }) => {
    const sitemap = await request.get("/sitemap.xml");

    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).not.toContain("<loc>");
  });

  for (const [label, viewport] of [
    ["a phone", PHONE],
    ["a wide desktop", DESKTOP],
  ] as const) {
    test(`a visitor to / lands on the coming-soon page, whole and with the usual texts, on ${label}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const comingSoon = new ComingSoonPage(page);

      await page.goto("/");
      await comingSoon.waitForLoad();

      await expect(page).toHaveURL("/coming-soon");
      // Nothing saved: the dictionary's page.
      await expect(comingSoon.getHeading(1)).toHaveText("Muy pronto");
      await expect(comingSoon.getLead()).toHaveText(
        "Bijou y pistolas de burbujas. Estamos armando la tienda: seguinos y enterate cuando abra."
      );
      await expect(
        page.getByText("Feria navideña · 5 de diciembre al 5 de enero")
      ).toBeVisible();
      // The store's own Instagram (the run's settings); the brand's TikTok,
      // since the store has none.
      await expect(comingSoon.getLink("Seguinos en Instagram")).toHaveAttribute(
        "href",
        STORE_SETTINGS.instagramUrl
      );
      await expect(comingSoon.getLink("Seguinos en TikTok")).toHaveAttribute(
        "href",
        "https://www.tiktok.com/@lrmarket"
      );
      await expect(comingSoon.getMarqueeTrack()).toContainText(
        "LR MarketBijou y pistolas de burbujasFeria navideña5 dic al 5 ene"
      );
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

  test("with no day chosen, it counts the days left until the fair, and nothing once it has opened", async ({
    page,
  }) => {
    const comingSoon = new ComingSoonPage(page);
    const today = montevideoDay(0);

    await comingSoon.goto();

    if (daysBetween(today, FAIR_DAY) === 0) {
      await expect(comingSoon.getCountdown()).toHaveCount(0);
      return;
    }

    await expect(comingSoon.getCountdown()).toHaveText(
      countdownText(
        FAIR_DAY,
        { many: " días para la feria", one: " día para la feria" },
        today
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

  test("the admin still signs in, and then sees the store with the notice that it is closed", async ({
    identity,
    page,
  }) => {
    await page.goto("/admin");
    // The admin is never behind the switch: its own sign-in asks.
    await expect(page).toHaveURL(/\/admin\/sign-in\?next=/u);
    const signIn = new AdminSignInPage(page);
    await signIn.waitForLoad();

    await signIn.signIn(identity.email, identity.password);

    await new AdminPage(page).waitForLoad();
    const store = new StorePage(page);
    await store.goto();
    await expect(store.getHeader()).toContainText(STORE_SETTINGS.name);
    await expect(store.getPreviewNotice()).toContainText(
      "La tienda está cerrada al público. La ves porque iniciaste sesión."
    );
  });
});

test.describe("Published: a signed-in admin sees the store", () => {
  test("the home, with a notice that leads to the screen that opens it", async ({
    page,
  }) => {
    const store = new StorePage(page);

    const response = await page.goto("/");

    expect(response?.status()).toBe(200);
    await store.waitForLoad();
    await expect(page).toHaveURL("/");
    await expect(store.getHeading(1)).toHaveText(STORE_SETTINGS.name);
    const notice = store.getPreviewNotice();
    await expect(notice).toContainText(
      "La tienda está cerrada al público. La ves porque iniciaste sesión."
    );

    await notice
      .getByRole("link", { name: "Administrar Próximamente" })
      .click();

    const screen = new AdminComingSoonPage(page);
    await screen.waitForLoad();
    await expect(page).toHaveURL("/admin/settings/coming-soon");
    await expect(screen.state()).toHaveText("Publicada");
  });

  test("an article, in both languages, with the notice in each", async ({
    db,
    page,
  }) => {
    const tag = uniqueTag();
    const rings = await db.seed.createCategory({
      nameEs: `Anillos ${tag}`,
      slug: `anillos-${tag}`,
    });
    const article = await db.seed.createArticle({
      categoryId: rings.id,
      priceAmount: 120_000,
      title: `Anillo ${tag}`,
    });
    const store = new StorePage(page);

    await page.goto(`/productos/${article.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      `Anillo ${tag}`
    );
    await expect(store.getPreviewNotice()).toContainText(
      "La tienda está cerrada al público."
    );

    await page.goto(`/en/productos/${article.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      `Anillo ${tag}`
    );
    await expect(store.getPreviewNotice()).toContainText(
      "The store is closed to the public. You see it because you are signed in."
    );
    await expect(
      store
        .getPreviewNotice()
        .getByRole("link", { name: "Manage the coming-soon page" })
    ).toHaveAttribute("href", "/en/admin/settings/coming-soon");
  });
});

test.describe("Managed from the admin", () => {
  test("texts and a day edited in the admin show on the page in both languages", async ({
    baseURL,
    browser,
    comingSoonEdit: _restoresThePage,
    page,
  }) => {
    const day = montevideoDay(10);
    const screen = new AdminComingSoonPage(page);
    await screen.open();
    await expect(screen.field("Título en español")).toHaveAttribute(
      "placeholder",
      "Muy\npronto"
    );

    await screen
      .field("Línea sobre el título, en español")
      .fill("Feria navideña · desde el sábado");
    await screen.field("Título en español").fill("Abrimos\nel sábado");
    await screen
      .field("Texto debajo del título, en español")
      .fill("Te esperamos en la feria.");
    await screen
      .field("Banda en movimiento, en español")
      .fill("Bijou\nBurbujas");
    await screen
      .field("Línea sobre el título, en inglés")
      .fill("Christmas fair · from Saturday");
    await screen.field("Título en inglés").fill("We open\nSaturday");
    await screen
      .field("Texto debajo del título, en inglés")
      .fill("See you at the fair.");
    await screen.countdownField().fill(day);
    await screen.save({ countdownTo: day });

    // The public's view, in a context of its own.
    const visitor = await browser.newContext({
      baseURL: requireBaseURL(baseURL),
      ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
      storageState: SIGNED_OUT,
    });
    try {
      const comingSoon = new ComingSoonPage(await visitor.newPage());
      const today = montevideoDay(0);
      await comingSoon.goto();
      await expect(comingSoon.getHeading(1)).toHaveText("Abrimos el sábado");
      await expect(
        comingSoon.page.getByText("Feria navideña · desde el sábado")
      ).toBeVisible();
      await expect(comingSoon.getLead()).toHaveText(
        "Te esperamos en la feria."
      );
      await expect(comingSoon.getMarqueeTrack()).toContainText(
        "LR MarketBijouBurbujas"
      );
      await expect(comingSoon.getCountdown()).toHaveText(
        countdownText(
          day,
          { many: " días para la feria", one: " día para la feria" },
          today
        )
      );

      await comingSoon.gotoEnglish();
      await expect(comingSoon.getHeading(1)).toHaveText("We open Saturday");
      await expect(
        comingSoon.page.getByText("Christmas fair · from Saturday")
      ).toBeVisible();
      await expect(comingSoon.getLead()).toHaveText("See you at the fair.");
      // The English band was left empty: the English default.
      await expect(comingSoon.getMarqueeTrack()).toContainText(
        "LR MarketJewelry and bubble gunsChristmas fairDec 5 to Jan 5"
      );
      await expect(comingSoon.getCountdown()).toHaveText(
        countdownText(
          day,
          { many: " days until the fair", one: " day until the fair" },
          today
        )
      );
    } finally {
      await visitor.close();
    }
  });

  test("an empty text falls back to the usual one, language by language", async ({
    baseURL,
    browser,
    comingSoonEdit,
  }) => {
    await comingSoonEdit.update({
      countdownTo: null,
      translations: [
        {
          eyebrow: null,
          headline: "Abrimos",
          lead: null,
          locale: "es",
          marquee: null,
        },
      ],
    });
    const visitor = await browser.newContext({
      baseURL: requireBaseURL(baseURL),
      ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
      storageState: SIGNED_OUT,
    });

    try {
      const comingSoon = new ComingSoonPage(await visitor.newPage());
      await comingSoon.goto();
      await expect(comingSoon.getHeading(1)).toHaveText("Abrimos");
      await expect(comingSoon.getLead()).toHaveText(
        "Bijou y pistolas de burbujas. Estamos armando la tienda: seguinos y enterate cuando abra."
      );

      // Never the Spanish headline to an English reader.
      await comingSoon.gotoEnglish();
      await expect(comingSoon.getHeading(1)).toHaveText("Opening soon");
    } finally {
      await visitor.close();
    }
  });

  test("taking the page down opens the store to the public and sends the page home; publishing again, after a confirmation, closes it", async ({
    baseURL,
    comingSoonEdit: _restoresThePage,
    page,
    playwright,
  }) => {
    const visitor = await playwright.request.newContext({
      baseURL: requireBaseURL(baseURL),
      ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
      storageState: SIGNED_OUT,
    });
    const at = async (path: string) => {
      const response = await visitor.get(path, { maxRedirects: 0 });

      return {
        location: new URL(response.headers().location ?? "/", "http://x")
          .pathname,
        status: response.status(),
      };
    };

    try {
      const screen = new AdminComingSoonPage(page);
      await screen.open();
      await expect(screen.state()).toHaveText("Publicada");

      await screen.unpublish();

      // The proxy sees a flip within its window: wait for exactly that.
      await expect.poll(async () => (await at("/")).status).toBe(200);
      expect(await at("/en/productos")).toMatchObject({ status: 200 });
      expect(await at("/coming-soon")).toEqual({ location: "/", status: 307 });
      expect(await at("/en/coming-soon")).toEqual({
        location: "/en",
        status: 307,
      });

      await screen.publish();

      await expect.poll(async () => (await at("/")).status).toBe(307);
      expect(await at("/en")).toEqual({
        location: "/en/coming-soon",
        status: 307,
      });
    } finally {
      await visitor.dispose();
    }
  });
});
