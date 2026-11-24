import type { Page } from "@playwright/test";

import { type DbFixture, expect, test, uniqueTag } from "../../fixtures";
import { clickUntilVisible } from "../../fixtures/click-until-visible";
import { StorePage } from "../../page-objects/store.page";

// FER-079. A category with no published article is listed nowhere on the
// storefront, and neither is a group whose categories all have none. The
// test seeds its own categories in the one store every spec shares
// (FER-038) and reads only its own names; it publishes and unpublishes
// through the admin's API, as the admin's screen does, so the storefront's
// caches are dropped the way they are in production.

/**
 * A group, "Bijou", holding Anillos (one published article) and Aros (none);
 * Relojes in no group (none); and Burbujas in no group (one published
 * article, whose page is the cached surface the test reads).
 */
async function setup({ db }: { db: DbFixture["db"] }) {
  const tag = uniqueTag();
  const group = await db.seed.createCategory({
    nameEs: `Bijou ${tag}`,
    slug: `bijou-${tag}`,
  });
  const rings = await db.seed.createCategory({
    nameEs: `Anillos ${tag}`,
    parentId: group.id,
    slug: `anillos-${tag}`,
  });
  const earrings = await db.seed.createCategory({
    nameEs: `Aros ${tag}`,
    parentId: group.id,
    slug: `aros-${tag}`,
  });
  const watches = await db.seed.createCategory({
    nameEs: `Relojes ${tag}`,
    slug: `relojes-${tag}`,
  });
  const bubbles = await db.seed.createCategory({
    nameEs: `Burbujas ${tag}`,
    slug: `burbujas-${tag}`,
  });
  const ring = await db.seed.createArticle({
    categoryId: rings.id,
    priceAmount: 90_000,
    title: `Anillo sello ${tag}`,
  });
  const bubbleGun = await db.seed.createArticle({
    categoryId: bubbles.id,
    priceAmount: 60_000,
    title: `Burbujero ${tag}`,
  });

  return {
    bubbleGunPath: `/productos/${bubbleGun.slug}`,
    paths: {
      bubbles: `/${bubbles.slug}`,
      earrings: `/${group.slug}/${earrings.slug}`,
      group: `/${group.slug}`,
      rings: `/${group.slug}/${rings.slug}`,
      watches: `/${watches.slug}`,
    },
    ring,
    tag,
  };
}

/** Publishes or unpublishes an article as the admin's screen does. */
async function setPublished(page: Page, id: number, published: boolean) {
  const response = await page.request.post(
    `/api/orpc/product/${published ? "publish" : "unpublish"}`,
    { data: { json: { id } } }
  );

  expect(response.status()).toBe(200);
}

/** The paths of every `<loc>` of the sitemap that carry the test's tag. */
async function sitemapPaths(page: Page, tag: string) {
  const response = await page.request.get("/sitemap.xml");
  const xml = await response.text();

  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/gu)]
    .map((match) => new URL(match[1] ?? "").pathname)
    .filter((path) => path.includes(tag) && !path.startsWith("/en"));
}

test.describe("Categories with no published article", () => {
  test("are listed nowhere on the storefront, show once their first article is published and leave when the last is unpublished, with no redeploy", async ({
    db,
    page,
  }) => {
    const { bubbleGunPath, paths, ring, tag } = await setup({ db });
    await page.setViewportSize({ height: 812, width: 375 });
    const store = new StorePage(page);
    const ours = (names: string[]) =>
      names.filter((name) => name.endsWith(tag));
    // An article's page is static output over cached reads: what it lists
    // changes only when a write drops the catalog's cache.
    const footerOnArticle = async () => {
      await page.goto(bubbleGunPath);

      return ours(
        await store
          .getFooter()
          .getByRole("navigation", { name: "Tienda" })
          .getByRole("link")
          .allTextContents()
      );
    };
    const menuOnArticle = async () => {
      await page.goto(bubbleGunPath);
      const menu = store.getMobileMenu();
      await clickUntilVisible(store.getMenuButton("Menú"), menu);
      const names = ours(await menu.getByRole("link").allTextContents());
      await page.keyboard.press("Escape");

      return names;
    };
    const filterCategories = async () => {
      await page.goto("/productos");
      const panel = page.getByRole("dialog", { name: "Filtrar" });
      await clickUntilVisible(
        page.getByRole("button", { name: /^Filtrar/u }),
        panel
      );
      const names = ours(await panel.getByRole("link").allTextContents());
      await page.keyboard.press("Escape");

      return names;
    };

    // Its only article back to a draft: Anillos, and Bijou with it, hold
    // nothing. Aros and Relojes never did.
    await setPublished(page, ring.id, false);

    expect(await footerOnArticle()).toEqual([`Burbujas ${tag}`]);
    expect(await menuOnArticle()).toEqual([`Burbujas ${tag}`]);
    expect(await filterCategories()).toEqual([`Burbujas ${tag}`]);
    expect(await sitemapPaths(page, tag)).toEqual([paths.bubbles]);

    // A direct visit still answers: the page with its empty state, kept
    // out of the index, in a group and in none.
    for (const [path, name] of [
      [paths.rings, `Anillos ${tag}`],
      [paths.watches, `Relojes ${tag}`],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
      await expect(
        page.getByRole("heading", { name: "No encontramos nada" })
      ).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        "noindex, follow"
      );
    }

    // Published: Anillos shows, and its group with it; Aros and Relojes,
    // still empty, do not.
    await setPublished(page, ring.id, true);

    expect(await footerOnArticle()).toEqual([
      `Bijou ${tag}`,
      `Burbujas ${tag}`,
    ]);
    expect(await filterCategories()).toEqual([
      `Bijou ${tag}`,
      `Anillos ${tag}`,
      `Burbujas ${tag}`,
    ]);
    expect(await sitemapPaths(page, tag)).toEqual([
      paths.group,
      paths.rings,
      paths.bubbles,
    ]);
    await page.goto(bubbleGunPath);
    const menu = store.getMobileMenu();
    await clickUntilVisible(store.getMenuButton("Menú"), menu);
    await menu
      .getByRole("button", { name: `Bijou ${tag}: sus categorías` })
      .click();
    await expect(
      menu.getByRole("link", { name: `Anillos ${tag}` })
    ).toBeVisible();
    expect(ours(await menu.getByRole("link").allTextContents())).toEqual([
      `Bijou ${tag}`,
      `Anillos ${tag}`,
      `Burbujas ${tag}`,
    ]);
    await page.goto(paths.rings);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      `Anillos ${tag}`
    );
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);

    // Unpublished again: both leave, everywhere, at once.
    await setPublished(page, ring.id, false);

    expect(await footerOnArticle()).toEqual([`Burbujas ${tag}`]);
    expect(await menuOnArticle()).toEqual([`Burbujas ${tag}`]);
    expect(await sitemapPaths(page, tag)).toEqual([paths.bubbles]);
  });
});
