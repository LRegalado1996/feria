import type { Page } from "@playwright/test";

import { type DbFixture, expect, test, uniqueTag } from "../../fixtures";
import { interceptBlobStore, seedPhoto } from "../../fixtures/blob-store";
import { completeRpcAction } from "../../fixtures/complete-rpc-action";
import { expectDialogRemoved } from "../../fixtures/expect-dialog-removed";
import { AdminProductWizardPage } from "../../page-objects/admin-product-wizard.page";

// FER-017. An article goes from photos to published in the wizard, and a
// draft or a published article is edited in it. Nothing reaches the real
// Blob store (`interceptBlobStore`); the tokens and the saves are the app's
// own. Every test works in a category and on articles of its own.

const RING_1 = seedPhoto("ring-1.jpg");
const RING_2 = seedPhoto("ring-2.jpg");
const RING_3 = seedPhoto("ring-3.jpg");

/** Intl writes a no-break space between the currency and the amount. */
const price = (amount: string) => new RegExp(`\\$\\s${amount}$`, "u");

/** A category of the test's own, signed in, the Blob store stood in for. */
async function setup({ db, page }: { db: DbFixture["db"]; page: Page }) {
  const tag = uniqueTag();
  const category = await db.seed.createCategory({
    nameEs: `Anillos ${tag}`,
    slug: `anillos-${tag}`,
  });
  const { uploads } = await interceptBlobStore(page);

  return {
    category,
    tag,
    title: `Anillo ${tag}`,
    uploads,
    wizard: new AdminProductWizardPage(page),
  };
}

/**
 * Loads a new article from its photos to published, as the owner does from
 * a phone or a computer, and answers its page in the store.
 */
async function publishFromPhotos(
  page: Page,
  { category, title, wizard }: Awaited<ReturnType<typeof setup>>
) {
  await wizard.gotoNew();
  await expect(wizard.next()).toBeDisabled();
  await wizard.addFirstPhotos([RING_1, RING_2]);

  await wizard.next().click();
  await expect(wizard.step("details")).toBeVisible();
  await wizard.titleField().fill(title);
  await wizard.categoryField().selectOption({ value: String(category.id) });
  await wizard.priceField().fill("12,50");
  await wizard.priceField().blur();
  await wizard.expectSaved();

  await wizard.next().click();
  await expect(wizard.step("review")).toBeVisible();
  await expect(page.getByTestId("product-publish-ready")).toBeVisible();
  await expect(
    page.getByTestId("store-article-preview-card").getByText(title)
  ).toBeVisible();

  await completeRpcAction(page, "/api/orpc/product/publish", async () => {
    await wizard.publishButton().click();
  });
  const success = page.getByTestId("product-publish-success");
  await expect(
    success.getByRole("heading", { name: "¡Publicado!" })
  ).toBeFocused();
  const storeLink = success.getByRole("link", { name: "Ver en la tienda" });

  return (await storeLink.getAttribute("href")) ?? "";
}

test.describe("Article wizard", () => {
  test("creates an article from its photos, the first one creating the draft, publishes it, and the store shows it", async ({
    db,
    page,
  }) => {
    test.slow();
    const context = await setup({ db, page });

    const storePath = await publishFromPhotos(page, context);

    await expect(
      page.getByRole("link", { name: "Cargar otro" })
    ).toHaveAttribute("href", "/admin/products/new");
    await page.goto(storePath);
    const article = page.getByTestId("store-article");
    await expect(
      article.getByRole("heading", { level: 1, name: context.title })
    ).toBeVisible();
    await expect(article.getByText(price("12,50"))).toBeVisible();
  });

  test("a draft left half-way opens again exactly as it was, after a reload and from the list", async ({
    db,
    page,
  }) => {
    test.slow();
    const { category, title, uploads, wizard } = await setup({ db, page });
    const filterSlug = `color-${uniqueTag()}`;
    await db.seed.createFilter({
      nameEs: `Color ${filterSlug}`,
      slug: filterSlug,
      values: [
        { nameEs: "Dorado", slug: "dorado", swatchColor: "#d4af37" },
        { nameEs: "Plateado", slug: "plateado" },
      ],
    });
    await wizard.gotoNew();
    const id = await wizard.addFirstPhotos([RING_1]);
    await wizard.addPhotos([RING_2], 2);
    await wizard.next().click();
    await wizard.titleField().fill(title);
    await wizard.priceField().fill("12.50");
    await wizard.priceField().blur();
    await wizard.categoryField().selectOption({ value: String(category.id) });
    const chip = page
      .getByTestId(`product-filter-${filterSlug}`)
      .getByRole("button", { name: "Dorado" });
    const saved = wizard.savedWhen(
      (body) =>
        body.includes(title) &&
        body.includes(`"categoryId":${category.id}`) &&
        body.includes('"priceAmount":1250') &&
        /"attributeValueIds":\[\d/u.test(body)
    );
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await saved;

    await page.reload();
    await wizard.waitForWizard();
    await expect(wizard.titleField()).toHaveValue(title);
    await expect(wizard.priceField()).toHaveValue("12,5");
    await expect(wizard.categoryField()).toHaveValue(String(category.id));
    await expect(page.getByRole("button", { name: "Dorado" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await page.goto("/admin/products");
    await page
      .getByTestId(`product-row-${id}`)
      .getByRole("link", { name: new RegExp(title, "u") })
      .click();
    await wizard.waitForWizard();
    await expect(wizard.photos()).toHaveCount(2);
    expect(await wizard.photoUrls()).toEqual(uploads);
  });

  test("photos are put in order and the main one chosen from the keyboard, each move said aloud", async ({
    db,
    page,
  }) => {
    const { uploads, wizard } = await setup({ db, page });
    await wizard.gotoNew();
    await wizard.addFirstPhotos([RING_1]);
    await wizard.addPhotos([RING_2, RING_3], 3);
    await wizard.expectSaved();
    const [first, second, third] = await wizard.photoUrls();
    /** Whether a save's body lists `urls` in this order. */
    const inOrder = (body: string, urls: string[]) =>
      urls.every(
        (url, at) =>
          body.indexOf(url) > (at === 0 ? -1 : body.indexOf(urls[at - 1] ?? ""))
      );

    await page.getByRole("button", { name: "Mover después: Foto 1" }).focus();
    await page.keyboard.press("Enter");
    await expect(wizard.liveRegion()).toHaveText(
      "Foto 1 quedó en el lugar 2 de 3."
    );
    expect(await wizard.photoUrls()).toEqual([second, first, third]);

    // Each change is saved after a pause: the drag below starts once the
    // main photo's save landed, so no answer re-renders the grid under it.
    const mainSaved = wizard.savedWhen((body) =>
      inOrder(body, [third ?? "", second ?? "", first ?? ""])
    );
    await page
      .getByRole("button", { name: "Usar como principal: Foto 3" })
      .focus();
    await page.keyboard.press("Enter");
    await mainSaved;
    await expect(wizard.liveRegion()).toHaveText(
      "Foto 3 es ahora la principal."
    );
    expect(await wizard.photoUrls()).toEqual([third, second, first]);
    await expect(wizard.photos().first()).toHaveAttribute("data-main", "true");

    // The photo itself is the handle: space picks it up, an arrow moves
    // it, space drops it.
    await page
      .getByRole("button", { name: "Arrastrar para ordenar: Foto 1" })
      .focus();
    // dnd-kit listens for the arrows only from the task after the pick-up,
    // so a key pressed at once is lost: each one waits for what the last
    // one said, and the move is pressed again until it is heard.
    await page.keyboard.press("Space");
    await expect(page.getByText("Tomaste Foto 1.")).toBeAttached();
    await expect(async () => {
      await page.keyboard.press("ArrowRight");
      await expect(
        page.getByText("Foto 1 está sobre el lugar de Foto 2.")
      ).toBeAttached({ timeout: 2000 });
    }).toPass();
    await page.keyboard.press("Space");
    await expect
      .poll(async () => await wizard.photoUrls())
      .toEqual([second, third, first]);

    // The order is the article's: saved, it comes back after a reload.
    const saved = wizard.savedWhen((body) =>
      inOrder(body, [third ?? "", second ?? "", first ?? ""])
    );
    await page.getByRole("button", { name: "Mover antes: Foto 2" }).click();
    await saved;
    await page.reload();
    await wizard.waitForWizard();
    expect(await wizard.photoUrls()).toEqual([third, second, first]);
    expect(new Set(uploads)).toEqual(new Set([first, second, third]));
  });

  test("publishing waits until the article has everything, and says what is missing next to each field", async ({
    db,
    page,
  }) => {
    const { wizard } = await setup({ db, page });
    await wizard.gotoNew();
    await wizard.addFirstPhotos([RING_1]);
    await wizard.next().click();
    await wizard.next().click();
    const gaps = page.getByTestId("product-publish-gaps");
    await expect(gaps.getByRole("listitem")).toHaveText([
      "La categoría",
      "El precio",
      "El título",
    ]);
    let published = false;
    page.on("request", (request) => {
      if (request.url().includes("/api/orpc/product/publish")) {
        published = true;
      }
    });

    // Pressable, so it can say why it waits: `aria-disabled`, not disabled.
    await expect(wizard.publishButton()).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    await wizard.publishButton().press("Enter");
    await gaps.getByRole("button", { name: "Completar: El precio" }).click();

    await expect(wizard.step("details")).toBeVisible();
    await expect(wizard.priceField()).toBeFocused();
    await expect(page.getByText("Poné el precio para publicar.")).toBeVisible();
    await expect(
      page.getByText("Escribí el título para publicar.")
    ).toBeVisible();
    expect(published).toBe(false);
  });

  test("a published article's changes stay in this browser across a reload until they are saved, and only then does the store show them", async ({
    db,
    page,
  }) => {
    test.slow();
    const { category, wizard } = await setup({ db, page });
    const article = await db.seed.createArticle({
      categoryId: category.id,
      priceAmount: 129_000,
      title: `Collar ${uniqueTag()}`,
    });
    await wizard.gotoArticle(article.id, { step: "details" });
    await expect(page.getByTestId("product-published-notice")).toBeVisible();

    await wizard.priceField().fill("1575,50");
    await wizard.priceField().blur();
    await expect(wizard.saveStatus()).toHaveText("Cambios sin guardar");
    await page.reload();
    await wizard.waitForWizard();

    await expect(page.getByTestId("product-edits-notice")).toHaveText(
      "Recuperamos cambios que no habías guardado."
    );
    await expect(wizard.priceField()).toHaveValue("1575,5");
    const store = await page.context().newPage();
    await store.goto(`/productos/${article.slug}`);
    await expect(
      store.getByTestId("store-article").getByText(price("1.290"))
    ).toBeVisible();

    await wizard.saveChangesButton().click();
    const dialog = page.getByTestId("confirm-dialog");
    await expect(dialog).toContainText(
      "Tus clientes van a ver los cambios en la tienda enseguida."
    );
    await completeRpcAction(
      page,
      "/api/orpc/product/update",
      async () => {
        await dialog.getByRole("button", { name: "Sí, guardar" }).click();
      },
      { input: { priceAmount: 157_550 } }
    );
    await expectDialogRemoved(page, dialog);
    await expect(wizard.saveStatus()).toHaveText("Sin cambios");

    await store.reload();
    await expect(
      store.getByTestId("store-article").getByText(price("1.575,50"))
    ).toBeVisible();
    await page.reload();
    await wizard.waitForWizard();
    await expect(page.getByTestId("product-edits-notice")).toHaveCount(0);
  });

  for (const [prefix, typed, shown] of [
    ["", "12,50", "12,5"],
    ["", "12.50", "12,5"],
    ["/en", "12,50", "12.5"],
    ["/en", "12.50", "12.5"],
  ] as const) {
    test(`on ${prefix || "/"}, the price ${typed} is twelve and a half`, async ({
      db,
      page,
    }) => {
      const { category, wizard } = await setup({ db, page });
      const draft = await db.seed.createArticle({
        categoryId: category.id,
        title: `Aro ${uniqueTag()}`,
      });
      await wizard.gotoArticle(draft.id, { prefix, step: "details" });

      await completeRpcAction(
        page,
        "/api/orpc/product/update",
        async () => {
          await wizard.priceField().fill(typed);
          await wizard.priceField().blur();
        },
        { input: { priceAmount: 1250 } }
      );

      await expect(wizard.priceField()).toHaveValue(shown);
    });
  }
});

test.describe("Article wizard on a phone", () => {
  test.use({ viewport: { height: 844, width: 390 } });

  test("loads and publishes an article with the main action under the thumb, nothing scrolling sideways", async ({
    db,
    page,
  }) => {
    test.slow();
    const context = await setup({ db, page });

    const storePath = await publishFromPhotos(page, context);

    expect(storePath).toMatch(/^\/productos\//u);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBe(0);
  });
});
