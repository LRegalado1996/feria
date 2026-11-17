import { expect, requireBaseURL, test } from "../fixtures";
import { completeRpcAction } from "../fixtures/complete-rpc-action";
import { AdminSignInPage } from "../page-objects/admin-sign-in.page";
import { AdminPage } from "../page-objects/admin.page";
import { StorePage } from "../page-objects/store.page";

const QUERY = "?ref=qr&color=dorado";
const DARK_CLASS = /\bdark\b/;

// The storefront's own texts per language are in `tests/store/`; these are
// the addresses: the admin and its sign-in, which every deployment has, and
// the links a store's home gives search engines.
test.describe("Languages, signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the same page is Spanish at its address and English under /en", async ({
    page,
  }) => {
    const signIn = new AdminSignInPage(page);

    await page.goto("/admin/sign-in");

    await expect(
      page.getByRole("heading", { name: "Panel de tu tienda" })
    ).toBeVisible();
    await expect(signIn.getButton("Iniciar sesión")).toBeVisible();
    await signIn.expectDocumentLanguage("es");

    await page.goto("/en/admin/sign-in");

    await expect(
      page.getByRole("heading", { name: "Your store's admin" })
    ).toBeVisible();
    await expect(signIn.getButton("Sign In")).toBeVisible();
    await signIn.expectDocumentLanguage("en");
  });

  test("a Spanish page has one address: /es redirects to the unprefixed URL", async ({
    page,
  }) => {
    await page.goto(`/es/admin/sign-in${QUERY}`);

    await expect(page).toHaveURL(`/admin/sign-in${QUERY}`);
    await expect(
      page.getByRole("heading", { name: "Panel de tu tienda" })
    ).toBeVisible();
  });

  for (const { language, prefix } of [
    { language: "Spanish", prefix: "" },
    { language: "English", prefix: "/en" },
  ]) {
    test(`a store's ${language} home declares itself canonical and names both languages to search engines`, async ({
      baseURL,
      db,
      page,
    }) => {
      const origin = requireBaseURL(baseURL);
      const store = await db.seed.createStore({ name: "Canonical Store" });
      const spanish = `/${store.slug}`;
      const english = `/en/${store.slug}`;
      await page.goto(`${prefix}/${store.slug}`);
      await new StorePage(page, store.slug).waitForLoad();

      // <head> metadata has no role, label or test id to be found by. Every
      // match is read: the prerendered shell and the request each write the
      // tags, and React merges them only when they are identical. They differ
      // when a build and its server disagree on the port, as CI and
      // `pnpm e2e:ci` do (built for :3000, served elsewhere). So one tag must
      // be the page's full URL on this origin, and any other may differ from
      // it in the port alone: never in the scheme, the host or the path.
      const expectLinks = async (selector: string, pathname: string) => {
        const expected = new URL(pathname, origin);
        const hrefs = await page
          .locator(selector)
          .evaluateAll((links) =>
            links.map((link) => link.getAttribute("href") ?? "")
          );
        const urls = hrefs.map((href) => new URL(href));

        expect(urls.map((url) => url.href)).toContain(expected.href);
        expect(
          urls.filter(
            (url) =>
              url.protocol !== expected.protocol ||
              url.hostname !== expected.hostname ||
              url.pathname !== expected.pathname ||
              url.username !== "" ||
              url.password !== "" ||
              url.search !== "" ||
              url.hash !== ""
          )
        ).toEqual([]);
      };

      await expectLinks(
        'head link[rel="canonical"]',
        prefix === "" ? spanish : english
      );
      await expectLinks('head link[rel="alternate"][hreflang="es"]', spanish);
      await expectLinks('head link[rel="alternate"][hreflang="en"]', english);
      await expectLinks(
        'head link[rel="alternate"][hreflang="x-default"]',
        spanish
      );
    });
  }

  test("signing in on the English page lands on the English admin", async ({
    identity,
    page,
  }) => {
    const signIn = new AdminSignInPage(page);
    await page.goto("/en/admin/sign-in");
    // The submit button is enabled only once React owns the form.
    await expect(signIn.getButton("Sign In")).toBeEnabled();
    await signIn.fillField("Email", identity.email);
    await signIn.fillField("Password", identity.password);

    await completeRpcAction(
      page,
      "/api/auth/sign-in/email",
      async () => {
        await signIn.getButton("Sign In").click();
      },
      { input: { email: identity.email } }
    );

    await expect(signIn.getButton("Sign out")).toBeVisible();
    await expect(page).toHaveURL("/en/admin");
    await signIn.expectDocumentLanguage("en");
  });
});

test.describe("Languages, signed in", () => {
  test("the toggle switches language on the same page and keeps the query string, there and back", async ({
    authenticatedPage: page,
  }) => {
    // A dark system theme, to see that switching language keeps it.
    await page.emulateMedia({ colorScheme: "dark" });
    const admin = new AdminPage(page);
    await page.goto(`/admin${QUERY}`);
    await admin.waitForLoad();
    await admin.expectDocumentLanguage("es");
    await expect(admin.getButton("Cerrar sesión")).toBeVisible();

    // The query string reaches the link once React has read the URL: the
    // prerendered shell is the same for every query.
    await expect(admin.localeToggle()).toHaveAttribute(
      "href",
      `/en/admin${QUERY}`
    );
    await expect(admin.localeToggle()).toHaveText("English");
    await admin.localeToggle().click();

    await expect(page).toHaveURL(`/en/admin${QUERY}`);
    await expect(admin.getButton("Sign out")).toBeVisible();
    await admin.expectDocumentLanguage("en");
    await expect(page.locator("html")).toHaveClass(DARK_CLASS);

    await expect(admin.localeToggle()).toHaveAttribute(
      "href",
      `/admin${QUERY}`
    );
    await expect(admin.localeToggle()).toHaveText("Español");
    await admin.localeToggle().click();

    await expect(page).toHaveURL(`/admin${QUERY}`);
    await expect(admin.getButton("Cerrar sesión")).toBeVisible();
    await admin.expectDocumentLanguage("es");
  });

  for (const { path, signOut } of [
    { path: "/admin", signOut: "Cerrar sesión" },
    { path: "/en/admin", signOut: "Sign out" },
  ]) {
    test(`the header of ${path} fits a phone: nothing is cut off and the page does not scroll sideways`, async ({
      authenticatedPage: page,
    }) => {
      await page.setViewportSize({ width: 375, height: 720 });
      const admin = new AdminPage(page);

      await admin.goto(path);

      await expect(admin.getButton(signOut)).toBeInViewport({ ratio: 1 });
      await expect(admin.localeToggle()).toBeInViewport({ ratio: 1 });
      await admin.expectNoHorizontalScroll();
    });
  }
});
