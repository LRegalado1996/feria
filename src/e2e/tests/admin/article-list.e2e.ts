import { type DbFixture, expect, test, uniqueTag } from "../../fixtures";
import { expectDialogRemoved } from "../../fixtures/expect-dialog-removed";
import { AdminProductsPage } from "../../page-objects/admin-products.page";

// FER-019. The admin's article list: search, the filter sheet, the sort and
// the numbered pages, all in the address. The store's articles are every
// spec's (FER-038), so each test opens the list searched by its own tag or
// filtered by its own category, and asserts only on its own rows. The
// default `page` is the worker's own login.

/**
 * A category of the test's own (inside a group of its own) with three
 * articles whose titles carry the tag: a published, available gold ring, a
 * published ring that cannot be bought, and a draft with no price. A color
 * filter of its own marks the gold ring.
 */
async function setup({ db }: { db: DbFixture["db"] }) {
  const tag = uniqueTag();
  const group = await db.seed.createCategory({
    nameEs: `Joyas ${tag}`,
    slug: `joyas-${tag}`,
  });
  const rings = await db.seed.createCategory({
    nameEs: `Anillos ${tag}`,
    parentId: group.id,
    slug: `anillos-${tag}`,
  });
  const gold = await db.seed.createArticle({
    categoryId: rings.id,
    priceAmount: 150_000,
    title: `Anillo oro ${tag}`,
  });
  await db.seed.createArticle({
    categoryId: rings.id,
    isAvailable: false,
    priceAmount: 90_000,
    title: `Anillo plata ${tag}`,
  });
  await db.seed.createArticle({
    categoryId: rings.id,
    title: `Borrador ${tag}`,
  });
  const color = `color-${tag}`;
  await db.seed.createFilter({
    nameEs: `Color ${tag}`,
    slug: color,
    values: [
      {
        articleIds: [gold.id],
        nameEs: "Dorado",
        slug: "dorado",
        swatchColor: "#d4af37",
      },
      { nameEs: "Plateado", slug: "plateado", swatchColor: "#c0c0c0" },
    ],
  });

  return { color, group, rings, tag };
}

test.describe("the article list", () => {
  test("searches by title, blind to case and accents, in the address, and clears it", async ({
    db,
    page,
  }) => {
    const { tag } = await setup({ db });
    const birds = await db.seed.createCategory({
      nameEs: `Aves ${tag}`,
      slug: `aves-${tag}`,
    });
    await db.seed.createArticle({
      categoryId: birds.id,
      priceAmount: 50_000,
      title: `Collar Ñandú ${tag}`,
    });
    const list = new AdminProductsPage(page);
    await list.goto();

    // Typing before React owns the field is lost: type until the address
    // follows it.
    await expect(async () => {
      await list.searchField().fill(`NANDU ${tag}`);
      await expect(page).toHaveURL(/[?&]q=NANDU/u, { timeout: 2000 });
    }).toPass();

    await list.expectTitles([`Collar Ñandú ${tag}`]);
    await expect(list.count()).toHaveText("1 artículo");

    await list.searchField().fill(`zz-${tag}`);
    await expect(
      list.list().getByTestId("product-list-no-matches")
    ).toContainText("Ningún artículo coincide con la búsqueda o los filtros.");

    await list.clearSearch().click();
    await expect(page).not.toHaveURL(/[?&]q=/u);
    await expect(list.searchField()).toHaveValue("");
    await expect(list.searchField()).toBeFocused();
  });

  test("filters by category, status, availability and a store filter from the sheet, by keyboard", async ({
    db,
    page,
  }) => {
    const { color, tag } = await setup({ db });
    const list = new AdminProductsPage(page);
    await list.goto(`?q=${tag}`);
    await list.expectTitles([
      `Borrador ${tag}`,
      `Anillo plata ${tag}`,
      `Anillo oro ${tag}`,
    ]);

    // Opened from the keyboard, focus moves into the sheet.
    await list.filtersButton().focus();
    await expect(async () => {
      await page.keyboard.press("Enter");
      await expect(list.sheet()).toBeVisible({ timeout: 2000 });
    }).toPass();
    const sheet = list.sheet();
    await expect(
      sheet.getByRole("button", { name: "Cerrar filtros" })
    ).toBeFocused();

    // Escape drops a choice and gives focus back to "Filtros". The radio is
    // hidden inside its pill: the keyboard reaches it.
    await sheet.getByRole("radio", { name: "Borrador" }).focus();
    await page.keyboard.press("Space");
    await expect(sheet.getByRole("radio", { name: "Borrador" })).toBeChecked();
    await page.keyboard.press("Escape");
    await expectDialogRemoved(page, sheet);
    await expect(list.filtersButton()).toBeFocused();
    await expect(page).not.toHaveURL(/status=/u);

    await page.keyboard.press("Enter");
    await expect(sheet).toBeVisible();
    await expect(
      sheet.getByRole("radio", { name: "Todos" }).first()
    ).toBeChecked();
    await sheet.getByRole("checkbox", { name: `Anillos ${tag}` }).focus();
    await page.keyboard.press("Space");
    await sheet.getByRole("radio", { name: "Publicado" }).focus();
    await page.keyboard.press("Space");
    await sheet.getByRole("radio", { name: "Disponible", exact: true }).focus();
    await page.keyboard.press("Space");
    await list.filterValue(color, "Dorado").focus();
    await page.keyboard.press("Space");
    await expect(sheet.getByTestId("filter-matches")).toHaveText(
      "Coincide 1 artículo"
    );
    await sheet.getByRole("button", { name: "Aplicar" }).focus();
    await page.keyboard.press("Enter");
    await expectDialogRemoved(page, sheet);

    await expect(page).toHaveURL(
      new RegExp(
        `\\?q=${tag}&status=published&availability=available&category=anillos-${tag}&f\\.${color}=dorado$`,
        "u"
      )
    );
    await list.expectTitles([`Anillo oro ${tag}`]);
    await expect(list.filtersButton()).toHaveAccessibleName(
      "Filtros, 4 activos"
    );
    await expect(list.chips().getByRole("link")).toHaveText([
      /Estado:Publicado/u,
      /Disponibilidad:Disponible/u,
      new RegExp(`Categoría:Anillos ${tag}`, "u"),
      new RegExp(`Color ${tag}:Dorado`, "u"),
      "Limpiar todo",
    ]);

    // A deep link restores it all after a reload, the sheet included.
    await page.reload();
    await list.waitForLoad();
    await list.expectTitles([`Anillo oro ${tag}`]);
    await list.openFilters();
    await expect(
      list.sheet().getByRole("checkbox", { name: `Anillos ${tag}` })
    ).toBeChecked();
    await expect(list.filterValue(color, "Dorado")).toBeChecked();
    await page.keyboard.press("Escape");
    await expectDialogRemoved(page, list.sheet());

    // Removing a chip widens the list by that filter alone: without the
    // color the availability still keeps only the gold ring (the silver one
    // cannot be bought), without the availability both rings show;
    // "Limpiar todo" keeps the search.
    await list
      .chips()
      .getByRole("link", { name: `Quitar filtro: Color ${tag}: Dorado` })
      .click();
    await expect(page).not.toHaveURL(/f\./u);
    await list.expectTitles([`Anillo oro ${tag}`]);
    await list
      .chips()
      .getByRole("link", { name: "Quitar filtro: Disponibilidad: Disponible" })
      .click();
    await expect(page).not.toHaveURL(/availability=/u);
    await list.expectTitles([`Anillo plata ${tag}`, `Anillo oro ${tag}`]);
    await list.chips().getByRole("link", { name: "Limpiar todo" }).click();
    await expect(page).toHaveURL(new RegExp(`\\?q=${tag}$`, "u"));
    await list.expectTitles([
      `Borrador ${tag}`,
      `Anillo plata ${tag}`,
      `Anillo oro ${tag}`,
    ]);

    // A category keeps to its own articles, and a group's slug stands for
    // every category in it, never another group's: a draft of the search
    // in another group shows in neither.
    const others = await db.seed.createCategory({
      nameEs: `Otros ${tag}`,
      slug: `otros-${tag}`,
    });
    const earrings = await db.seed.createCategory({
      nameEs: `Aros ${tag}`,
      parentId: others.id,
      slug: `aros-${tag}`,
    });
    await db.seed.createArticle({
      categoryId: earrings.id,
      title: `Borrador aro ${tag}`,
    });
    await list.goto(`?q=${tag}&status=draft`);
    await list.expectTitles([`Borrador aro ${tag}`, `Borrador ${tag}`]);
    await list.goto(`?q=${tag}&category=anillos-${tag}&status=draft`);
    await list.expectTitles([`Borrador ${tag}`]);
    await list.goto(`?q=${tag}&category=joyas-${tag}&status=draft`);
    await list.expectTitles([`Borrador ${tag}`]);
  });

  test("sorts by a column's header, both ways, the article without a price last", async ({
    db,
    page,
  }) => {
    const { tag } = await setup({ db });
    const list = new AdminProductsPage(page);
    await list.goto(`?q=${tag}`);
    await expect(list.columnHeader("updated")).toHaveAttribute(
      "aria-sort",
      "descending"
    );

    await expect(list.sortHeader("price")).toHaveAccessibleName(
      "Ordenar: Precio, de menor a mayor"
    );
    await list.sortHeader("price").click();
    await expect(page).toHaveURL(new RegExp(`\\?q=${tag}&sort=price$`, "u"));
    await list.expectTitles([
      `Anillo plata ${tag}`,
      `Anillo oro ${tag}`,
      `Borrador ${tag}`,
    ]);
    await expect(list.columnHeader("price")).toHaveAttribute(
      "aria-sort",
      "ascending"
    );

    await list.sortHeader("price").click();
    await expect(page).toHaveURL(/sort=price&dir=desc$/u);
    await list.expectTitles([
      `Anillo oro ${tag}`,
      `Anillo plata ${tag}`,
      `Borrador ${tag}`,
    ]);
    await expect(list.columnHeader("price")).toHaveAttribute(
      "aria-sort",
      "descending"
    );

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`\\?q=${tag}&sort=price$`, "u"));
    await list.expectTitles([
      `Anillo plata ${tag}`,
      `Anillo oro ${tag}`,
      `Borrador ${tag}`,
    ]);
  });

  test("pages through the address, a page past the end says so, and a reload keeps the page", async ({
    db,
    page,
  }) => {
    test.slow();
    const tag = uniqueTag();
    const category = await db.seed.createCategory({
      nameEs: `Lote ${tag}`,
      slug: `lote-${tag}`,
    });

    for (let index = 1; index <= 26; index += 1) {
      await db.seed.createArticle({
        categoryId: category.id,
        priceAmount: index * 1000,
        title: `Lote ${tag} ${String(index).padStart(2, "0")}`,
      });
    }

    const list = new AdminProductsPage(page);
    await list.goto(`?q=${tag}&sort=title`);
    await expect(list.count()).toHaveText("26 artículos");
    await expect(list.range()).toHaveText("1–24 de 26");
    await expect(
      list.pages().getByRole("link", { name: "Página 1" })
    ).toHaveAttribute("aria-current", "page");

    await list.pages().getByRole("link", { name: "Página siguiente" }).click();
    await expect(page).toHaveURL(
      new RegExp(`\\?q=${tag}&sort=title&page=2$`, "u")
    );
    await list.expectTitles([`Lote ${tag} 25`, `Lote ${tag} 26`]);
    await expect(list.range()).toHaveText("25–26 de 26");
    // The new page is said: focus moves to the table, described by its range.
    await expect(list.table()).toBeFocused();

    await page.reload();
    await list.waitForLoad();
    await list.expectTitles([`Lote ${tag} 25`, `Lote ${tag} 26`]);

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`\\?q=${tag}&sort=title$`, "u"));
    await expect(list.range()).toHaveText("1–24 de 26");

    await list.goto(`?q=${tag}&page=9`);
    const pastTheEnd = list.list().getByTestId("product-list-empty-page");
    await expect(pastTheEnd).toContainText("No hay artículos en esta página.");
    await pastTheEnd
      .getByRole("link", { name: "Ir a la primera página" })
      .click();
    await expect(page).toHaveURL(new RegExp(`\\?q=${tag}$`, "u"));
    await expect(list.range()).toHaveText("1–24 de 26");
  });
});

test.describe("the article list on a phone", () => {
  test.use({ viewport: { height: 844, width: 390 } });

  test("sorts from 'Ordenar', filters in a full-width sheet, and never scrolls sideways", async ({
    db,
    page,
  }) => {
    const { tag } = await setup({ db });
    const list = new AdminProductsPage(page);
    await list.goto(`?q=${tag}`);
    await expect(list.list().getByTestId("product-list-columns")).toBeHidden();

    await list.openSortMenu();
    await list
      .sortMenu()
      .getByRole("menuitemradio", { name: "Precio, de mayor a menor" })
      .click();
    await expect(page).toHaveURL(/sort=price&dir=desc$/u);
    await list.expectTitles([
      `Anillo oro ${tag}`,
      `Anillo plata ${tag}`,
      `Borrador ${tag}`,
    ]);

    await list.openFilters();
    // The sheet slides in from the right: measured mid-slide its box is
    // off by a sliver, so wait for it to rest across the whole screen.
    await expect
      .poll(async () => {
        const box = await list.sheet().boundingBox();

        return box && { width: box.width, x: box.x };
      })
      .toEqual({ width: 390, x: 0 });
    // A tap on the pill, the radio's label, chooses it.
    await list.statusChoice("Borrador").click();
    await expect(
      list.sheet().getByRole("radio", { name: "Borrador" })
    ).toBeChecked();
    await list.sheet().getByRole("button", { name: "Aplicar" }).click();
    await expectDialogRemoved(page, list.sheet());
    await list.expectTitles([`Borrador ${tag}`]);

    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(sideways).toBe(0);
  });
});
