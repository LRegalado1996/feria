import { type DbFixture, expect, test } from "../../fixtures";
import { clickUntilVisible } from "../../fixtures/click-until-visible";
import { expectDialogRemoved } from "../../fixtures/expect-dialog-removed";
import { StorePage } from "../../page-objects/store.page";

// FER-024. Each test seeds its own store and articles.
test.use({ storageState: { cookies: [], origins: [] } });

const TEXTS = [
  { description: "Joyas.", locale: "es" as const, tagline: "Joyas" },
  { description: "Jewelry.", locale: "en" as const, tagline: "Jewelry" },
];

/** A store with WhatsApp and a published article with three photos. */
async function setup(
  { db }: { db: DbFixture["db"] },
  options: { isAvailable?: boolean } = {}
) {
  const store = await db.seed.createStore(
    { name: "Article Store", whatsappNumber: "+59899123456" },
    TEXTS
  );
  const rings = await db.seed.createCategory(store.id, {
    nameEs: "Anillos",
    position: 0,
    slug: "anillos",
  });
  const article = await db.seed.createArticle(
    store.id,
    rings.id,
    "Anillo de plata",
    {
      images: 3,
      isAvailable: options.isAvailable ?? true,
      priceAmount: 120_000,
    }
  );

  return { article, rings, store };
}

test.describe("Article page", () => {
  test("the gallery steps, jumps to a thumbnail and opens a photo full screen", async ({
    db,
    page,
  }) => {
    const { article, store } = await setup({ db });
    await page.goto(`/${store.slug}/products/${article.slug}`);
    const gallery = page.getByTestId("store-gallery");
    await expect(gallery.getByText("Foto 1 de 3")).toBeVisible();

    await clickUntilVisible(
      gallery.getByRole("button", { name: "Foto siguiente" }),
      gallery.getByText("Foto 2 de 3")
    );
    await gallery.getByRole("button", { name: "Ver la foto 3" }).click();
    await expect(gallery.getByText("Foto 3 de 3")).toBeVisible();

    const zoom = page.getByTestId("store-gallery-zoom");
    await gallery.getByRole("button", { name: "Ampliar la foto" }).click();
    await expect(zoom).toBeVisible();
    await zoom.getByRole("button", { name: "Cerrar la foto ampliada" }).click();
    await expectDialogRemoved(page, zoom);
  });

  test("adds the chosen quantity to the cart", async ({ db, page }) => {
    const { article, store } = await setup({ db });
    await page.goto(`/${store.slug}/products/${article.slug}`);
    const storePage = new StorePage(page, store.slug);
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

  test("a sold-out article stays visible, cannot be added, and offers WhatsApp with the article written", async ({
    db,
    page,
  }) => {
    const { article, store } = await setup({ db }, { isAvailable: false });
    await page.goto(`/${store.slug}/products/${article.slug}`);

    await expect(
      page.getByRole("heading", { level: 1, name: "Anillo de plata" })
    ).toBeVisible();
    await expect(page.getByText("Agotado por ahora")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Agregar al carrito" })
    ).toHaveCount(0);
    const whatsapp = page.getByTestId("store-article-whatsapp");
    const href = (await whatsapp.getAttribute("href")) ?? "";
    expect(href.startsWith("https://wa.me/59899123456?text=")).toBe(true);
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
      const { article, store } = await setup({ db });
      const path = `${prefix}/${store.slug}/products/${article.slug}`;

      const response = await page.goto(path);

      expect(response?.status()).toBe(200);
      await expect(page).toHaveTitle("Anillo de plata · Article Store");
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
        offers?: { availability: string; price: string };
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
    });
  }

  test("a draft is a 404, never a page", async ({ db, page }) => {
    const { rings, store } = await setup({ db });
    const draft = await db.seed.createArticle(store.id, rings.id, "Borrador");

    const response = await page.goto(`/${store.slug}/products/${draft.slug}`);

    expect(response?.status()).toBe(404);
  });
});
