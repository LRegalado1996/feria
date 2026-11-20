import type { Page } from "@playwright/test";

import { expect, test, uniqueTag } from "../../fixtures";
import { completeRpcAction } from "../../fixtures/complete-rpc-action";
import { AdminSignInPage } from "../../page-objects/admin-sign-in.page";
import { AdminPage } from "../../page-objects/admin.page";

// FER-016. A reorder sends every category of the store, and the server
// refuses a partial list: a category another spec added or deleted between
// the screen's read and the move would fail it. So this runs alone, in the
// serial project, before the parallel one. Its categories are added after
// whatever the store holds, so its moves stay among its own rows.
test.use({ storageState: { cookies: [], origins: [] } });

const CATEGORIES = [
  ["Anillos", "anillos"],
  ["Aros", "aros"],
  ["Cadenas", "cadenas"],
] as const;

/** The test's own rows' Spanish names, in the order the list shows them. */
function ownNames(page: Page, tag: string) {
  return page.getByTestId("category-name").filter({ hasText: tag });
}

/** The store's categories as the storefront reads them, in order. */
async function storefrontOrder(page: Page) {
  const response = await page.request.post("/api/orpc/catalog/categories", {
    data: { json: { locale: "es" } },
  });
  expect(response.status()).toBe(200);
  const { json } = (await response.json()) as { json: { slug: string }[] };

  return json.map((row) => row.slug);
}

test.describe("Category order", () => {
  test("reorders with the buttons and by dragging, kept after a reload and on the storefront", async ({
    db,
    page,
  }) => {
    const tag = uniqueTag();
    const slugs = new Set(CATEGORIES.map(([, slug]) => `${slug}-${tag}`));

    for (const [name, slug] of CATEGORIES) {
      await db.seed.createCategory({
        nameEs: `${name} ${tag}`,
        slug: `${slug}-${tag}`,
      });
    }

    const login = await db.seed.createLogin();
    const signIn = new AdminSignInPage(page);
    await signIn.goto();
    await signIn.signIn(login.email, login.password);
    const admin = new AdminPage(page);
    await admin.waitForLoad();
    await admin.goto("/admin/categories");
    await expect(admin.heading()).toHaveText("Categorías");
    const names = ownNames(page, tag);
    await expect(names).toHaveText([
      `Anillos ${tag}`,
      `Aros ${tag}`,
      `Cadenas ${tag}`,
    ]);

    await completeRpcAction(page, "/api/orpc/category/reorder", async () => {
      await page.getByRole("button", { name: `Bajar: Anillos ${tag}` }).click();
    });
    await expect(names).toHaveText([
      `Aros ${tag}`,
      `Anillos ${tag}`,
      `Cadenas ${tag}`,
    ]);

    await completeRpcAction(page, "/api/orpc/category/reorder", async () => {
      await page.getByRole("button", { name: `Subir: Cadenas ${tag}` }).click();
    });
    await expect(names).toHaveText([
      `Aros ${tag}`,
      `Cadenas ${tag}`,
      `Anillos ${tag}`,
    ]);

    // Dragged by its handle onto the row below, as a person does it. The
    // drag goes last: dnd-kit swallows clicks for 50 ms after a drop (so the
    // drop is not also a click), faster than a person but not a test.
    const from = await page
      .getByRole("button", { name: `Arrastrar para ordenar: Aros ${tag}` })
      .boundingBox();
    const to = await page
      .getByTestId(`category-row-cadenas-${tag}`)
      .boundingBox();

    if (!from || !to) {
      throw new Error("The rows have no box to drag between");
    }

    await completeRpcAction(page, "/api/orpc/category/reorder", async () => {
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + from.width / 2, to.y + to.height * 0.75, {
        steps: 12,
      });
      await page.mouse.up();
    });
    await expect(names).toHaveText([
      `Cadenas ${tag}`,
      `Aros ${tag}`,
      `Anillos ${tag}`,
    ]);

    await page.reload();
    await expect(page.getByTestId("category-list")).toBeVisible();
    await expect(names).toHaveText([
      `Cadenas ${tag}`,
      `Aros ${tag}`,
      `Anillos ${tag}`,
    ]);
    expect(
      (await storefrontOrder(page)).filter((slug) => slugs.has(slug))
    ).toEqual([`cadenas-${tag}`, `aros-${tag}`, `anillos-${tag}`]);
  });
});
