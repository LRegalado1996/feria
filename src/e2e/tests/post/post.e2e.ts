import {
  expect,
  IGNORE_HTTPS_ERRORS,
  requireBaseURL,
  test,
} from "../../fixtures";
import { HomePage } from "../../page-objects/home.page";

test.describe("Create Post", () => {
  test("should create a post with valid content", async ({
    authenticatedPage,
  }) => {
    const homePage = new HomePage(authenticatedPage);
    await homePage.goto();

    const postContent = `E2E Post ${crypto.randomUUID()}`;
    await homePage.createPost(postContent);

    await homePage.expectPost(postContent);
  });

  test("should clear form after successful creation", async ({
    authenticatedPage,
  }) => {
    const homePage = new HomePage(authenticatedPage);
    await homePage.goto();

    const postContent = `E2E Clear Test ${crypto.randomUUID()}`;
    await homePage.createPost(postContent);

    await homePage.expectPost(postContent);
    await expect(homePage.getComposeBox()).toHaveValue("");
  });

  test("should create multiple posts sequentially", async ({
    authenticatedPage,
  }) => {
    const homePage = new HomePage(authenticatedPage);
    await homePage.goto();

    const stamp = crypto.randomUUID();
    await homePage.createPost(`E2E First ${stamp}`);
    await homePage.createPost(`E2E Second ${stamp}`);

    // The server's order, not the optimistic one: newest first. Other
    // workers post into the same feed, so only this test's posts are compared.
    await authenticatedPage.reload();
    await homePage.waitForLoad();
    await expect(homePage.getPostCards(stamp)).toHaveText([
      /E2E Second/,
      /E2E First/,
    ]);
  });
});

test.describe("Post Feed", () => {
  test("should display post form when authenticated", async ({
    authenticatedPage,
  }) => {
    const homePage = new HomePage(authenticatedPage);
    await homePage.goto();

    await homePage.expectPostFormVisible();
  });

  test("should display post in feed after creation", async ({
    authenticatedPage,
  }) => {
    const homePage = new HomePage(authenticatedPage);
    await homePage.goto();

    const postContent = `E2E Latest ${crypto.randomUUID()}`;
    await homePage.createPost(postContent);

    // After a reload the feed comes from the server.
    await authenticatedPage.reload();
    await homePage.waitForLoad();
    await homePage.expectPost(postContent);
  });

  test("should display seeded post", async ({ authenticatedPage, db }) => {
    const post = await db.seed.createPost();

    const homePage = new HomePage(authenticatedPage);
    await homePage.goto();

    await homePage.expectPost(post.name);
  });

  test("should not show post form when unauthenticated", async ({
    baseURL,
    browser,
  }) => {
    // A hand-made context gets none of the config's `use` options.
    const context = await browser.newContext({
      baseURL: requireBaseURL(baseURL),
      ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    const homePage = new HomePage(page);
    await homePage.goto();

    await homePage.expectUnauthenticated();
    await expect(page.getByTestId("compose-area")).not.toBeVisible();

    await context.close();
  });
});
