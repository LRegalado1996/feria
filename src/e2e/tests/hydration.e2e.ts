import type { Page } from "@playwright/test";

import {
  expect,
  IGNORE_HTTPS_ERRORS,
  requireBaseURL,
  test,
  uniquePhone,
  uniqueTag,
} from "../fixtures";
import { placeOrder } from "../fixtures/place-order";
import { AdminSignInPage } from "../page-objects/admin-sign-in.page";

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
test.describe("Hydration", () => {
  // Signed in as the worker's user: every login is an admin (FER-038).
  test("the orders list hydrates without a React mismatch", async ({
    authenticatedPage: page,
    db,
  }) => {
    const tag = uniqueTag();
    const jewels = await db.seed.createCategory({
      nameEs: `Joyas ${tag}`,
      slug: `joyas-${tag}`,
    });
    const ring = await db.seed.createArticle({
      categoryId: jewels.id,
      priceAmount: 50_000,
      title: "Anillo",
    });
    // Seconds old when the list renders: its relative time ("hace unos
    // segundos") is the text that differed between the server and the
    // browser. A phone of its own, since the hourly limit counts by phone,
    // and the list searched by it: other specs' orders can fill its first
    // page.
    const phone = uniquePhone();
    const order = await placeOrder(page.request, {
      customerName: "Ana",
      customerPhone: phone.international,
      productId: ring.id,
    });
    const errors = collectHydrationErrors(page);

    await page.goto(`/admin/orders?q=${phone.national}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByTestId(`order-row-${order.code}`)).toBeVisible();
    // The sound switch is enabled only once React owns the screen.
    await expect(
      page.getByRole("button", { name: "Sonido cuando llega un pedido" })
    ).toBeEnabled();

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

    await page.goto("/admin/sign-in", { waitUntil: "domcontentloaded" });

    // The submit button is enabled only once React owns the form.
    await new AdminSignInPage(page).waitForForm();

    expect(errors).toEqual([]);
    await context.close();
  });
});
