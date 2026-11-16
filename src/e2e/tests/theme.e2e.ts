import { expect, test } from "../fixtures";
import { AdminPage } from "../page-objects/admin.page";

const DARK_CLASS = /\bdark\b/;

test.describe("Theme", () => {
  test("a chosen theme applies at once and survives a reload", async ({
    authenticatedPage: page,
  }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    const html = page.locator("html");

    await admin.chooseTheme("Oscuro");

    await expect(html).toHaveClass(DARK_CLASS);

    await page.reload();
    await expect(html).toHaveClass(DARK_CLASS);

    await admin.chooseTheme("Claro");

    await expect(html).not.toHaveClass(DARK_CLASS);
  });

  test("follows the system until the user picks", async ({
    authenticatedPage: page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const admin = new AdminPage(page);

    await admin.goto();

    await expect(page.locator("html")).toHaveClass(DARK_CLASS);
  });
});
