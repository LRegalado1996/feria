import type { Page } from "@playwright/test";

import { type DbFixture, expect, test, uniqueTag } from "../../fixtures";
import { clickUntilVisible } from "../../fixtures/click-until-visible";
import { completeRpcAction } from "../../fixtures/complete-rpc-action";
import { AdminSignInPage } from "../../page-objects/admin-sign-in.page";
import { AdminPage } from "../../page-objects/admin.page";

// FER-016. Each test signs in as a login it seeds and works on categories of
// its own, named after its own tag: the store and its list are every spec's
// (FER-038), so a test reads only its rows. Reordering sends the store's
// whole list, so it is `categories.serial.e2e.ts`.
test.use({ storageState: { cookies: [], origins: [] } });

interface SeedCategory {
  /** How many draft articles the category holds. */
  articles?: number;
  /** The name before the tag, and its slug's start. */
  name: string;
  slug: string;
}

/**
 * These categories (in this order) at the end of the store's list, named
 * `<name> <tag>`, a login signed in through the form, and the categories
 * screen open.
 */
async function setup(
  { db, page }: { db: DbFixture["db"]; page: Page },
  { categories = [] }: { categories?: SeedCategory[] } = {}
) {
  const tag = uniqueTag();

  for (const seeded of categories) {
    const name = `${seeded.name} ${tag}`;
    const created = await db.seed.createCategory({
      nameEs: name,
      slug: `${seeded.slug}-${tag}`,
    });

    for (let article = 0; article < (seeded.articles ?? 0); article += 1) {
      await db.seed.createArticle({
        categoryId: created.id,
        title: `${name} ${article}`,
      });
    }
  }

  const login = await db.seed.createLogin();
  const signIn = new AdminSignInPage(page);
  await signIn.goto();
  await signIn.signIn(login.email, login.password);
  const admin = new AdminPage(page);
  await admin.waitForLoad();
  await admin.goto("/admin/categories");
  await expect(admin.heading()).toHaveText("Categorías");

  return { admin, tag };
}

test.describe("Category management", () => {
  test("adds a category inline, and refuses a name the store already has on the field", async ({
    db,
    page,
  }) => {
    const { tag } = await setup({ db, page });
    const spanish = page.getByLabel("Nombre en español");
    const add = page.getByRole("button", { name: "Agregar" });
    // React owns the form once its button can be pressed.
    await expect(add).toBeEnabled();
    await spanish.fill(`Collares ${tag}`);
    await page.getByLabel("Nombre en inglés (opcional)").fill("Necklaces");
    await completeRpcAction(
      page,
      "/api/orpc/category/create",
      async () => {
        await add.click();
      },
      { input: { nameEs: `Collares ${tag}` } }
    );

    const row = page.getByTestId(`category-row-collares-${tag}`);
    await expect(row.getByTestId("category-name")).toHaveText(
      `Collares ${tag}`
    );
    await expect(row).toContainText("Necklaces");
    await expect(row).toContainText("0 artículos");

    // The same name in other capitals is the same category.
    await spanish.fill(`collares ${tag}`);
    await completeRpcAction(
      page,
      "/api/orpc/category/create",
      async () => {
        await add.click();
      },
      { input: { nameEs: `collares ${tag}` }, status: 409 }
    );
    await expect(spanish).toHaveAttribute("aria-invalid", "true");
    await expect(
      page.getByText("Ya hay una categoría con ese nombre en esta tienda.")
    ).toBeVisible();
    await expect(
      page.getByTestId("category-name").filter({ hasText: tag })
    ).toHaveText([`Collares ${tag}`]);
  });

  test("deleting a category with articles moves them to the one chosen", async ({
    db,
    page,
  }) => {
    const { tag } = await setup(
      { db, page },
      {
        categories: [
          { articles: 2, name: "Cadenas", slug: "cadenas" },
          { name: "Pulseras", slug: "pulseras" },
        ],
      }
    );
    const chains = page.getByTestId(`category-row-cadenas-${tag}`);
    const bracelets = page.getByTestId(`category-row-pulseras-${tag}`);
    await expect(chains).toContainText("2 artículos");
    const dialog = page.getByTestId("delete-category-dialog");

    // The first open after the page loaded: repeated until React owns it.
    await clickUntilVisible(
      page.getByRole("button", { name: `Eliminar: Cadenas ${tag}` }),
      dialog
    );
    await expect(dialog).toContainText(`«Cadenas ${tag}» tiene 2 artículos.`);
    await dialog.getByRole("button", { name: "Eliminar categoría" }).click();
    await expect(
      dialog.getByText("Elegí a qué categoría pasan sus artículos.")
    ).toBeVisible();

    await dialog
      .getByLabel("Mover sus artículos a")
      .selectOption({ label: `Pulseras ${tag}` });
    await completeRpcAction(page, "/api/orpc/category/delete", async () => {
      await dialog.getByRole("button", { name: "Eliminar categoría" }).click();
    });

    await expect(chains).toHaveCount(0);
    await expect(bracelets).toContainText("2 artículos");
  });

  // FER-043: a category joins a group from its page's panel, and the store
  // then has the category's page under the group's.
  test("puts a category in a group and gives it a title for search engines; its page is then under the group's", async ({
    db,
    page,
  }) => {
    const { tag } = await setup(
      { db, page },
      {
        categories: [
          { name: "Bijou", slug: "bijou" },
          { articles: 0, name: "Anillos", slug: "anillos" },
        ],
      }
    );
    const rings = page.getByTestId(`category-row-anillos-${tag}`);
    const form = page.getByTestId("category-page-form");

    // The first open after the page loaded: repeated until React owns it.
    await clickUntilVisible(
      rings.getByRole("button", { name: `Página y grupo: Anillos ${tag}` }),
      form
    );
    await form.getByLabel("Grupo").selectOption({ label: `Bijou ${tag}` });
    await form
      .getByLabel("Título para buscadores en español")
      .fill(`Anillos de la feria ${tag}`);
    await completeRpcAction(
      page,
      "/api/orpc/category/updatePage",
      async () => {
        await form.getByRole("button", { name: "Guardar la página" }).click();
      },
      { input: { seoTitleEs: `Anillos de la feria ${tag}` } }
    );

    await expect(form).toHaveCount(0);
    await expect(rings.getByTestId("category-group")).toHaveText(
      `En Bijou ${tag}`
    );
    await expect(
      page
        .getByTestId(`category-row-bijou-${tag}`)
        .getByTestId("category-group")
    ).toHaveText("Grupo de 1 categoría");

    // The storefront follows at once: the write dropped the cached catalog.
    await page.goto(`/bijou-${tag}/anillos-${tag}`);
    await expect(page).toHaveTitle(`Anillos de la feria ${tag}`);
    await expect(
      page.getByRole("navigation", { name: "Ruta" }).getByRole("listitem")
    ).toHaveText(["Inicio", `Bijou ${tag}`, `Anillos ${tag}`]);
  });
});

// FER-051: every icon-only button of a row says what it does on hover and
// on focus, the same words as its name.
test.describe("Category row tooltips", () => {
  // Moving up or down depends on the row's place in the list every spec
  // shares, so those two are the unit test's (`category-manager.test.tsx`).
  test("each icon button shows its name in a tooltip on hover and on keyboard focus", async ({
    db,
    page,
  }) => {
    const { tag } = await setup(
      { db, page },
      { categories: [{ name: "Aros", slug: "aros" }] }
    );
    const row = page.getByTestId(`category-row-aros-${tag}`);
    // The tooltip left behind fades out while the next one opens: each is
    // found by its words.
    const tooltip = (name: string) =>
      page.getByRole("tooltip").filter({ hasText: name });
    const names = [
      `Arrastrar para ordenar: Aros ${tag}`,
      `Página y grupo: Aros ${tag}`,
      `Renombrar: Aros ${tag}`,
      `Eliminar: Aros ${tag}`,
    ];

    for (const name of names) {
      const button = row.getByRole("button", { name });
      // A hover before React owns the row shows nothing: hovered again
      // until it does, each try bounded.
      await expect(async () => {
        await page.mouse.move(0, 0);
        await button.hover();
        await expect(tooltip(name)).toHaveCount(1, { timeout: 2000 });
      }).toPass();
    }

    // From the keyboard, on a fresh page no pointer has touched: a tooltip
    // a hover opened can still be leaving, and would close the one focus
    // opens. Tab from "Página y grupo" lands on "Renombrar", whose tooltip
    // shows without a pointer. Focused before React owns the row, nothing
    // shows: focused again until it does, each try bounded.
    await page.reload();
    const rename = row.getByRole("button", { name: `Renombrar: Aros ${tag}` });
    await expect(async () => {
      await row
        .getByRole("button", { name: `Página y grupo: Aros ${tag}` })
        .focus();
      await page.keyboard.press("Tab");
      await expect(rename).toBeFocused({ timeout: 2000 });
      await expect(tooltip(`Renombrar: Aros ${tag}`)).toHaveCount(1, {
        timeout: 2000,
      });
    }).toPass();
  });
});
