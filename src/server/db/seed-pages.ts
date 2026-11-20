import { and, eq } from "drizzle-orm";

import type { DatabaseClient } from "@/server/db";
import {
  banner,
  bannerTranslation,
  category,
  page,
  pageCoverBanner,
  pageSection,
  product,
  productTranslation,
} from "@/server/db/schema";
import { createSpotlight, lockStorePages } from "@/server/services/page";
import { createPage } from "@/server/services/page-settings";

/**
 * An example page built from sections (FER-060), so the store shows what a
 * page can be at once: published at `/regalos`, off the header, with a
 * cover banner, an article in the spotlight and two categories' rows.
 */
export const SEED_PAGE = {
  banner: {
    image: { file: "ring-3.jpg", height: 800, width: 1200 },
    phone: { file: "ring-3-phone.jpg", height: 800, width: 800 },
    title: { en: "Gifts for the holidays", es: "Regalos para las fiestas" },
  },
  /** The categories whose rows it shows, by slug, in order. */
  rows: ["anillos", "aros"],
  slug: "regalos",
  spotlight: {
    title: "Cadena corazones",
    words: {
      labelEn: "Gift idea",
      labelEs: "Para regalar",
      phraseEn: "A chain with little hearts, ready to give.",
      phraseEs: "Una cadena con corazones, lista para regalar.",
    },
  },
  values: {
    isPublished: true,
    nameEn: "Christmas gifts",
    nameEs: "Regalos de Navidad",
    seoDescriptionEn: null,
    seoDescriptionEs: null,
    seoTitleEn: null,
    seoTitleEs: null,
    showInHeader: false,
  },
} as const;

/**
 * The example page (`SEED_PAGE`), only on a store where nothing answers its
 * address yet, so a second run, or a page or a category the admin put
 * there, is left alone. Answers whether it added it.
 */
export async function seedPages(
  tx: DatabaseClient,
  storeId: number
): Promise<boolean> {
  await lockStorePages(tx, storeId);
  const existing = await tx.query.page.findFirst({
    columns: { id: true },
    where: and(eq(page.storeId, storeId), eq(page.slug, SEED_PAGE.slug)),
  });

  const rows = await tx
    .select({ id: category.id, slug: category.slug })
    .from(category)
    .where(eq(category.storeId, storeId));

  // Pages and categories share `/<slug>`: a category there would make
  // `createPage` refuse the address and fail the whole seed run.
  if (existing || rows.some((row) => row.slug === SEED_PAGE.slug)) {
    return false;
  }

  const created = await createPage(tx, {
    storeId,
    values: { ...SEED_PAGE.values, slug: SEED_PAGE.slug },
  });
  const [cover] = await tx
    .insert(banner)
    .values({
      imageHeight: SEED_PAGE.banner.image.height,
      imagePhoneHeight: SEED_PAGE.banner.phone.height,
      imagePhoneUrl: `/seed/${SEED_PAGE.banner.phone.file}`,
      imagePhoneWidth: SEED_PAGE.banner.phone.width,
      imageUrl: `/seed/${SEED_PAGE.banner.image.file}`,
      imageWidth: SEED_PAGE.banner.image.width,
      isActive: true,
      linkUrl: "/productos",
      storeId,
    })
    .returning({ id: banner.id });

  if (!cover) {
    throw new Error("Inserting a banner returned no row");
  }

  await tx.insert(bannerTranslation).values(
    (["es", "en"] as const).map((locale) => ({
      bannerId: cover.id,
      locale,
      title: SEED_PAGE.banner.title[locale],
    }))
  );
  await tx
    .insert(pageCoverBanner)
    .values({ bannerId: cover.id, pageId: created.id, position: 0 });
  const [article] = await tx
    .select({ id: product.id })
    .from(product)
    .innerJoin(productTranslation, eq(productTranslation.productId, product.id))
    .where(
      and(
        eq(product.storeId, storeId),
        eq(productTranslation.locale, "es"),
        eq(productTranslation.title, SEED_PAGE.spotlight.title)
      )
    );
  const idOf = new Map(rows.map((row) => [row.slug, row.id]));
  const spotlit = article
    ? await createSpotlight(tx, {
        storeId,
        values: {
          ...SEED_PAGE.spotlight.words,
          pageId: created.id,
          productId: article.id,
          rowsIndex: 0,
        },
      })
    : null;
  const categoryIds = SEED_PAGE.rows.flatMap((slug) => {
    const id = idOf.get(slug);

    return id === undefined ? [] : [id];
  });

  // The spotlight first, then the rows, whatever the service placed.
  const sections = [
    ...(spotlit
      ? [
          {
            kind: "spotlight" as const,
            pageId: created.id,
            spotlightId: spotlit.id,
            storeId,
          },
        ]
      : []),
    ...categoryIds.map((categoryId) => ({
      categoryId,
      kind: "category" as const,
      pageId: created.id,
      storeId,
    })),
  ];

  await tx.delete(pageSection).where(eq(pageSection.pageId, created.id));

  if (sections.length > 0) {
    await tx
      .insert(pageSection)
      .values(sections.map((section, position) => ({ ...section, position })));
  }

  return true;
}
