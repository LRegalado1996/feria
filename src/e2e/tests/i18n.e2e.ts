import { expect, requireBaseURL, test } from "../fixtures";
import { completeRpcAction } from "../fixtures/complete-rpc-action";
import { HomePage } from "../page-objects/home.page";

const QUERY = "?ref=qr&color=dorado";
const DARK_CLASS = /\bdark\b/;

test.describe("Languages, signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the same page is Spanish at / and English at /en", async ({ page }) => {
    const homePage = new HomePage(page);

    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Hola de nuevo" })
    ).toBeVisible();
    await expect(homePage.getButton("Iniciar sesión")).toBeVisible();
    await homePage.expectDocumentLanguage("es");

    await page.goto("/en");

    await expect(
      page.getByRole("heading", { name: "Welcome back" })
    ).toBeVisible();
    await expect(homePage.getButton("Sign In")).toBeVisible();
    await homePage.expectDocumentLanguage("en");
  });

  test("the toggle switches language on the same page and keeps the query string, there and back", async ({
    page,
  }) => {
    // A dark system theme, to see that switching language keeps it.
    await page.emulateMedia({ colorScheme: "dark" });
    const homePage = new HomePage(page);
    await page.goto(`/${QUERY}`);
    await homePage.expectDocumentLanguage("es");

    // The query string reaches the link once React has read the URL: the
    // prerendered shell is the same for every query.
    await expect(homePage.getLocaleToggle()).toHaveAttribute(
      "href",
      `/en${QUERY}`
    );
    await expect(homePage.getLocaleToggle()).toHaveText("English");
    await homePage.getLocaleToggle().click();

    await expect(page).toHaveURL(`/en${QUERY}`);
    await expect(
      page.getByRole("heading", { name: "Welcome back" })
    ).toBeVisible();
    await homePage.expectDocumentLanguage("en");
    await expect(page.locator("html")).toHaveClass(DARK_CLASS);

    await expect(homePage.getLocaleToggle()).toHaveAttribute(
      "href",
      `/${QUERY}`
    );
    await expect(homePage.getLocaleToggle()).toHaveText("Español");
    await homePage.getLocaleToggle().click();

    await expect(page).toHaveURL(`/${QUERY}`);
    await expect(
      page.getByRole("heading", { name: "Hola de nuevo" })
    ).toBeVisible();
    await homePage.expectDocumentLanguage("es");
  });

  test("a Spanish page has one address: /es redirects to the unprefixed URL", async ({
    page,
  }) => {
    await page.goto(`/es${QUERY}`);

    await expect(page).toHaveURL(`/${QUERY}`);
    await expect(
      page.getByRole("heading", { name: "Hola de nuevo" })
    ).toBeVisible();
  });

  for (const { canonical, path } of [
    { path: "/", canonical: "/" },
    { path: "/en", canonical: "/en" },
  ]) {
    test(`${path} declares itself canonical and names both languages to search engines`, async ({
      baseURL,
      page,
    }) => {
      const origin = requireBaseURL(baseURL);
      await page.goto(path);

      // <head> metadata has no role, label or test id to be found by. Every
      // match is read: the prerendered shell and the request each write the
      // tags, and React merges them only when they are identical, which they
      // are not when a build and its server disagree on the origin (as
      // `pnpm e2e:ci` does on purpose). So the tag this server wrote must be
      // the page's full URL on this origin, and no tag may name another page.
      const hrefsOf = async (selector: string) =>
        await page
          .locator(selector)
          .evaluateAll((links) =>
            links.map((link) => new URL(link.getAttribute("href") ?? "").href)
          );
      const expectLinks = async (selector: string, pathname: string) => {
        const hrefs = await hrefsOf(selector);

        expect(hrefs).toContain(new URL(pathname, origin).href);
        expect([
          ...new Set(hrefs.map((href) => new URL(href).pathname)),
        ]).toEqual([pathname]);
      };

      await expectLinks('head link[rel="canonical"]', canonical);
      await expectLinks('head link[rel="alternate"][hreflang="es"]', "/");
      await expectLinks('head link[rel="alternate"][hreflang="en"]', "/en");
      await expectLinks(
        'head link[rel="alternate"][hreflang="x-default"]',
        "/"
      );
    });
  }

  test("signing in on the English page lands on the English home", async ({
    identity,
    page,
  }) => {
    const homePage = new HomePage(page);
    await page.goto("/en");
    // The submit button is enabled only once React owns the form.
    await expect(homePage.getButton("Sign In")).toBeEnabled();
    await homePage.fillField("Email", identity.email);
    await homePage.fillField("Password", identity.password);

    await completeRpcAction(
      page,
      "/api/auth/sign-in/email",
      async () => {
        await homePage.getButton("Sign In").click();
      },
      { input: { email: identity.email } }
    );

    await expect(homePage.getButton("Sign out")).toBeVisible();
    await expect(page).toHaveURL("/en");
    await homePage.expectDocumentLanguage("en");
  });
});

test.describe("Languages, signed in", () => {
  test("the feed is in English under /en, and the toggle brings it back to Spanish", async ({
    authenticatedPage: page,
  }) => {
    const homePage = new HomePage(page);
    await page.goto("/en");

    await expect(page.getByRole("heading", { name: "Feed" })).toBeVisible();
    await expect(homePage.getButton("Sign out")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "New post" })).toBeVisible();
    await homePage.expectDocumentLanguage("en");

    await homePage.getLocaleToggle().click();

    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: "Muro" }).filter({ visible: true })
    ).toBeVisible();
    await expect(homePage.getButton("Cerrar sesión")).toBeVisible();
    await homePage.expectDocumentLanguage("es");
  });

  for (const { path, signOut } of [
    { path: "/", signOut: "Cerrar sesión" },
    { path: "/en", signOut: "Sign out" },
  ]) {
    test(`the navbar of ${path} fits a phone: nothing is cut off and the page does not scroll sideways`, async ({
      authenticatedPage: page,
    }) => {
      await page.setViewportSize({ width: 375, height: 720 });
      const homePage = new HomePage(page);

      await page.goto(path);

      await expect(homePage.getButton(signOut)).toBeInViewport({ ratio: 1 });
      await expect(homePage.getLocaleToggle()).toBeInViewport({ ratio: 1 });
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth
        )
      ).toBe(0);
    });
  }
});
