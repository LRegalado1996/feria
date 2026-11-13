import { eq } from "drizzle-orm";

import { post } from "../../../server/db/schema";
import { expect, requireBaseURL, test } from "../../fixtures";
import { HomePage } from "../../page-objects/home.page";

test.describe("Delete a post", () => {
  test("the author deletes their own post after confirming", async ({
    authenticatedPage: page,
    db,
  }) => {
    const own = await db.seed.createPost();
    const homePage = new HomePage(page);
    await homePage.goto();
    await homePage.expectPost(own.name);

    await homePage.deletePost(own.id);

    await expect(page.getByText("Post deleted.")).toBeVisible();
    await expect(
      page.getByTestId("post-card").filter({ hasText: own.name })
    ).toHaveCount(0);

    // Gone on the server too, not only from this tab's cache.
    await page.reload();
    // The feed has settled: posts or the empty state, whichever is left.
    await expect(
      page
        .getByTestId("post-list")
        .getByTestId(/^(post-card|empty-state)$/)
        .first()
    ).toBeVisible();
    await expect(
      page.getByTestId("post-card").filter({ hasText: own.name })
    ).toHaveCount(0);
  });

  test("cancelling keeps the post", async ({ authenticatedPage: page, db }) => {
    const own = await db.seed.createPost();
    const homePage = new HomePage(page);
    await homePage.goto();

    await homePage.openDeleteDialog(own.id);
    await homePage.cancelDeleteDialog();

    await homePage.expectPost(own.name);
    await expect(homePage.getByTestId(`post-actions-${own.id}`)).toBeFocused();
  });

  test("nobody can delete someone else's post: no menu, and the server refuses", async ({
    authenticatedPage: page,
    baseURL,
    db,
  }) => {
    const someoneElse = await db.seed.createUser("Someone Else");
    const others = await db.seed.createPost({ createdById: someoneElse.id });
    const homePage = new HomePage(page);
    await homePage.goto();
    await homePage.expectPost(others.name);

    await expect(homePage.getByTestId(`post-actions-${others.id}`)).toHaveCount(
      0
    );

    // The menu being absent is not the protection: the procedure is.
    const response = await page.request.post(
      `${requireBaseURL(baseURL)}/api/orpc/post/delete`,
      { data: { json: { id: others.id }, meta: [] } }
    );
    expect(response.status()).toBe(404);
    expect(await response.json()).toMatchObject({
      json: { code: "NOT_FOUND", message: "Post not found" },
    });

    const stillThere = await db.drizzle
      .select({ name: post.name })
      .from(post)
      .where(eq(post.id, others.id));
    expect(stillThere).toEqual([{ name: others.name }]);
  });
});
