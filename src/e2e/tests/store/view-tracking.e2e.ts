import type { Browser, Page } from "@playwright/test";
import { eq, sum } from "drizzle-orm";

import { productViewDaily } from "../../../server/db/schema";
import {
  type DbFixture,
  expect,
  IGNORE_HTTPS_ERRORS,
  requireBaseURL,
  test,
  uniqueTag,
} from "../../fixtures";
import { completeRpcAction } from "../../fixtures/complete-rpc-action";

// FER-029. Each test counts views of an article of its own, read from its
// rows of `product_view_daily` (deleted with the article). The store's
// visits are shared by every worker, so they are checked by the requests a
// browser sends, never by the store's count.
test.use({ storageState: { cookies: [], origins: [] } });

const COUNT_VIEW = "/api/orpc/metrics/countView";
const COUNT_VISIT = "/api/orpc/metrics/countVisit";
const BINGBOT =
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)";

/** A published article in a category of the test's own. */
async function setup({ db }: { db: DbFixture["db"] }) {
  const tag = uniqueTag();
  const rings = await db.seed.createCategory({
    nameEs: `Anillos ${tag}`,
    slug: `anillos-${tag}`,
  });
  const article = await db.seed.createArticle({
    categoryId: rings.id,
    priceAmount: 120_000,
    title: "Anillo de plata",
  });

  return {
    article,
    /** The article's views, every day added up. */
    views: async () => {
      const [row] = await db.drizzle
        .select({ total: sum(productViewDaily.viewCount).mapWith(Number) })
        .from(productViewDaily)
        .where(eq(productViewDaily.productId, article.id));

      return row?.total ?? 0;
    },
  };
}

/** Every count a page sent, by procedure, as it went. */
function recordCounts(page: Page) {
  const sent: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;

    if (path === COUNT_VIEW || path === COUNT_VISIT) {
      sent.push(path);
    }
  });

  return sent;
}

/**
 * Opens the article, and waits until its page has had the idle moment a
 * count waits for: whatever it was going to send, it sent.
 */
async function openArticle(page: Page, slug: string) {
  await page.goto(`/productos/${slug}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Anillo de plata" })
  ).toBeVisible();
  await page.evaluate(
    async () =>
      await new Promise((resolve) => {
        requestIdleCallback(resolve, { timeout: 3000 });
      })
  );
}

/** A shopper's browser of its own: another browser session. */
async function newShopper(
  browser: Browser,
  baseURL: string | undefined,
  options: { userAgent?: string } = {}
) {
  const context = await browser.newContext({
    baseURL: requireBaseURL(baseURL),
    ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
    ...options,
  });

  return { context, page: await context.newPage() };
}

test.describe("View tracking", () => {
  test("ten loads of an article in one session count one view and one visit; a second session counts another view", async ({
    baseURL,
    browser,
    db,
    page,
  }) => {
    const { article, views } = await setup({ db });
    const sent = recordCounts(page);

    await completeRpcAction(
      page,
      COUNT_VIEW,
      async () => {
        await openArticle(page, article.slug);
      },
      { input: { productId: article.id } }
    );
    await expect.poll(views).toBe(1);

    for (let load = 2; load <= 10; load += 1) {
      await openArticle(page, article.slug);
    }

    expect({
      views: sent.filter((path) => path === COUNT_VIEW).length,
      visits: sent.filter((path) => path === COUNT_VISIT).length,
    }).toEqual({ views: 1, visits: 1 });

    const other = await newShopper(browser, baseURL);

    try {
      await completeRpcAction(
        other.page,
        COUNT_VIEW,
        async () => {
          await openArticle(other.page, article.slug);
        },
        { input: { productId: article.id } }
      );
      await expect.poll(views).toBe(2);
    } finally {
      await other.context.close();
    }
  });

  test("a known bot and a signed-in admin count nothing; a shopper after them counts one", async ({
    authenticatedPage,
    baseURL,
    browser,
    db,
    page,
  }) => {
    const { article, views } = await setup({ db });
    const bot = await newShopper(browser, baseURL, { userAgent: BINGBOT });

    try {
      // Each one's browser asks; the server leaves the count alone.
      for (const visitor of [bot.page, authenticatedPage]) {
        await completeRpcAction(
          visitor,
          COUNT_VIEW,
          async () => {
            await openArticle(visitor, article.slug);
          },
          { input: { productId: article.id } }
        );
      }
    } finally {
      await bot.context.close();
    }

    await completeRpcAction(
      page,
      COUNT_VIEW,
      async () => {
        await openArticle(page, article.slug);
      },
      { input: { productId: article.id } }
    );

    await expect.poll(views).toBe(1);
  });
});
