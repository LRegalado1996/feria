import { expect, test, uniqueTag } from "../../fixtures";
import { clickUntilVisible } from "../../fixtures/click-until-visible";
import { completeRpcAction } from "../../fixtures/complete-rpc-action";
import { AdminSignInPage } from "../../page-objects/admin-sign-in.page";
import { AdminPage } from "../../page-objects/admin.page";
import { StorePage } from "../../page-objects/store.page";

// FER-051. A category in no group the admin unticks from "Mostrar en el
// encabezado" leaves the store's header and phone menu, and its page stays
// open. The line on a computer holds only the first entries whose names fit
// (`BAR_CATEGORIES_MAX`), which a test's category, named after a whole UUID
// at the end of the list every spec shares, never is: the phone's menu,
// which lists every entry, is where its presence can be read. The catalog
// page reads its categories as of now, so its header follows the write.
test.use({ storageState: { cookies: [], origins: [] } });

test("a category unticked from the header leaves the menu, and its page stays open", async ({
  db,
  page,
}) => {
  const tag = uniqueTag();
  const name = `Burbujas ${tag}`;
  const bubbles = await db.seed.createCategory({
    nameEs: name,
    slug: `burbujas-${tag}`,
  });
  await db.seed.createArticle({
    categoryId: bubbles.id,
    priceAmount: 45_000,
    title: `Pompa ${tag}`,
  });
  const storePage = new StorePage(page);
  const menuNames = async () => {
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto("/productos");
    const menu = storePage.getMobileMenu();
    await clickUntilVisible(storePage.getMenuButton("Menú"), menu);
    const names = (await menu.getByRole("link").allTextContents()).filter(
      (text) => text.endsWith(tag)
    );
    await page.keyboard.press("Escape");

    return names;
  };

  // A new category starts in the header.
  expect(await menuNames()).toEqual([name]);

  const login = await db.seed.createLogin();
  await page.setViewportSize({ height: 900, width: 1440 });
  const signIn = new AdminSignInPage(page);
  await signIn.goto();
  await signIn.signIn(login.email, login.password);
  const admin = new AdminPage(page);
  await admin.waitForLoad();
  await admin.goto("/admin/categories");
  const row = page.getByTestId(`category-row-burbujas-${tag}`);
  const form = page.getByTestId("category-page-form");

  // The first open after the page loaded: repeated until React owns it.
  await clickUntilVisible(
    row.getByRole("button", { name: `Página y grupo: ${name}` }),
    form
  );
  const checkbox = form.getByRole("checkbox", {
    name: "Mostrar en el encabezado",
  });
  await expect(checkbox).toBeChecked();
  await checkbox.uncheck();
  await completeRpcAction(
    page,
    "/api/orpc/category/updatePage",
    async () => {
      await form.getByRole("button", { name: "Guardar la página" }).click();
    },
    { input: { id: bubbles.id, showInHeader: false } }
  );
  await expect(form).toHaveCount(0);

  expect(await menuNames()).toEqual([]);

  // On a computer the header's line has none of it either.
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto("/productos");
  await expect(
    storePage.getSiteHeader().getByRole("link", { name: "Catálogo" })
  ).toBeVisible();
  await expect(
    storePage.getSiteHeader().getByRole("link", { name })
  ).toHaveCount(0);

  // Its page still answers, with its article.
  await page.goto(`/burbujas-${tag}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(
    page
      .getByTestId("store-catalog-grid")
      .filter({ visible: true })
      .getByRole("heading", { level: 2 })
  ).toHaveText([`Pompa ${tag}`]);
});
