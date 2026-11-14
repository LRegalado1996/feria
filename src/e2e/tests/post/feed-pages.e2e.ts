import { expect, test } from "../../fixtures";
import { HomePage } from "../../page-objects/home.page";

const GET_POSTS = "**/api/orpc/post/getAll";

/** More than one page (10 posts), so scrolling asks for a second one. */
const MORE_THAN_A_PAGE = 12;

// The feed is shared by every parallel worker. Seeded at the bottom of it,
// these posts guarantee a second page without pushing another spec's fresh
// post off its first one.
const LONG_AGO = new Date("2000-01-01T00:00:00.000Z");

test.describe("Feed pages", () => {
  test("scrolling to the end loads the next page", async ({
    authenticatedPage,
    db,
  }) => {
    for (let i = 0; i < MORE_THAN_A_PAGE; i++) {
      await db.seed.createPost({ createdAt: LONG_AGO });
    }

    const homePage = new HomePage(authenticatedPage);
    await homePage.goto();
    await homePage.waitForPostCount(10);
    await expect(
      authenticatedPage.getByTestId("scroll-sentinel")
    ).toBeAttached();

    await homePage.scrollToBottom();

    await homePage.waitForMinimumPosts(11);
  });

  test("an older page that fails to load is an error with a retry, never an empty feed", async ({
    authenticatedPage: page,
    db,
  }) => {
    for (let i = 0; i < MORE_THAN_A_PAGE; i++) {
      await db.seed.createPost({ createdAt: LONG_AGO });
    }

    const homePage = new HomePage(page);
    await homePage.goto();
    await homePage.waitForPostCount(10);
    await page.route(GET_POSTS, async (route) => {
      await route.abort("failed");
    });

    await homePage.scrollToBottom();

    const error = page.getByTestId("feed-more-error");
    await expect(error).toContainText(
      "No se pudieron cargar las publicaciones anteriores."
    );
    await expect(page.getByTestId("post-card")).toHaveCount(10);
    await expect(page.getByTestId("empty-state")).toHaveCount(0);

    await page.unroute(GET_POSTS);
    await error.getByRole("button", { name: "Reintentar" }).click();

    await homePage.waitForMinimumPosts(11);
    await expect(error).toHaveCount(0);
  });
});
