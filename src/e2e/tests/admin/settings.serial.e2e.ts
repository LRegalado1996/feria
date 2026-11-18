import {
  expect,
  STORE_SETTINGS,
  STORE_TEXTS,
  test,
  uniqueTag,
} from "../../fixtures";
import { AdminSettingsPage } from "../../page-objects/admin-settings.page";
import { StorePage } from "../../page-objects/store.page";

// FER-014. The settings screen edits the store's one row, which every spec
// reads (FER-038), so this spec is serial. Each test asks for `storeEdit`
// for its teardown alone: the run's settings (`STORE_SETTINGS`) are written
// back when it ends, whatever the screen saved. The page is the worker's
// own admin.

test.describe("Company settings", () => {
  test("a WhatsApp number typed the local way is saved in international format, and the storefront's footer link follows", async ({
    page,
    storeEdit: _restoresTheSettings,
  }) => {
    const store = new StorePage(page);
    const whatsapp = () =>
      store.getFooter().getByRole("link", { name: /WhatsApp/u });
    // Visited first, so the cached storefront holds the number as it was.
    await store.goto();
    await expect(whatsapp()).toHaveAttribute(
      "href",
      `https://wa.me/${STORE_SETTINGS.whatsappNumber.slice(1)}`
    );
    const settings = new AdminSettingsPage(page);
    await settings.open();
    const number = settings.field("Número de WhatsApp");
    await expect(number).toHaveValue(STORE_SETTINGS.whatsappNumber);
    // The currency is shown, never a field: it is fixed per store.
    await expect(settings.getByTestId("settings-currency")).toContainText(
      "MonedaPesos uruguayos (UYU)"
    );

    await number.fill("098 765 432");
    await settings.save({ whatsappNumber: "+59898765432" });

    // The screen shows the number as it was kept.
    await expect(number).toHaveValue("+59898765432");
    await store.goto();
    await expect(whatsapp()).toHaveAttribute(
      "href",
      "https://wa.me/59898765432"
    );
  });

  test("a changed tagline shows in the home's intro on the next visit", async ({
    page,
    storeEdit: _restoresTheSettings,
  }) => {
    const tagline = `Joyas nuevas ${uniqueTag()}`;
    const store = new StorePage(page);
    const intro = page
      .getByTestId("store-intro-header")
      .filter({ visible: true });
    await store.goto();
    await expect(intro.getByText(STORE_TEXTS.es.tagline)).toBeVisible();
    const settings = new AdminSettingsPage(page);
    await settings.open();
    const field = settings.field("Frase en español");
    await expect(field).toHaveValue(STORE_TEXTS.es.tagline);

    await field.fill(tagline);
    await settings.save({ name: STORE_SETTINGS.name });

    await store.goto();
    await expect(intro.getByText(tagline)).toBeVisible();
    await expect(intro.getByText(STORE_TEXTS.es.tagline)).toHaveCount(0);
  });

  test("a number the form cannot read is refused under its field, and nothing is sent", async ({
    db,
    page,
    storeEdit: _restoresTheSettings,
  }) => {
    const sent: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/orpc/store/update") {
        sent.push(request.url());
      }
    });
    const settings = new AdminSettingsPage(page);
    await settings.open();
    const number = settings.field("Número de WhatsApp");

    await number.fill("099 123 45");
    await settings.saveButton().click();

    await expect(number).toHaveAttribute("aria-invalid", "true");
    await expect(number).toBeFocused();
    await expect(
      settings.getByTestId("settings-form").getByRole("alert")
    ).toHaveText(/^No es un número de WhatsApp que podamos usar\./u);
    expect(sent).toEqual([]);
    await expect(
      db.drizzle.query.store.findFirst({ columns: { whatsappNumber: true } })
    ).resolves.toEqual({ whatsappNumber: STORE_SETTINGS.whatsappNumber });
  });
});
