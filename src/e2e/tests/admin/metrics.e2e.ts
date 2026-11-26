import { productViewDaily } from "../../../server/db/schema";
import { type DbFixture, expect, test, uniqueTag } from "../../fixtures";
import { AdminPage } from "../../page-objects/admin.page";

// FER-030. A day no other test touches holds this file's views, so the
// dashboard's numbers for it are known; the article is the test's own, and
// its views go with it. Visits are the store's, which teardown never
// deletes: the integration test counts them.
const DAY = "2031-01-15";
const RANGE_PATH = `/admin/metrics?from=${DAY}&to=${DAY}`;

/** An article of the test's own, seen 500 times on `DAY`. */
async function setup({ db }: { db: DbFixture["db"] }) {
  const tag = uniqueTag();
  const rings = await db.seed.createCategory({
    nameEs: `Anillos ${tag}`,
    slug: `anillos-${tag}`,
  });
  const article = await db.seed.createArticle({
    categoryId: rings.id,
    priceAmount: 120_000,
    title: `Anillo ${tag}`,
  });
  await db.drizzle.insert(productViewDaily).values({
    day: DAY,
    productId: article.id,
    storeId: db.storeId,
    viewCount: 500,
  });

  return { article, title: `Anillo ${tag}` };
}

test.describe("Metrics dashboard", () => {
  test("shows a day's visits and views, and ranks the article seen most, never ordered, linking to it", async ({
    db,
    page,
  }) => {
    const { article, title } = await setup({ db });
    const admin = new AdminPage(page);

    await admin.goto(RANGE_PATH);

    await expect(admin.heading()).toHaveText("Métricas");
    await expect(page.getByTestId("metrics-range-days")).toHaveText(
      "Del 15 ene. 2031 al 15 ene. 2031"
    );
    await expect(page.getByTestId("metrics-funnel-visits")).toHaveText(
      "Visitas a la tienda0"
    );
    await expect(page.getByTestId("metrics-funnel-views")).toHaveText(
      "Vistas de artículos500"
    );
    const topViewed = page.getByTestId("metrics-top-viewed");
    await expect(topViewed.getByRole("row").nth(1)).toHaveText(`${title}5000`);
    await expect(topViewed.getByRole("link", { name: title })).toHaveAttribute(
      "href",
      `/admin/products/${String(article.id)}`
    );
    await expect(
      page.getByTestId("metrics-viewed-not-ordered").getByRole("row").nth(1)
    ).toHaveText(`${title}500`);
    await expect(page.getByTestId("metrics-orders")).toHaveText(
      "PedidosNo hubo pedidos en este período."
    );
  });

  test("an empty range says so, and a preset moves the range to the last days", async ({
    page,
  }) => {
    const admin = new AdminPage(page);

    await admin.goto("/admin/metrics?from=2031-02-01&to=2031-02-28");

    await expect(page.getByTestId("metrics-traffic")).toHaveText(
      "Tráfico de la tiendaSin datos en este período."
    );
    await expect(page.getByTestId("metrics-orders")).toHaveText(
      "PedidosNo hubo pedidos en este período."
    );

    const range = page.getByRole("navigation", { name: "Período" });
    await range.getByRole("link", { name: "7 días" }).click();

    await expect(range.getByRole("link", { name: "7 días" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    const url = new URL(page.url());
    expect(url.pathname).toBe("/admin/metrics");
    expect(url.searchParams.get("to")).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  });
});
