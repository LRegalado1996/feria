import { expect, test } from "../fixtures";
import { HomePage } from "../page-objects/home.page";

const DARK_CLASS = /\bdark\b/;

test.describe("Theme", () => {
  test("a chosen theme applies at once and survives a reload", async ({
    authenticatedPage: page,
  }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    const html = page.locator("html");

    await homePage.chooseTheme("Dark");

    await expect(html).toHaveClass(DARK_CLASS);

    await page.reload();
    await expect(html).toHaveClass(DARK_CLASS);

    await homePage.chooseTheme("Light");

    await expect(html).not.toHaveClass(DARK_CLASS);
  });

  test("follows the system until the user picks", async ({
    authenticatedPage: page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const homePage = new HomePage(page);

    await homePage.goto();

    await expect(page.locator("html")).toHaveClass(DARK_CLASS);
  });
});
