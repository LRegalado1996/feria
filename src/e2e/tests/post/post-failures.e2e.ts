import { expect, test } from "../../fixtures";
import { HomePage } from "../../page-objects/home.page";

const CREATE_POST = "**/api/orpc/post/create";

test.describe("Post failures", () => {
  test("a post that never reaches the server keeps what was typed and says so", async ({
    authenticatedPage: page,
  }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    await page.route(CREATE_POST, async (route) => {
      await route.abort("failed");
    });
    const text = `E2E lost post ${crypto.randomUUID()}`;

    await homePage.fillPostContent(text);
    await homePage.submitPost();

    await expect(
      page.getByText("Tu publicación no se publicó. Probá de nuevo.")
    ).toBeVisible();
    await expect(homePage.getComposeBox()).toHaveValue(text);
    // The optimistic card is taken back off the feed.
    await expect(
      page.getByTestId("post-card").filter({ hasText: text })
    ).toHaveCount(0);

    // Nothing was lost: once the server is reachable, the same text posts.
    await page.unroute(CREATE_POST);
    await homePage.submitPost();
    await homePage.expectPost(text);
    await expect(homePage.getComposeBox()).toHaveValue("");
  });
});
