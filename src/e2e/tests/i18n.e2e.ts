import type { Page } from "@playwright/test";

import { expect, IGNORE_HTTPS_ERRORS, requireBaseURL, test } from "../fixtures";
import { completeRpcAction } from "../fixtures/complete-rpc-action";
import { AdminSignInPage } from "../page-objects/admin-sign-in.page";
import { AdminPage } from "../page-objects/admin.page";
import { StorePage } from "../page-objects/store.page";

const QUERY = "?ref=qr&color=dorado";
const DARK_CLASS = /\bdark\b/;
const BINGBOT =
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)";

/**
 * Every `selector` link names `pathname` on this origin. Head metadata has no
 * role, label or test id to be found by. Every match is read: the
 * prerendered shell and the request can each write the tags, and React
 * merges them only when they are identical. They differ when a build and its
 * server disagree on the port, as CI and `pnpm e2e:ci` do (built for :3000,
 * served elsewhere). So one tag must be the page's full URL on this origin,
 * and any other may differ from it in the port alone: never in the scheme,
 * the host or the path. Streamed metadata lands with the page's content or
 * just after it, so the first is waited for.
 */
async function expectLinks(
  page: Page,
  origin: string,
  selector: string,
  pathname: string
) {
  const expected = new URL(pathname, origin);
  const read = async () =>
    (
      await page
        .locator(selector)
        .evaluateAll((links) =>
          links.map((link) => link.getAttribute("href") ?? "")
        )
    ).map((href) => new URL(href));

  await expect
    .poll(async () => (await read()).map((url) => url.href))
    .toContain(expected.href);
  expect(
    (await read()).filter(
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
}

/**
 * The home at `path` declares itself canonical and names both languages, in
 * `scope` of the document (`head ` or all of it).
 */
async function expectAlternates(
  page: Page,
  origin: string,
  { path, scope }: { path: string; scope: "" | "head " }
) {
  await expectLinks(page, origin, `${scope}link[rel="canonical"]`, path);
  await expectLinks(
    page,
    origin,
    `${scope}link[rel="alternate"][hreflang="es"]`,
    "/"
  );
  await expectLinks(
    page,
    origin,
    `${scope}link[rel="alternate"][hreflang="en"]`,
    "/en"
  );
  await expectLinks(
    page,
    origin,
    `${scope}link[rel="alternate"][hreflang="x-default"]`,
    "/"
  );
}

// The storefront's own texts per language are in `tests/store/`; these are
// the addresses: the admin and its sign-in, and the links the store's home
// (`/`, FER-038) gives search engines.
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

  for (const path of ["/", "/en"]) {
    // The home reads the store per request, so Next streams its metadata
    // after the shell, into <body>, for a browser and for Googlebot, which
    // runs the page's script (`generateMetadata` § Streaming metadata).
    test(`${path} declares itself canonical and names both languages to a crawler that runs the page's script`, async ({
      baseURL,
      page,
    }) => {
      await page.goto(path);
      await new StorePage(page).waitForLoad();

      await expectAlternates(page, requireBaseURL(baseURL), {
        path,
        scope: "",
      });
    });

    // A crawler that reads only the HTML, such as Bingbot, gets the metadata
    // in <head>: Next renders it before the page for such crawlers.
    test(`${path} declares the same in <head> to a crawler that reads only the HTML`, async ({
      baseURL,
      browser,
    }) => {
      const origin = requireBaseURL(baseURL);
      // A hand-made context gets none of the config's `use` options.
      const context = await browser.newContext({
        baseURL: origin,
        ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
        userAgent: BINGBOT,
      });

      try {
        const page = await context.newPage();
        await page.goto(path);
        await new StorePage(page).waitForLoad();

        await expectAlternates(page, origin, { path, scope: "head " });
      } finally {
        await context.close();
      }
    });
  }

  test("signing in on the English page lands on the English admin's orders", async ({
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
    // `/en/admin` opens the orders (FER-038): the destination's content,
    // then its address.
    await expect(
      page.getByRole("heading", { level: 1, name: "Orders" })
    ).toBeVisible();
    await expect(page).toHaveURL("/en/admin/orders");
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
    // A section that stays where it is: `/admin` itself opens the orders.
    await page.goto(`/admin/products${QUERY}`);
    await admin.waitForLoad();
    await admin.expectDocumentLanguage("es");
    await expect(admin.getButton("Cerrar sesión")).toBeVisible();

    // The query string reaches the link once React has read the URL: the
    // prerendered shell is the same for every query.
    await expect(admin.localeToggle()).toHaveAttribute(
      "href",
      `/en/admin/products${QUERY}`
    );
    await expect(admin.localeToggle()).toHaveText("English");
    await admin.localeToggle().click();

    await expect(page).toHaveURL(`/en/admin/products${QUERY}`);
    await expect(admin.getButton("Sign out")).toBeVisible();
    await expect(admin.heading()).toHaveText("Articles");
    await admin.expectDocumentLanguage("en");
    await expect(page.locator("html")).toHaveClass(DARK_CLASS);

    await expect(admin.localeToggle()).toHaveAttribute(
      "href",
      `/admin/products${QUERY}`
    );
    await expect(admin.localeToggle()).toHaveText("Español");
    await admin.localeToggle().click();

    await expect(page).toHaveURL(`/admin/products${QUERY}`);
    await expect(admin.getButton("Cerrar sesión")).toBeVisible();
    await expect(admin.heading()).toHaveText("Artículos");
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
