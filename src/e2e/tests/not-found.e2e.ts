import { expect, test } from "../fixtures";

test.describe("Not found", () => {
  test("an unknown address answers 404 with a way home", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist");

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: "Página no encontrada" })
    ).toBeVisible();

    await expect(page).toHaveTitle("Página no encontrada");

    await page.getByTestId("not-found-home-link").click();

    await expect(page).toHaveURL("/");
  });

  test("an unknown English address answers 404 in English, with a way to the English home", async ({
    page,
  }) => {
    const response = await page.goto("/en/this-page-does-not-exist");

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: "Page not found" })
    ).toBeVisible();
    await expect(page).toHaveTitle("Page not found");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await page.getByTestId("not-found-home-link").click();

    await expect(page).toHaveURL("/en");
  });
});
