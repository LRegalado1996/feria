import type { Page } from "@playwright/test";

import {
  expect,
  IGNORE_HTTPS_ERRORS,
  requireBaseURL,
  test,
  uniquePhone,
  uniqueTag,
} from "../fixtures";
import { clickUntilVisible } from "../fixtures/click-until-visible";
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

/**
 * Makes the page's `Intl` write a currency as Chrome for Android does: its
 * ICU has no symbol for the peso, so asked for one it writes the ISO code.
 * Runs before the page's own scripts.
 */
function withoutCurrencySymbols() {
  class WithoutSymbols extends Intl.NumberFormat {
    constructor(
      tag?: Intl.LocalesArgument,
      options?: Intl.NumberFormatOptions
    ) {
      super(tag, { ...options, currencyDisplay: "code" });
    }
  }

  Object.defineProperty(Intl, "NumberFormat", { value: WithoutSymbols });
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

  // FER-083. The article grid formats its prices again in the browser, and
  // a phone's Chrome wrote "UYU 1.200" where the server had sent "$ 1.200".
  test("a category's prices hydrate on a browser without the peso's symbol", async ({
    baseURL,
    browser,
    db,
  }) => {
    const tag = uniqueTag();
    const chains = await db.seed.createCategory({
      nameEs: `Cadenas ${tag}`,
      slug: `cadenas-${tag}`,
    });
    await db.seed.createArticle({
      categoryId: chains.id,
      priceAmount: 120_000,
      title: "Cadena",
    });
    // A hand-made context gets none of the config's `use` options.
    const context = await browser.newContext({
      baseURL: requireBaseURL(baseURL),
      ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
      storageState: { cookies: [], origins: [] },
      timezoneId: "UTC",
    });

    try {
      await context.addInitScript(withoutCurrencySymbols);
      const page = await context.newPage();
      const errors = collectHydrationErrors(page);

      await page.goto(`/${chains.slug}`, { waitUntil: "domcontentloaded" });

      // The filter panel opens only once React owns the page.
      await clickUntilVisible(
        page.getByRole("button", { name: /^Filtrar/u }),
        page.getByRole("dialog", { name: "Filtrar" })
      );
      await expect(
        page
          .getByTestId("store-catalog-grid")
          .getByText("$\u00A01.200", { exact: true })
      ).toHaveCount(1);

      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
