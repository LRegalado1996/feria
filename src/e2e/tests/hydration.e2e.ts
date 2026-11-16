import { randomInt } from "node:crypto";

import type { Page } from "@playwright/test";

import { expect, IGNORE_HTTPS_ERRORS, requireBaseURL, test } from "../fixtures";
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
  test("the orders list hydrates without a React mismatch", async ({
    db,
    superadminPage: page,
  }) => {
    const store = await db.seed.createStore({ name: "Hydration Store" });
    const jewels = await db.seed.createCategory(store.id, {
      nameEs: "Joyas",
      position: 0,
      slug: "joyas",
    });
    const ring = await db.seed.createArticle(store.id, jewels.id, "Anillo", {
      priceAmount: 50_000,
    });
    // Seconds old when the list renders: its relative time ("hace unos
    // segundos") is the text that differed between the server and the
    // browser. A phone of its own, since the hourly limit counts by phone.
    const placed = await page.request.post("/api/orpc/order/create", {
      data: {
        json: {
          customerName: "Ana",
          customerPhone: `+5989${String(randomInt(10_000_000)).padStart(7, "0")}`,
          items: [{ productId: ring.id, quantity: 1 }],
          locale: "es",
          requestKey: crypto.randomUUID(),
          storeSlug: store.slug,
        },
      },
    });
    expect(placed.status()).toBe(200);
    const { json: order } = (await placed.json()) as { json: { code: string } };
    const errors = collectHydrationErrors(page);

    await page.goto(`/admin/${store.slug}/orders`, {
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
