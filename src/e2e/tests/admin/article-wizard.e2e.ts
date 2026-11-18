import type { Locator, Page } from "@playwright/test";

import { type DbFixture, expect, test, uniqueTag } from "../../fixtures";
import { interceptBlobStore, seedPhoto } from "../../fixtures/blob-store";
import { completeRpcAction } from "../../fixtures/complete-rpc-action";
import { expectDialogRemoved } from "../../fixtures/expect-dialog-removed";
import { AdminProductWizardPage } from "../../page-objects/admin-product-wizard.page";

// FER-017. A new article goes from photos to published in three steps, and
// an article opened from the list, a draft or a published one, is edited on
// one screen (Lucas, 2026-11-18). Nothing reaches the real Blob store
// (`interceptBlobStore`); the tokens and the saves are the app's own. Every
// test works in a category and on articles of its own.

const RING_1 = seedPhoto("ring-1.jpg");
const RING_2 = seedPhoto("ring-2.jpg");
const RING_3 = seedPhoto("ring-3.jpg");

/** Where `locator` is drawn on the page. */
async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();

  if (!box) {
    throw new Error("Not drawn on the page");
  }

  return box;
}

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
  // Its search texts are its title and description: nothing to fill in.
  await expect(
    page.getByRole("textbox", { name: /para buscadores/u })
  ).toHaveCount(0);
  await wizard.titleField().fill(title);
  await expect(wizard.googlePreview()).toContainText(title);
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

  test("a draft left half-way opens again exactly as it was: on its step after a reload, and on one screen from the list", async ({
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

    // A reload mid-way goes on with the journey, on the same step.
    await expect(page).toHaveURL(
      new RegExp(`/admin/products/${id}\\?step=details$`, "u")
    );
    await page.reload();
    await wizard.waitForWizard();
    await expect(wizard.step("details")).toBeVisible();
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
    // From the list, everything on one screen: no steps.
    await expect(wizard.screen()).toBeVisible();
    await expect(wizard.stepsNavigation()).toHaveCount(0);
    await expect(wizard.photos()).toHaveCount(2);
    expect(await wizard.photoUrls()).toEqual(uploads);
    await expect(wizard.titleField()).toHaveValue(title);
    await expect(wizard.priceField()).toHaveValue("12,5");
  });

  test("a draft from the list is edited and published on one screen, what is missing leading to its field", async ({
    db,
    page,
  }) => {
    test.slow();
    const { category, title, wizard } = await setup({ db, page });
    const draft = await db.seed.createArticle({
      categoryId: category.id,
      title,
    });
    await wizard.gotoArticle(draft.id);
    await expect(wizard.screen()).toBeVisible();
    await expect(wizard.stepsNavigation()).toHaveCount(0);

    // Pressable while something is missing, and it leads to the field.
    await expect(wizard.publishButton()).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    await wizard.publishButton().press("Enter");
    await expect(
      page.getByRole("heading", { level: 2, name: "Fotos del artículo" })
    ).toBeFocused();

    await wizard.addPhotos([RING_1], 1);
    const saved = wizard.savedWhen((body) =>
      body.includes('"priceAmount":1250')
    );
    await wizard.priceField().fill("12,50");
    await wizard.priceField().blur();
    await saved;
    await expect(page.getByTestId("product-publish-ready")).toBeVisible();

    await completeRpcAction(page, "/api/orpc/product/publish", async () => {
      await wizard.publishButton().click();
    });
    await expect(
      page
        .getByTestId("product-publish-success")
        .getByRole("heading", { name: "¡Publicado!" })
    ).toBeFocused();
    // Published, its address is the article's own: a reload is its screen.
    await expect(page).toHaveURL(
      new RegExp(`/admin/products/${draft.id}$`, "u")
    );
    await page.reload();
    await wizard.waitForWizard();
    await expect(wizard.screen()).toBeVisible();
    await expect(wizard.moreActions()).toBeVisible();
    await expect(wizard.viewInStore()).toHaveAttribute(
      "href",
      /^\/productos\/[a-z0-9-]+$/u
    );
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
    // Even on a step's address, a published article is its single screen.
    await wizard.gotoArticle(article.id, { step: "details" });
    await expect(wizard.screen()).toBeVisible();
    // No panel (Lucas, 2026-11-18): the store's link is on its card.
    await expect(wizard.viewInStore()).toHaveAttribute(
      "href",
      `/productos/${article.slug}`
    );
    await expect(wizard.viewInStore()).toHaveAttribute("target", "_blank");

    await wizard.priceField().fill("1575,50");
    await wizard.priceField().blur();
    await expect(wizard.saveStatus()).toHaveText("Cambios sin guardar");
    await page.reload();
    await wizard.waitForWizard();

    // Said once, as a toast; the save line keeps saying it.
    await expect(
      page.getByText("Recuperamos cambios que no habías guardado.")
    ).toBeVisible();
    await expect(wizard.saveStatus()).toHaveText("Cambios sin guardar");
    await expect(wizard.priceField()).toHaveValue("1575,5");
    // The owner saw this very state reload over and over (2026-11-18): the
    // screen stays put, no new document and no new read of the page. A
    // production build prefetches the links in view (the navigation, the
    // language pill), each marked `next-router-prefetch`; those read no
    // page into this screen, so they are not counted.
    await expect(
      page.waitForRequest(
        (request) =>
          request.isNavigationRequest() ||
          (request.url().includes("_rsc=") &&
            request.headers()["next-router-prefetch"] === undefined),
        { timeout: 3000 }
      )
    ).rejects.toThrow(/Timeout 3000ms exceeded/u);
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
    await expect(wizard.saveStatus()).toHaveText("Sin cambios");
    await expect(
      page.getByText("Recuperamos cambios que no habías guardado.")
    ).toHaveCount(0);
  });

  test("a published article goes back to draft from its menu, after asking", async ({
    db,
    page,
  }) => {
    const { category, wizard } = await setup({ db, page });
    const article = await db.seed.createArticle({
      categoryId: category.id,
      priceAmount: 129_000,
      title: `Pulsera ${uniqueTag()}`,
    });
    await wizard.gotoArticle(article.id);

    await wizard.openMoreActions();
    const menu = page.getByRole("menu").filter({ visible: true });
    // Nothing changed yet: nothing to discard.
    await expect(menu.getByRole("menuitem")).toHaveText(["Pasar a borrador"]);
    await menu.getByRole("menuitem", { name: "Pasar a borrador" }).click();
    const dialog = page.getByTestId("confirm-dialog");
    await completeRpcAction(page, "/api/orpc/product/unpublish", async () => {
      await dialog
        .getByRole("button", { name: "Sí, pasar a borrador" })
        .click();
    });
    await expectDialogRemoved(page, dialog);

    await expect(wizard.publishButton()).toBeVisible();
    await expect(wizard.moreActions()).toHaveCount(0);
    await expect(wizard.viewInStore()).toHaveCount(0);
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
      await wizard.gotoArticle(draft.id, { prefix });

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

  // The owner's review (2026-11-18): a photo that failed spilled out of its
  // tile, the photo wider than the card and its button outside it.
  test("a photo that fails stays inside its tile, its reason and its buttons too", async ({
    db,
    page,
  }) => {
    const { wizard } = await setup({ db, page });
    // The store refuses the upload outright, so it fails with a retry.
    await page.route("https://vercel.com/api/blob/**", async (route) => {
      await route.fulfill({
        json: { error: { code: "bad_request", message: "Refused" } },
        status: 400,
      });
    });
    await wizard.gotoNew();

    await wizard.photoInput().setInputFiles([RING_1]);

    const failed = wizard
      .queuedPhotos()
      .filter({ has: page.getByRole("alert") });
    await expect(failed).toHaveCount(1);
    const tile = await boxOf(failed);
    const parts = [
      failed.getByRole("img"),
      failed.getByRole("alert"),
      failed.getByRole("button", { name: "Reintentar: Foto 1" }),
      failed.getByRole("button", { name: "Descartar: Foto 1" }),
    ];

    for (const part of parts) {
      const box = await boxOf(part);
      expect(box.x).toBeGreaterThanOrEqual(tile.x);
      expect(box.y).toBeGreaterThanOrEqual(tile.y);
      expect(box.x + box.width).toBeLessThanOrEqual(tile.x + tile.width);
      expect(box.y + box.height).toBeLessThanOrEqual(tile.y + tile.height);
    }

    // The first photo never arrived: no draft, and it can be dropped.
    await failed.getByRole("button", { name: "Descartar: Foto 1" }).click();
    await expect(wizard.queuedPhotos()).toHaveCount(0);
    await expect(page).toHaveURL(/\/admin\/products\/new$/u);
  });
});
