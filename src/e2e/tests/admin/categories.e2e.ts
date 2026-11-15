import type { Page } from "@playwright/test";

import { type DbFixture, expect, test } from "../../fixtures";
import { clickUntilVisible } from "../../fixtures/click-until-visible";
import { completeRpcAction } from "../../fixtures/complete-rpc-action";
import { AdminSignInPage } from "../../page-objects/admin-sign-in.page";
import { AdminPage } from "../../page-objects/admin.page";

// FER-016. Each test seeds a store and a member, signs in through the form
// and works on that store's categories.
test.use({ storageState: { cookies: [], origins: [] } });

interface SeedCategory {
  /** How many draft articles the category holds. */
  articles?: number;
  nameEs: string;
  slug: string;
}

/**
 * A store with these categories (in this order), a member of it signed in
 * through the form, and the categories screen open.
 */
async function setup(
  { db, page }: { db: DbFixture["db"]; page: Page },
  { categories = [] }: { categories?: SeedCategory[] } = {}
) {
  const store = await db.seed.createStore();

  for (const [position, seeded] of categories.entries()) {
    const created = await db.seed.createCategory(store.id, {
      nameEs: seeded.nameEs,
      position,
      slug: seeded.slug,
    });

    for (let article = 0; article < (seeded.articles ?? 0); article += 1) {
      await db.seed.createArticle(
        store.id,
        created.id,
        `${seeded.nameEs} ${article}`
      );
    }
  }

  const login = await db.seed.createLogin({
    role: "member",
    storeIds: [store.id],
  });
  const signIn = new AdminSignInPage(page);
  await signIn.goto();
  await signIn.signIn(login.email, login.password);
  const admin = new AdminPage(page);
  await admin.waitForLoad();
  await admin.goto(`/admin/${store.slug}/categories`);
  await expect(admin.heading()).toHaveText("Categorías");

  return { admin, store };
}

/** The Spanish names of the list's rows, in order. */
async function namesInOrder(page: Page) {
  return await page
    .getByTestId("category-list")
    .locator("li")
    .locator("p.font-semibold")
    .allTextContents();
}

/** The store's categories as the storefront reads them, in order. */
async function storefrontOrder(page: Page, storeSlug: string) {
  const response = await page.request.post("/api/orpc/catalog/categories", {
    data: { json: { locale: "es", storeSlug } },
  });
  const { json } = (await response.json()) as { json: { slug: string }[] };

  return json.map((row) => row.slug);
}

test.describe("Category management", () => {
  test("adds a category inline, and refuses a name the store already has on the field", async ({
    db,
    page,
  }) => {
    await setup({ db, page });
    await expect(page.getByTestId("empty-state")).toBeVisible();

    const spanish = page.getByLabel("Nombre en español");
    const add = page.getByRole("button", { name: "Agregar" });
    // React owns the form once its button can be pressed.
    await expect(add).toBeEnabled();
    await spanish.fill("Collares");
    await page.getByLabel("Nombre en inglés (opcional)").fill("Necklaces");
    await completeRpcAction(page, "/api/orpc/category/create", async () => {
      await add.click();
    });

    await expect(page.getByTestId("category-row-collares")).toContainText(
      "Necklaces"
    );
    await expect(page.getByTestId("category-row-collares")).toContainText(
      "0 artículos"
    );

    await spanish.fill("collares");
    await completeRpcAction(
      page,
      "/api/orpc/category/create",
      async () => {
        await add.click();
      },
      { status: 409 }
    );
    await expect(spanish).toHaveAttribute("aria-invalid", "true");
    await expect(
      page.getByText("Ya hay una categoría con ese nombre en esta tienda.")
    ).toBeVisible();
  });

  test("reorders with the buttons and by dragging, kept after a reload and on the storefront", async ({
    db,
    page,
  }) => {
    const { store } = await setup(
      { db, page },
      {
        categories: [
          { nameEs: "Anillos", slug: "anillos" },
          { nameEs: "Aros", slug: "aros" },
          { nameEs: "Cadenas", slug: "cadenas" },
        ],
      }
    );
    expect(await namesInOrder(page)).toEqual(["Anillos", "Aros", "Cadenas"]);

    await completeRpcAction(page, "/api/orpc/category/reorder", async () => {
      await page.getByRole("button", { name: "Bajar: Anillos" }).click();
    });
    expect(await namesInOrder(page)).toEqual(["Aros", "Anillos", "Cadenas"]);

    await completeRpcAction(page, "/api/orpc/category/reorder", async () => {
      await page.getByRole("button", { name: "Subir: Cadenas" }).click();
    });
    expect(await namesInOrder(page)).toEqual(["Aros", "Cadenas", "Anillos"]);

    // Dragged by its handle onto the row below, as a person does it. The
    // drag goes last: dnd-kit swallows clicks for 50 ms after a drop (so the
    // drop is not also a click), faster than a person but not a test.
    const from = await page
      .getByRole("button", { name: "Arrastrar para ordenar: Aros" })
      .boundingBox();
    const to = await page.getByTestId("category-row-cadenas").boundingBox();

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
    expect(await namesInOrder(page)).toEqual(["Cadenas", "Aros", "Anillos"]);

    await page.reload();
    await expect(page.getByTestId("category-list")).toBeVisible();
    expect(await namesInOrder(page)).toEqual(["Cadenas", "Aros", "Anillos"]);
    expect(await storefrontOrder(page, store.slug)).toEqual([
      "cadenas",
      "aros",
      "anillos",
    ]);
  });

  test("deleting a category with articles moves them to the one chosen", async ({
    db,
    page,
  }) => {
    await setup(
      { db, page },
      {
        categories: [
          { articles: 2, nameEs: "Cadenas", slug: "cadenas" },
          { nameEs: "Pulseras", slug: "pulseras" },
        ],
      }
    );
    await expect(page.getByTestId("category-row-cadenas")).toContainText(
      "2 artículos"
    );
    const dialog = page.getByTestId("delete-category-dialog");

    // The first open after the page loaded: repeated until React owns it.
    await clickUntilVisible(
      page.getByRole("button", { name: "Eliminar: Cadenas" }),
      dialog
    );
    await expect(dialog).toContainText("«Cadenas» tiene 2 artículos.");
    await dialog.getByRole("button", { name: "Eliminar categoría" }).click();
    await expect(
      dialog.getByText("Elegí a qué categoría pasan sus artículos.")
    ).toBeVisible();

    await dialog
      .getByLabel("Mover sus artículos a")
      .selectOption({ label: "Pulseras" });
    await completeRpcAction(page, "/api/orpc/category/delete", async () => {
      await dialog.getByRole("button", { name: "Eliminar categoría" }).click();
    });

    await expect(page.getByTestId("category-row-cadenas")).toHaveCount(0);
    await expect(page.getByTestId("category-row-pulseras")).toContainText(
      "2 artículos"
    );
  });

  test("another store's categories page is not found", async ({ db, page }) => {
    await setup({ db, page });
    const other = await db.seed.createStore();

    await page.goto(`/admin/${other.slug}/categories`);

    await expect(
      page.getByRole("heading", { name: "Página no encontrada" })
    ).toBeVisible();
  });
});
