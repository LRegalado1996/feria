import { expect, test, uniqueTag } from "../../fixtures";
import { interceptBlobStore, seedPhoto } from "../../fixtures/blob-store";
import { completeRpcAction } from "../../fixtures/complete-rpc-action";
import { expectDialogRemoved } from "../../fixtures/expect-dialog-removed";
import { AdminHomePage } from "../../page-objects/admin-home.page";
import { StorePage } from "../../page-objects/store.page";

// FER-020. The home's curation is the store's one set, which every page of
// the storefront shows (its bar above all), so this spec is serial. Each
// test asks for `homeEdit` for its teardown alone: the banners it added are
// deleted, the order is saved back and the run's announcement written back,
// whatever the screen saved. The page is the worker's own admin. The
// storefront's home rows are FER-022's; here, what shows now: the bar, and
// the admin's own state and preview.

const PHOTO = seedPhoto("bubbles-1.jpg");

test.describe("Home curation", () => {
  test("the announcement set in the admin shows on the storefront's bar with its link, the whole line on a computer and the short one on a phone", async ({
    homeEdit: _restoresTheHome,
    page,
  }) => {
    const tag = uniqueTag();
    const text = `Encontranos en la feria ${tag}`;
    // The short line holds 40 characters: the tag's first block is enough
    // in a serial spec, where nothing else writes the bar.
    const short = `Feria ${tag.slice(0, 8)}`;
    const home = new AdminHomePage(page);
    await home.open();

    await home.announcementField("Texto en español").fill(text);
    await home.announcementField("Versión corta en español").fill(short);
    await home.announcementField("Enlace").fill("/productos");
    await home.saveAnnouncement({ linkUrl: "/productos", textEs: text });

    // The preview shows it before the storefront is visited.
    await expect(home.preview().getByText(text)).toBeAttached();

    const store = new StorePage(page);

    for (const [width, height, shown] of [
      [1440, 900, text],
      [390, 844, short],
    ] as const) {
      await page.setViewportSize({ height, width });
      await store.goto();

      await expect(store.getAnnouncementFull()).toHaveText(text);
      await expect(store.getAnnouncementBar()).toContainText(shown);
      await expect(store.getAnnouncementLink()).toHaveAttribute(
        "href",
        "/productos"
      );
      // Its name is the whole line at every width.
      await expect(store.getAnnouncementLink()).toHaveAccessibleName(text);
      expect(await store.announcementLines()).toBe(1);
    }
  });

  test("an announcement switched off leaves the storefront without a bar", async ({
    homeEdit: _restoresTheHome,
    page,
  }) => {
    const home = new AdminHomePage(page);
    await home.open();

    await home.announcement().getByLabel("Mostrar el anuncio").uncheck();
    await home.saveAnnouncement({ isActive: false });

    const store = new StorePage(page);
    await store.goto();
    await expect(store.getSiteHeader()).toBeVisible();
    await expect(page.getByTestId("store-announcement-bar")).toHaveCount(0);
  });

  test("a banner added with an uploaded photo is listed as showing, sits between the rows, shows in the preview, and can be deleted", async ({
    homeEdit: _restoresTheHome,
    page,
  }) => {
    test.slow();
    const { uploads } = await interceptBlobStore(page);
    const title = `Banner ${uniqueTag()}`;
    const home = new AdminHomePage(page);
    await home.open();

    await home.openNewBanner();
    const form = home.bannerForm();
    const computer = form.getByRole("group", { name: "Foto para computadora" });
    await computer.getByTestId("image-uploader-input").setInputFiles(PHOTO);
    await expect(computer.getByRole("status")).toHaveText("Foto subida.");
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatch(
      /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/local\/banner\/[0-9a-f-]{36}\.(?:webp|jpg)$/
    );
    // How a computer and a phone crop it.
    await expect(form.getByTestId("banner-form-crop-preview")).toBeVisible();
    await form
      .getByRole("textbox", { exact: true, name: "Título en español" })
      .fill(title);
    await form
      .getByRole("combobox", { name: "Dónde va" })
      .selectOption({ label: "Entre dos filas" });
    await form
      .getByRole("combobox", { name: "Después de" })
      .selectOption({ label: "Antes de la primera fila" });
    await home.saveNewBanner({ placement: "rows", titleEs: title });
    await expectDialogRemoved(page, form);

    const row = home.bannerRow(title);
    await expect(row.getByTestId("home-banner-status")).toHaveText(
      "Se muestra"
    );
    await expect(row).toContainText("Entre filas");
    // First in the sequence under the cover, and drawn in the preview.
    await expect(
      home.getByTestId("home-layout-rows-item").first()
    ).toContainText(`Banner: ${title}`);
    await expect(home.preview().getByText(title)).toBeAttached();

    await row.getByRole("button", { name: `Borrar banner: ${title}` }).click();
    const dialog = page.getByRole("dialog", { name: "¿Borrar el banner?" });
    await completeRpcAction(page, "/api/orpc/home/deleteBanner", async () => {
      await dialog.getByRole("button", { exact: true, name: "Borrar" }).click();
    });
    await expect(page.getByText("Banner borrado.")).toBeVisible();
    await expectDialogRemoved(page, dialog);
    await expect(home.bannerRow(title)).toHaveCount(0);
    await expect(home.preview().getByText(title)).toHaveCount(0);
  });

  test("a ranking built from the store's articles keeps its order once saved, and warns beside one sold out", async ({
    db,
    homeEdit: _restoresTheHome,
    page,
  }) => {
    const tag = uniqueTag();
    const shelf = await db.seed.createCategory({
      nameEs: `Ranking ${tag}`,
      slug: `ranking-${tag}`,
    });
    const titles = {
      bubbles: `Burbujero ${tag}`,
      ring: `Anillo ${tag}`,
      soldOut: `Agotado ${tag}`,
    };
    await db.seed.createArticle({
      categoryId: shelf.id,
      priceAmount: 1290,
      title: titles.ring,
    });
    await db.seed.createArticle({
      categoryId: shelf.id,
      priceAmount: 990,
      title: titles.bubbles,
    });
    await db.seed.createArticle({
      categoryId: shelf.id,
      isAvailable: false,
      priceAmount: 590,
      title: titles.soldOut,
    });
    const home = new AdminHomePage(page);
    await home.open();

    await home.clearBestSellers();
    await home.addBestSeller(titles.ring);
    await home.addBestSeller(titles.soldOut);
    await home.addBestSeller(titles.bubbles);
    await home
      .bestSellerItems()
      .filter({ hasText: titles.bubbles })
      .getByRole("button", { name: `Subir: ${titles.bubbles}` })
      .click();

    const order = [titles.ring, titles.bubbles, titles.soldOut];
    await expect(home.bestSellerItems()).toHaveText(
      order.map((title) => new RegExp(title, "u"))
    );
    // Sold out: it stays ranked, and the storefront leaves it out.
    await expect(
      home
        .bestSellerItems()
        .filter({ hasText: titles.soldOut })
        .getByTestId("home-layout-warning")
    ).toHaveText(
      "Está agotado: no aparece en la tienda hasta que vuelva a estar disponible."
    );
    await expect(
      home
        .bestSellerItems()
        .filter({ hasText: titles.ring })
        .getByTestId("home-layout-warning")
    ).toHaveCount(0);

    await home.saveOrder();
    await home.open();

    await expect(home.bestSellerItems()).toHaveText(
      order.map((title) => new RegExp(title, "u"))
    );
    // The preview's best sellers: what can be bought. The preview is a
    // picture (`inert`), out of the accessibility tree, hence `includeHidden`.
    const previewRow = home
      .preview()
      .getByRole("region", { includeHidden: true, name: "Más vendidos" });
    await expect(previewRow.getByText(titles.ring)).toBeAttached();
    await expect(previewRow.getByText(titles.bubbles)).toBeAttached();
    await expect(previewRow.getByText(titles.soldOut)).toHaveCount(0);
  });

  test("on a phone the screen never scrolls sideways and its save is under the thumb", async ({
    homeEdit: _restoresTheHome,
    page,
  }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    const home = new AdminHomePage(page);
    await home.open();

    await home.expectNoHorizontalScroll();
    const save = home.saveOrderButton();
    await expect(save).toBeInViewport();
    const box = await save.boundingBox();
    // In the bar along the bottom of the screen, a 44 px target.
    expect(box?.y ?? 0).toBeGreaterThan(844 / 2);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});
