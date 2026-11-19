import { expect, STORE_SETTINGS, test } from "../../fixtures";
import { AdminComingSoonPage } from "../../page-objects/admin-coming-soon.page";
import { ComingSoonPage } from "../../page-objects/coming-soon.page";
import { StorePage } from "../../page-objects/store.page";

// FER-034. Every project but `closed` runs with the coming-soon page taken
// down (`storefrontSwitch`): the store is open. The closed store's specs are
// `coming-soon.closed.e2e.ts`. Nothing here flips the switch or edits the
// page: parallel specs read the open store.

const SIGNED_OUT = { cookies: [], origins: [] };
const PHONE = { height: 844, width: 390 };

test.describe("Not published: the store is open", () => {
  test.use({ storageState: SIGNED_OUT });

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
    test(`${path} is unreachable for the public: it leads home to ${target}`, async ({
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

test.describe("Not published: a signed-in admin", () => {
  test("may preview the coming-soon page, which the public cannot reach", async ({
    page,
  }) => {
    const comingSoon = new ComingSoonPage(page);

    const response = await page.goto("/coming-soon");

    expect(response?.status()).toBe(200);
    await comingSoon.waitForLoad();
    await expect(page).toHaveURL("/coming-soon");
    await expect(comingSoon.getHeading(1)).toHaveText("Muy pronto");
  });

  test("sees the open store without the closed store's notice", async ({
    page,
  }) => {
    const store = new StorePage(page);

    await store.goto();
    // The home's footer is the last of the page to render: by then the
    // notice, drawn in the browser, would be there.
    await expect(store.getFooter()).toBeVisible();

    await expect(store.getPreviewNotice()).toHaveCount(0);
  });

  test("on a phone, reaches the page's screen from the settings, which it says it is under, sees it not published, and keeps its save under the thumb", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    const screen = new AdminComingSoonPage(page);
    await screen.goto("/admin/settings");

    await screen
      .getByTestId("settings-coming-soon")
      .getByRole("link", { name: "Administrar Próximamente" })
      .click();

    await expect(page).toHaveURL("/admin/settings/coming-soon");
    await expect(
      screen.getLink("Volver a Ajustes").filter({ visible: true })
    ).toHaveAttribute("href", "/admin/settings");
    await expect(screen.heading()).toHaveText("Próximamente");
    await expect(screen.state()).toHaveText("Sin publicar");
    await expect(
      screen.status().getByRole("button", { name: "Publicar la página" })
    ).toBeVisible();
    await expect(screen.previewLink()).toHaveAttribute("href", "/coming-soon");
    await expect(screen.saveButton()).toBeEnabled();
    await screen.expectNoHorizontalScroll();
  });
});
