import { expect, test } from "../../fixtures";
import { HomePage } from "../../page-objects/home.page";

test.describe("Sign Out", () => {
  test("should sign out successfully", async ({
    freshAuthenticatedPage,
    identity,
  }) => {
    const homePage = new HomePage(freshAuthenticatedPage);
    await homePage.goto();

    await homePage.expectAuthenticated(identity.name);

    await homePage.signOut();

    await homePage.expectUnauthenticated();
  });

  test("should show auth form after signing out", async ({
    freshAuthenticatedPage,
  }) => {
    const homePage = new HomePage(freshAuthenticatedPage);
    await homePage.goto();

    await homePage.signOut();

    await expect(homePage.getInput("Email")).toBeVisible();
    await expect(homePage.getInput("Password")).toBeVisible();
    await expect(homePage.getButton("Sign In")).toBeVisible();
  });
});
