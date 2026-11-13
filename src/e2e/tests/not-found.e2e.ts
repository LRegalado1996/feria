import { expect, test } from "../fixtures";

test.describe("Not found", () => {
  test("an unknown address answers 404 with a way home", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist");

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: "Page not found" })
    ).toBeVisible();

    await page.getByTestId("not-found-home-link").click();

    await expect(page).toHaveURL("/");
  });
});
