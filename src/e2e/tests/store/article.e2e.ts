import type { Locator } from "@playwright/test";

import {
  type DbFixture,
  expect,
  STORE_SETTINGS,
  test,
  uniqueTag,
} from "../../fixtures";
import { clickUntilVisible } from "../../fixtures/click-until-visible";
import { expectDialogRemoved } from "../../fixtures/expect-dialog-removed";
import { StorePage } from "../../page-objects/store.page";

// FER-024. Each test seeds its own articles, at addresses no other test has;
// the store's WhatsApp is the run's (`STORE_SETTINGS`).
test.use({ storageState: { cookies: [], origins: [] } });

/** A published article with three photos, in a category of the test's own. */
async function setup(
  { db }: { db: DbFixture["db"] },
  options: { isAvailable?: boolean } = {}
) {
  const tag = uniqueTag();
  const rings = await db.seed.createCategory({
    nameEs: `Anillos ${tag}`,
    slug: `anillos-${tag}`,
  });
  const article = await db.seed.createArticle({
    categoryId: rings.id,
    images: 3,
    isAvailable: options.isAvailable ?? true,
    priceAmount: 120_000,
    title: "Anillo de plata",
  });

  return { article, rings };
}

test.describe("Article page", () => {
  test("the gallery's round arrow steps through the photos and goes round past the last, and the one in view opens full screen", async ({
    db,
    page,
  }) => {
    const { article } = await setup({ db });
    await page.goto(`/productos/${article.slug}`);
    const gallery = page.getByTestId("store-gallery");
    // Said to a screen reader, out of sight.
    const position = gallery.locator("output");
    await expect(position).toHaveText("Foto 1 de 3");

    await clickUntilVisible(
      gallery.getByRole("button", { name: "Foto siguiente" }),
      gallery.getByText("Foto 2 de 3")
    );
    // Every slide is named by its place; the photo in view sits at the left
    // edge of the gallery (the slide's own box holds the gap before it).
    const slide = (place: number) =>
      gallery.getByRole("group", { name: `${place} de 3` });
    const leftEdge = async (place: number) => {
      const [box, frame] = await Promise.all([
        slide(place).getByRole("img").boundingBox(),
        gallery.boundingBox(),
      ]);
      // `|| 0`: a slide moved round by a transform can sit at -0.
      return Math.round((box?.x ?? -1) - (frame?.x ?? 0)) || 0;
    };
    await expect.poll(async () => await leftEdge(2)).toBe(0);
    await gallery.getByRole("button", { name: "Foto siguiente" }).click();
    await expect(position).toHaveText("Foto 3 de 3");

    // Every photo shares the article's alt text: the zoom is told apart by
    // its source, which next/image passes on as `url=`.
    const source = async (image: Locator) => {
      const src = await image.getAttribute("src");
      return src === null
        ? null
        : new URL(src, page.url()).searchParams.get("url");
    };
    const third = await source(slide(3).getByRole("img"));
    expect(third).toBe("/seed/ring-3.jpg");
    const zoom = page.getByTestId("store-gallery-zoom");
    await gallery.getByRole("button", { name: "Ampliar la foto" }).click();
    await expect(zoom).toBeVisible();
    await expect
      .poll(async () => await source(zoom.getByRole("img")))
      .toBe(third);
    await zoom.getByRole("button", { name: "Cerrar la foto ampliada" }).click();
    await expectDialogRemoved(page, zoom);

    // Past the last photo comes the first again (FER-045): the arrow still
    // leads on, and the first photo glides in from the right.
    const arrow = gallery.getByRole("button", { name: "Foto siguiente" });
    await arrow.click();
    await expect(position).toHaveText("Foto 1 de 3");
    await expect.poll(async () => await leftEdge(1)).toBe(0);
    await expect(
      gallery.getByRole("button", { name: "Volver a la primera foto" })
    ).toHaveCount(0);
    // And back round the other way, by the keyboard.
    await arrow.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(position).toHaveText("Foto 3 de 3");
    await expect.poll(async () => await leftEdge(3)).toBe(0);
  });

  test("an article with one photo has nothing to move it", async ({
    db,
    page,
  }) => {
    const tag = uniqueTag();
    const rings = await db.seed.createCategory({
      nameEs: `Anillos ${tag}`,
      slug: `anillos-${tag}`,
    });
    const article = await db.seed.createArticle({
      categoryId: rings.id,
      priceAmount: 120_000,
      title: "Anillo de plata",
    });
    await page.goto(`/productos/${article.slug}`);
    const gallery = page.getByTestId("store-gallery");

    await expect(
      gallery.getByRole("button", { name: "Ampliar la foto" })
    ).toBeEnabled();
    await expect(
      gallery.getByRole("button", { name: "Foto siguiente" })
    ).toHaveCount(0);
    await expect(gallery.locator("output")).toHaveCount(0);
  });

  test("adds the chosen quantity to the cart", async ({ db, page }) => {
    const { article } = await setup({ db });
    await page.goto(`/productos/${article.slug}`);
    const storePage = new StorePage(page);
    const quantity = page.getByTestId("store-article-quantity");

    await clickUntilVisible(
      page.getByRole("button", { name: "Una unidad más" }),
      quantity.getByText("2")
    );
    await page.getByRole("button", { name: "Una unidad más" }).click();
    await expect(quantity).toHaveText("3");
    await page.getByRole("button", { name: "Agregar al carrito" }).click();

    await expect(page.getByText("Agregado al carrito.")).toBeVisible();
    await expect(storePage.getCartButton()).toHaveAccessibleName(
      "Carrito, 3 unidades"
    );
  });

  for (const width of [375, 1440]) {
    test(`at ${width} px, the price under the name, the whole description, then the quantity beside the ink button on one row`, async ({
      db,
      page,
    }) => {
      await page.setViewportSize({ height: 900, width });
      const tag = uniqueTag();
      const rings = await db.seed.createCategory({
        nameEs: `Anillos ${tag}`,
        slug: `anillos-${tag}`,
      });
      const article = await db.seed.createArticle({
        categoryId: rings.id,
        description:
          "Un anillo con baño de oro.\n\nSe usa solo o con anillos finos. Queda bien de día y de noche.",
        priceAmount: 99_000,
        title: "Anillo de prueba",
      });
      await page.goto(`/productos/${article.slug}`);

      const name = page.getByRole("heading", { level: 1 });
      await expect(name).toHaveText("Anillo de prueba");
      const description = page.getByTestId("store-article-description");
      await expect(description.getByRole("paragraph")).toHaveText([
        "Un anillo con baño de oro.",
        "Se usa solo o con anillos finos. Queda bien de día y de noche.",
      ]);
      const row = page.getByTestId("store-article-purchase-row");
      const add = row.getByRole("button", { name: "Agregar al carrito" });
      const quantity = row.getByRole("group", { name: "Cantidad" });
      const [addBox, quantityBox, nameBox, priceBox] = await Promise.all([
        add.boundingBox(),
        quantity.boundingBox(),
        name.boundingBox(),
        page
          .getByTestId("store-article")
          // Intl puts a no-break space between the sign and the amount.
          .getByText(/^\$\s990$/u)
          // The article's own comes first; a suggestion below may cost the same.
          .first()
          .boundingBox(),
      ]);
      // One row: side by side, the same height and top.
      expect(addBox?.y).toBe(quantityBox?.y);
      expect((addBox?.x ?? 0) > (quantityBox?.x ?? 0)).toBe(true);
      // The price right under the name.
      expect(
        (priceBox?.y ?? 0) - ((nameBox?.y ?? 0) + (nameBox?.height ?? 0))
      ).toBeLessThan(16);
      // The ink with the lime (FER-039).
      await expect(add).toHaveCSS("background-color", "rgb(21, 22, 15)");
      await expect(add).toHaveCSS("color", "rgb(200, 243, 29)");
    });
  }

  test("“También te puede gustar” suggests its category's other articles, never itself, and fills a small category from the rest", async ({
    db,
    page,
  }) => {
    const tag = uniqueTag();
    const [rings, chains] = await Promise.all([
      db.seed.createCategory({
        nameEs: `Anillos ${tag}`,
        slug: `anillos-${tag}`,
      }),
      db.seed.createCategory({
        nameEs: `Cadenas ${tag}`,
        slug: `cadenas-${tag}`,
      }),
    ]);
    // A price publishes a seeded article; without one it is a draft.
    const article = await db.seed.createArticle({
      categoryId: rings.id,
      priceAmount: 90_000,
      title: `Anillo ${tag}`,
    });
    const sameTitles = [`Anillo uno ${tag}`, `Anillo dos ${tag}`];
    for (const title of sameTitles) {
      await db.seed.createArticle({
        categoryId: rings.id,
        priceAmount: 50_000,
        title,
      });
    }
    // Enough of the rest of the store to fill the row, whatever else is in it.
    for (let index = 0; index < 6; index += 1) {
      await db.seed.createArticle({
        categoryId: chains.id,
        priceAmount: 70_000,
        title: `Cadena ${index} ${tag}`,
      });
    }

    await page.goto(`/productos/${article.slug}`);
    const row = page.getByRole("region", { name: "También te puede gustar" });
    const names = row.getByRole("heading", { level: 3 });

    await expect(names).toHaveCount(8);
    // The festive band sits between the article and the row; its picture is
    // for the eye only.
    const band = page.getByTestId("store-article-band");
    await expect(
      band.getByTestId("store-article-band-picture")
    ).toHaveAttribute("aria-hidden", "true");
    const [bandBox, rowBox, addBox] = await Promise.all([
      band.boundingBox(),
      row.boundingBox(),
      page.getByRole("button", { name: "Agregar al carrito" }).boundingBox(),
    ]);
    expect((bandBox?.y ?? 0) > (addBox?.y ?? 0)).toBe(true);
    expect((rowBox?.y ?? 0) >= (bandBox?.y ?? 0) + (bandBox?.height ?? 0)).toBe(
      true
    );
    const shown = await names.allTextContents();
    expect(shown).toEqual(expect.arrayContaining(sameTitles));
    expect(shown).not.toContain(`Anillo ${tag}`);
    // The category's own come first, whatever the draw.
    expect(new Set(shown.slice(0, 2))).toEqual(new Set(sameTitles));
  });

  test("the festive band moves while it is on screen, and its pause button holds every piece still", async ({
    db,
    page,
  }) => {
    const { article } = await setup({ db });
    await page.goto(`/productos/${article.slug}`);
    const band = page.getByTestId("store-article-band");
    await band.scrollIntoViewIfNeeded();
    await expect(band).toHaveAttribute("data-running", "true");
    const pause = band.getByRole("button", { name: "Pausar la animación" });
    const streamer = band.getByTestId("store-article-band-streamer").first();
    // Running is only set once React owns the band: one click is enough,
    // and a second would start it again.
    await expect(streamer).toHaveCSS("animation-play-state", "running");

    await pause.click();

    await expect(pause).toHaveAttribute("aria-pressed", "true");
    await expect(band).toHaveAttribute("data-running", "false");
    // Paused where it is, so nothing jumps.
    await expect(streamer).toHaveCSS("animation-play-state", "paused");

    await pause.click();
    await expect(band).toHaveAttribute("data-running", "true");
  });

  test("a sold-out article stays visible, cannot be added, and offers the store's WhatsApp with the article written", async ({
    db,
    page,
  }) => {
    const { article } = await setup({ db }, { isAvailable: false });
    await page.goto(`/productos/${article.slug}`);

    await expect(
      page.getByRole("heading", { level: 1, name: "Anillo de plata" })
    ).toBeVisible();
    await expect(page.getByText("Agotado por ahora")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Agregar al carrito" })
    ).toHaveCount(0);
    const whatsapp = page.getByTestId("store-article-whatsapp");
    const href = (await whatsapp.getAttribute("href")) ?? "";
    expect(
      href.startsWith(
        `https://wa.me/${STORE_SETTINGS.whatsappNumber.slice(1)}?text=`
      )
    ).toBe(true);
    expect(decodeURIComponent(href.split("text=")[1] ?? "")).toContain(
      "«Anillo de plata»"
    );
  });

  for (const [locale, prefix] of [
    ["es", ""],
    ["en", "/en"],
  ] as const) {
    test(`in ${locale}, the title, canonical address and structured data are the article's`, async ({
      db,
      page,
    }) => {
      const { article } = await setup({ db });
      const path = `${prefix}/productos/${article.slug}`;

      const response = await page.goto(path);

      expect(response?.status()).toBe(200);
      await expect(page).toHaveTitle(
        `Anillo de plata · ${STORE_SETTINGS.name}`
      );
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        new URL(path, page.url()).href
      );
      const structured = JSON.parse(
        (await page
          .locator('script[type="application/ld+json"]')
          .textContent()) ?? "[]"
      ) as {
        "@type": string;
        name?: string;
        offers?: { availability: string; price: string };
        sameAs?: string[];
      }[];
      expect(structured.map((entry) => entry["@type"])).toEqual([
        "Product",
        "BreadcrumbList",
        "Organization",
      ]);
      expect(structured[0]?.offers).toMatchObject({
        availability: "https://schema.org/InStock",
        price: "1200.00",
      });
      // The store behind the article, from its settings.
      expect(structured[2]).toMatchObject({
        name: STORE_SETTINGS.name,
        sameAs: [STORE_SETTINGS.instagramUrl],
      });
    });
  }

  test("a draft is a 404, never a page", async ({ db, page }) => {
    const { rings } = await setup({ db });
    const draft = await db.seed.createArticle({
      categoryId: rings.id,
      title: "Borrador",
    });

    const response = await page.goto(`/productos/${draft.slug}`);

    expect(response?.status()).toBe(404);
    await expect(new StorePage(page).getNotFoundHeading()).toBeVisible();
  });
});
