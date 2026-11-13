import type { Page } from "@playwright/test";

import { expect, IGNORE_HTTPS_ERRORS, requireBaseURL, test } from "../fixtures";
import { HomePage } from "../page-objects/home.page";

// React reports a hydration mismatch through `onRecoverableError`, which its
// default handler forwards to console.error. A production build minifies the
// text down to an error code, so match both shapes.
const HYDRATION_ERROR_PATTERN =
  /hydrat|Minified React error #(418|419|422|423|425)/i;

function collectHydrationErrors(page: Page): string[] {
  const errors: string[] = [];

  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      HYDRATION_ERROR_PATTERN.test(message.text())
    ) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    if (HYDRATION_ERROR_PATTERN.test(error.message)) {
      errors.push(error.message);
    }
  });

  return errors;
}

// Hydration happens only on a full document load, never on a client-side
// navigation, so every case starts with `goto`. Deliberately not
// `networkidle`: the assertions on hydrated behaviour below are the gate.
test.describe("Home hydration", () => {
  test("the feed hydrates without a React mismatch", async ({
    authenticatedPage: page,
    db,
  }) => {
    // Seconds old when the page renders: its relative time ("now", "3 seconds
    // ago") is the text that differed between the server and the browser.
    const post = await db.seed.createPost();
    const errors = collectHydrationErrors(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });

    await new HomePage(page).expectPost(post.name);
    // The compose box enables its button only once React owns the form.
    await new HomePage(page).fillPostContent("typed after hydration");

    expect(errors).toEqual([]);
  });

  test("the sign-in page hydrates without a React mismatch", async ({
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
    const errors = collectHydrationErrors(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // The mode switch is a React handler: it answers only after hydration.
    await new HomePage(page).switchToSignUp();

    expect(errors).toEqual([]);
    await context.close();
  });
});
