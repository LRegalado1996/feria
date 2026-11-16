import type { Page } from "@playwright/test";
import { inArray } from "drizzle-orm";

import { productAttributeValue } from "../../../server/db/schema";
import { type DbFixture, expect, test } from "../../fixtures";
import { clickUntilVisible } from "../../fixtures/click-until-visible";
import { completeRpcAction } from "../../fixtures/complete-rpc-action";
import { expectDialogRemoved } from "../../fixtures/expect-dialog-removed";
import { AdminSignInPage } from "../../page-objects/admin-sign-in.page";
import { AdminPage } from "../../page-objects/admin.page";

// FER-033. Each test seeds a store and a member, signs in through the form
// and works on that store's filters.
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * A store, a member of it signed in through the form, and the filters
 * screen open. `seed` adds rows before the screen loads.
 */
async function setup(
  { db, page }: { db: DbFixture["db"]; page: Page },
  seed?: (storeId: number) => Promise<void>
) {
  const store = await db.seed.createStore();
  await seed?.(store.id);
  const login = await db.seed.createLogin({
    role: "member",
    storeIds: [store.id],
  });
  const signIn = new AdminSignInPage(page);
  await signIn.goto();
  await signIn.signIn(login.email, login.password);
  const admin = new AdminPage(page);
  await admin.waitForLoad();
  await admin.goto(`/admin/${store.slug}/filters`);
  await expect(admin.heading()).toHaveText("Filtros");

  return { admin, store };
}

/** The store's filters as the storefront offers them. */
async function storefrontFilters(page: Page, storeSlug: string) {
  const response = await page.request.post("/api/orpc/catalog/filters", {
    data: { json: { locale: "es", storeSlug } },
  });
  const { json } = (await response.json()) as {
    json: { slug: string; values: { count: number; slug: string }[] }[];
  };

  return json.map((row) => ({
    slug: row.slug,
    values: row.values.map((value) => [value.slug, value.count]),
  }));
}

test.describe("Filter management", () => {
  test("adds a filter, then a value with its swatch, inline", async ({
    db,
    page,
  }) => {
    await setup({ db, page });
    await expect(page.getByTestId("empty-state")).toBeVisible();

    const add = page.getByRole("button", { name: "Agregar filtro" });
    // React owns the form once its button can be pressed.
    await expect(add).toBeEnabled();
    await page.getByLabel("Nombre en español").fill("Color");
    await completeRpcAction(page, "/api/orpc/attribute/create", async () => {
      await add.click();
    });

    const card = page.getByTestId("filter-card-color");
    await expect(card.getByTestId("filter-name")).toHaveText("Color");
    await expect(card).toContainText("Este filtro todavía no tiene valores.");

    await card.getByLabel("Nombre en español").fill("Violeta");
    await card.getByLabel("Agregar color de muestra").fill("#8e44ad");
    await expect(card.getByLabel("Color de muestra")).toHaveValue("#8e44ad");
    await completeRpcAction(
      page,
      "/api/orpc/attribute/createValue",
      async () => {
        await card.getByRole("button", { name: "Agregar valor" }).click();
      },
      {
        input: {
          nameEs: "Violeta",
          swatchColor: "#8e44ad",
        },
      }
    );

    const value = card.getByTestId("filter-value-violeta");
    await expect(value).toContainText("0 artículos");
    await expect(value.getByTestId("filter-value-swatch")).toHaveCSS(
      "background-color",
      "rgb(142, 68, 173)"
    );
  });

  test("deleting a value in use says how many articles lose it, then takes it off them", async ({
    db,
    page,
  }) => {
    const articleIds: number[] = [];
    const valueIds: number[] = [];
    const { store } = await setup({ db, page }, async (storeId) => {
      const necklaces = await db.seed.createCategory(storeId, {
        nameEs: "Collares",
        position: 0,
        slug: "collares",
      });
      const first = await db.seed.createArticle(storeId, necklaces.id, "Uno");
      const second = await db.seed.createArticle(storeId, necklaces.id, "Dos");
      articleIds.push(first.id, second.id);
      const filter = await db.seed.createFilter(storeId, {
        nameEs: "Color",
        slug: "color",
        values: [
          {
            articleIds: [first.id, second.id],
            nameEs: "Dorado",
            slug: "dorado",
            swatchColor: "#d4af37",
          },
          { articleIds: [first.id], nameEs: "Violeta", slug: "violeta" },
        ],
      });
      valueIds.push(...filter.valueIds);
    });
    const gold = page.getByTestId("filter-value-dorado");
    await expect(gold).toContainText("2 artículos");
    const dialog = page.getByTestId("confirm-dialog");

    // The first open after the page loaded: repeated until React owns it.
    await clickUntilVisible(
      page.getByRole("button", { name: "Eliminar valor: Dorado" }),
      dialog
    );
    await expect(dialog).toContainText(
      "«Dorado» está en 2 artículos. Se les va a quitar a esos artículos."
    );
    await completeRpcAction(
      page,
      "/api/orpc/attribute/deleteValue",
      async () => {
        await dialog.getByRole("button", { name: "Eliminar valor" }).click();
      }
    );
    await expectDialogRemoved(page, dialog);

    await expect(gold).toHaveCount(0);
    await expect(page.getByTestId("filter-value-violeta")).toContainText(
      "1 artículo"
    );
    // Taken off both articles; the first keeps its other value.
    const [, purpleId] = valueIds;
    expect(
      await db.drizzle
        .select({
          attributeValueId: productAttributeValue.attributeValueId,
          productId: productAttributeValue.productId,
        })
        .from(productAttributeValue)
        .where(inArray(productAttributeValue.productId, articleIds))
    ).toEqual([{ attributeValueId: purpleId, productId: articleIds[0] }]);
    // Drafts are never offered on the storefront, so nothing is yet.
    expect(await storefrontFilters(page, store.slug)).toEqual([]);
  });

  test("moves a value down, kept after a reload", async ({ db, page }) => {
    await setup({ db, page }, async (storeId) => {
      await db.seed.createFilter(storeId, {
        nameEs: "Color",
        slug: "color",
        values: [
          { nameEs: "Dorado", slug: "dorado" },
          { nameEs: "Plateado", slug: "plateado" },
        ],
      });
    });
    const names = page.getByTestId("filter-value-name");
    await expect(names).toHaveText(["Dorado", "Plateado"]);

    await completeRpcAction(
      page,
      "/api/orpc/attribute/reorderValues",
      async () => {
        await page.getByRole("button", { name: "Bajar: Dorado" }).click();
      }
    );
    await expect(names).toHaveText(["Plateado", "Dorado"]);

    await page.reload();
    await expect(page.getByTestId("filter-list")).toBeVisible();
    await expect(names).toHaveText(["Plateado", "Dorado"]);
  });

  test("another store's filters page is not found", async ({ db, page }) => {
    await setup({ db, page });
    const other = await db.seed.createStore();

    await page.goto(`/admin/${other.slug}/filters`);

    await expect(
      page.getByRole("heading", { name: "Página no encontrada" })
    ).toBeVisible();
  });
});
