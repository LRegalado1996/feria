import { and, eq, isNull, sql } from "drizzle-orm";

import type { DatabaseClient } from "@/server/db";
import {
  category,
  categoryTranslation,
  productImage,
  productImageTranslation,
  store,
  storeTranslation,
} from "@/server/db/schema";
import {
  createAttribute,
  createAttributeValue,
  setProductAttributeValues,
} from "@/server/services/attribute";
import { createProduct, publishProduct } from "@/server/services/catalog";
import { lockStoreCategories } from "@/server/services/category";

import { SEED_ARTICLES, SEED_PHOTOS } from "./seed-articles";

interface SeedImage {
  /** A photo in `public/seed/`. */
  file: string;
  height: number;
  width: number;
}

/**
 * A page's cover: one alt text for both images, so the phone's is the
 * computer's photo cropped for a phone (`<photo>-phone.jpg`), never another
 * picture; without one a phone shows the computer's.
 */
interface SeedCover {
  alt: { en: string; es: string };
  computer: SeedImage;
  phone: SeedImage | null;
}

interface SeedCategory {
  cover: SeedCover;
  en: string;
  es: string;
  /** The slug of the group it is in (FER-043), listed before it. */
  group?: string;
  slug: string;
}

/**
 * The Color filter of Lucas's store (FER-033), the colors Lucas chose on
 * 2026-11-14, each with the swatch shown beside its name.
 */
export const SEED_COLORS = [
  { en: "Gold", es: "Dorado", slug: "dorado", swatch: "#d4af37" },
  { en: "Silver", es: "Plateado", slug: "plateado", swatch: "#c0c0c0" },
  { en: "Rose gold", es: "Oro rosa", slug: "oro-rosa", swatch: "#b76e79" },
  { en: "Black", es: "Negro", slug: "negro", swatch: "#111111" },
  { en: "White", es: "Blanco", slug: "blanco", swatch: "#ffffff" },
  { en: "Purple", es: "Violeta", slug: "violeta", swatch: "#8e44ad" },
  { en: "Red", es: "Rojo", slug: "rojo", swatch: "#c0392b" },
  { en: "Green", es: "Verde", slug: "verde", swatch: "#27ae60" },
  { en: "Blue", es: "Azul", slug: "azul", swatch: "#2980b9" },
];

/**
 * The launch categories of Lucas's store, in their order (FER-010): the
 * bubble guns, in no group, then the Bijouterie group with its four
 * categories, so the header reads "Catálogo", "Burbujeros", "Bijouterie"
 * (Lucas, 2026-11-18, FER-044; the groups FER-043). The order is the
 * categories' positions, which the admin changes. Each with the cover of
 * its page, from the photos in `public/seed/`.
 */
export const SEED_CATEGORIES: SeedCategory[] = [
  {
    cover: {
      alt: {
        en: "Clear bubble gun with bubbles behind it",
        es: "Burbujero transparente con burbujas detrás",
      },
      computer: { file: "bubble-gun-1.jpg", height: 899, width: 1199 },
      phone: null,
    },
    en: "Bubble guns",
    es: "Burbujeros",
    slug: "burbujeros",
  },
  {
    cover: {
      alt: {
        en: "Silver chain with a bright pendant",
        es: "Cadena plateada con dije brillante",
      },
      computer: { file: "necklace-2.jpg", height: 800, width: 1200 },
      phone: { file: "necklace-2-phone.jpg", height: 800, width: 800 },
    },
    en: "Jewelry",
    es: "Bijouterie",
    slug: "bijouterie",
  },
  {
    cover: {
      alt: {
        en: "Silver chain with heart charms",
        es: "Cadena plateada con dijes de corazón",
      },
      computer: { file: "necklace-1.jpg", height: 1026, width: 1200 },
      phone: null,
    },
    en: "Chains",
    es: "Cadenas",
    group: "bijouterie",
    slug: "cadenas",
  },
  {
    cover: {
      alt: { en: "Gold signet ring", es: "Anillo sello dorado" },
      computer: { file: "ring-2.jpg", height: 800, width: 1200 },
      phone: { file: "ring-2-phone.jpg", height: 800, width: 800 },
    },
    en: "Rings",
    es: "Anillos",
    group: "bijouterie",
    slug: "anillos",
  },
  {
    cover: {
      alt: { en: "Crystal wreath earrings", es: "Aros de cristales" },
      computer: { file: "earrings-2.jpg", height: 1200, width: 1200 },
      phone: null,
    },
    en: "Earrings",
    es: "Aros",
    group: "bijouterie",
    slug: "aros",
  },
  {
    cover: {
      alt: { en: "Two gold bangles", es: "Dos esclavas doradas" },
      computer: { file: "bracelet-2.jpg", height: 1200, width: 1200 },
      phone: null,
    },
    en: "Bracelets",
    es: "Pulseras",
    group: "bijouterie",
    slug: "pulseras",
  },
];

/** The cover of the page of all articles, on the store's row (FER-043). */
export const SEED_ALL_ARTICLES_COVER: SeedCover = {
  alt: {
    en: "Gold ring with pink stones",
    es: "Anillo dorado con piedras rosadas",
  },
  computer: { file: "ring-3.jpg", height: 800, width: 1200 },
  phone: { file: "ring-3-phone.jpg", height: 800, width: 800 },
};

/** A cover's columns, as the `category` and `store` tables name them. */
function coverColumns(cover: SeedCover) {
  return {
    computer: {
      height: cover.computer.height,
      url: `/seed/${cover.computer.file}`,
      width: cover.computer.width,
    },
    phone: cover.phone
      ? {
          height: cover.phone.height,
          url: `/seed/${cover.phone.file}`,
          width: cover.phone.width,
        }
      : { height: null, url: null, width: null },
  };
}

/** A category's cover as its row's columns. */
function categoryCover(cover: SeedCover) {
  const { computer, phone } = coverColumns(cover);

  return {
    coverHeight: computer.height,
    coverPhoneHeight: phone.height,
    coverPhoneUrl: phone.url,
    coverPhoneWidth: phone.width,
    coverUrl: computer.url,
    coverWidth: computer.width,
  };
}

/**
 * Lucas's launch categories and sample articles, published, in `storeId`.
 * Run only on a store that has no category yet, so a second seed run, or a
 * store whose owner already set up a catalog, is left alone. Returns how
 * many articles it created.
 */
export async function seedCatalog(
  tx: DatabaseClient,
  storeId: number
): Promise<number> {
  const existing = await tx.query.category.findFirst({
    columns: { id: true },
    where: eq(category.storeId, storeId),
  });

  if (existing) {
    return 0;
  }

  const categoryIds = new Map<string, number>();
  const color = await createAttribute(tx, {
    storeId,
    values: { nameEn: "Color", nameEs: "Color" },
  });
  const colorIds = new Map<string, number>();

  for (const seedColor of SEED_COLORS) {
    const created = await createAttributeValue(tx, {
      attributeId: color.id,
      storeId,
      swatchColor: seedColor.swatch,
      values: { nameEn: seedColor.en, nameEs: seedColor.es },
    });
    colorIds.set(seedColor.slug, created.id);
  }

  for (const [position, seedCategory] of SEED_CATEGORIES.entries()) {
    const [row] = await tx
      .insert(category)
      .values({ position, slug: seedCategory.slug, storeId })
      .returning({ id: category.id });

    if (!row) {
      throw new Error("Inserting a category returned no row");
    }

    categoryIds.set(seedCategory.slug, row.id);
    await tx.insert(categoryTranslation).values([
      { categoryId: row.id, locale: "es", name: seedCategory.es },
      { categoryId: row.id, locale: "en", name: seedCategory.en },
    ]);
  }

  for (const article of SEED_ARTICLES) {
    const created = await createProduct(tx, {
      storeId,
      values: {
        categoryId: categoryIds.get(article.category) ?? null,
        isAvailable: article.isAvailable,
        priceAmount: article.priceAmount,
        translations: (["es", "en"] as const).map((locale) => ({
          description: article.description[locale],
          locale,
          seoDescription: null,
          seoTitle: null,
          title: article.title[locale],
        })),
      },
    });
    for (const [position, file] of article.images.entries()) {
      const photo = SEED_PHOTOS[file];
      const [image] = await tx
        .insert(productImage)
        .values({
          height: photo.height,
          position,
          productId: created.id,
          url: `/seed/${file}`,
          width: photo.width,
        })
        .returning({ id: productImage.id });

      if (!image) {
        throw new Error("Inserting an image returned no row");
      }

      await tx.insert(productImageTranslation).values([
        { altText: photo.alt.es, locale: "es", productImageId: image.id },
        { altText: photo.alt.en, locale: "en", productImageId: image.id },
      ]);
    }

    await publishProduct(tx, { id: created.id, storeId });
    await setProductAttributeValues(tx, {
      productId: created.id,
      storeId,
      valueIds: article.colors.flatMap((slug) => {
        const id = colorIds.get(slug);
        return id === undefined ? [] : [id];
      }),
    });
  }

  return SEED_ARTICLES.length;
}

/**
 * Lucas's catalog pages (FER-043) on a store seeded before or after them:
 * the Bijouterie group, last in the list, when the store has none and has
 * one of its categories; each seeded category not yet in a group put in
 * its own; and the covers and their alt texts that are still empty, the
 * store's for the page of all articles included. Whatever the store already
 * has is left alone, so it is safe to run again. Returns what it changed.
 */
export async function seedCatalogPages(tx: DatabaseClient, storeId: number) {
  // Under the admin's category lock: a group moved while this reads the
  // groups could otherwise take a category into a group inside a group.
  await lockStoreCategories(tx, storeId);
  const changes = { covers: 0, grouped: 0, groups: 0 };
  const rows = async () =>
    await tx
      .select({
        coverUrl: category.coverUrl,
        id: category.id,
        parentId: category.parentId,
        slug: category.slug,
      })
      .from(category)
      .where(eq(category.storeId, storeId));
  const present = new Set((await rows()).map((row) => row.slug));
  const groups = new Set(
    SEED_CATEGORIES.flatMap((entry) => (entry.group ? [entry.group] : []))
  );

  for (const seedGroup of SEED_CATEGORIES.filter((entry) =>
    groups.has(entry.slug)
  )) {
    const holdsOne = SEED_CATEGORIES.some(
      (entry) => entry.group === seedGroup.slug && present.has(entry.slug)
    );

    if (!present.has(seedGroup.slug) && holdsOne) {
      // Last in the list, as Lucas orders them (FER-044): after the bubble
      // guns, the one category in no group.
      const [row] = await tx
        .insert(category)
        .values({
          position: sql`(select coalesce(max(${category.position}), -1) + 1 from ${category} where ${category.storeId} = ${storeId})`,
          slug: seedGroup.slug,
          storeId,
        })
        .returning({ id: category.id });

      if (!row) {
        throw new Error("Inserting a category returned no row");
      }

      await tx.insert(categoryTranslation).values([
        { categoryId: row.id, locale: "es", name: seedGroup.es },
        { categoryId: row.id, locale: "en", name: seedGroup.en },
      ]);
      changes.groups += 1;
    }
  }

  const existing = await rows();
  const idOf = new Map(existing.map((row) => [row.slug, row.id]));
  const isGroup = new Set(existing.map((row) => row.parentId));
  // A group in a group itself would make three levels: such a group takes
  // no category, one level only, as the service holds it.
  const inAGroup = new Set(
    existing.flatMap((row) => (row.parentId === null ? [] : [row.id]))
  );

  for (const seedCategory of SEED_CATEGORIES) {
    const row = existing.find((entry) => entry.slug === seedCategory.slug);
    const groupId = seedCategory.group ? idOf.get(seedCategory.group) : null;

    if (!row) {
      continue;
    }

    if (
      groupId !== undefined &&
      groupId !== null &&
      !inAGroup.has(groupId) &&
      row.parentId === null &&
      !isGroup.has(row.id)
    ) {
      await tx
        .update(category)
        .set({ parentId: groupId })
        .where(and(eq(category.id, row.id), isNull(category.parentId)));
      changes.grouped += 1;
    }

    if (row.coverUrl === null) {
      await tx
        .update(category)
        .set(categoryCover(seedCategory.cover))
        .where(and(eq(category.id, row.id), isNull(category.coverUrl)));

      for (const locale of ["es", "en"] as const) {
        await tx
          .update(categoryTranslation)
          .set({ coverAlt: seedCategory.cover.alt[locale] })
          .where(
            and(
              eq(categoryTranslation.categoryId, row.id),
              eq(categoryTranslation.locale, locale),
              isNull(categoryTranslation.coverAlt)
            )
          );
      }

      changes.covers += 1;
    }
  }

  const { computer, phone } = coverColumns(SEED_ALL_ARTICLES_COVER);
  const covered = await tx
    .update(store)
    .set({
      catalogCoverHeight: computer.height,
      catalogCoverPhoneHeight: phone.height,
      catalogCoverPhoneUrl: phone.url,
      catalogCoverPhoneWidth: phone.width,
      catalogCoverUrl: computer.url,
      catalogCoverWidth: computer.width,
    })
    .where(and(eq(store.id, storeId), isNull(store.catalogCoverUrl)))
    .returning({ id: store.id });

  if (covered.length > 0) {
    for (const locale of ["es", "en"] as const) {
      await tx
        .update(storeTranslation)
        .set({ catalogCoverAlt: SEED_ALL_ARTICLES_COVER.alt[locale] })
        .where(
          and(
            eq(storeTranslation.storeId, storeId),
            eq(storeTranslation.locale, locale),
            isNull(storeTranslation.catalogCoverAlt)
          )
        );
    }

    changes.covers += 1;
  }

  return changes;
}
