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

interface SeedImage {
  /** A photo in `public/seed/`. */
  file: string;
  height: number;
  width: number;
}

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

interface SeedArticle {
  /** The category's slug. */
  category: string;
  /** The slugs of the colors it carries (FER-033). */
  colors: string[];
  description: { en: string; es: string };
  image: {
    alt: { en: string; es: string };
    file: string;
    height: number;
    width: number;
  };
  isAvailable: boolean;
  /** In minor units of the store's currency (pesos for Lucas's store). */
  priceAmount: number;
  title: { en: string; es: string };
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
 * Bijouterie group first, with its four categories, then the bubble guns,
 * which are in no group (Lucas, 2026-11-17, FER-043). Each with the cover
 * of its page, from the photos in `public/seed/`, until uploads exist
 * (FER-011).
 */
export const SEED_CATEGORIES: SeedCategory[] = [
  {
    cover: {
      alt: {
        en: "Silver chain with a bright pendant",
        es: "Cadena de plata con dije brillante",
      },
      computer: { file: "necklace-2.jpg", height: 800, width: 1200 },
      phone: { file: "necklace-3.jpg", height: 1200, width: 801 },
    },
    en: "Jewelry",
    es: "Bijouterie",
    slug: "bijouterie",
  },
  {
    cover: {
      alt: {
        en: "Silver chain with heart charms",
        es: "Cadena de plata con dijes de corazón",
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
      phone: { file: "ring-1.jpg", height: 1200, width: 1200 },
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
      phone: { file: "bracelet-1.jpg", height: 1200, width: 800 },
    },
    en: "Bracelets",
    es: "Pulseras",
    group: "bijouterie",
    slug: "pulseras",
  },
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
];

/** The cover of the page of all articles, on the store's row (FER-043). */
export const SEED_ALL_ARTICLES_COVER: SeedCover = {
  alt: {
    en: "Gold ring with pink stones",
    es: "Anillo dorado con piedras rosadas",
  },
  computer: { file: "ring-3.jpg", height: 800, width: 1200 },
  phone: { file: "earrings-1.jpg", height: 1200, width: 1200 },
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
 * Sample articles with the photos in `public/seed/` (credits in
 * `docs/brand/seed-photos.md`), one of them unavailable so that state has a
 * row to show. Prices are invented.
 */
export const SEED_ARTICLES: SeedArticle[] = [
  {
    colors: ["azul"],
    category: "burbujeros",
    description: {
      en: "Shoots a stream of bubbles at the press of a trigger. Runs on batteries; bubble liquid included.",
      es: "Lanza una lluvia de burbujas con solo apretar el gatillo. Funciona a pilas; incluye líquido.",
    },
    image: {
      alt: {
        en: "Clear bubble gun with bubbles behind it",
        es: "Burbujero transparente con burbujas detrás",
      },
      file: "bubble-gun-1.jpg",
      height: 899,
      width: 1199,
    },
    isAvailable: true,
    priceAmount: 69_000,
    title: { en: "Crystal bubble gun", es: "Burbujero cristal" },
  },
  {
    colors: ["plateado"],
    category: "cadenas",
    description: {
      en: "Fine silver chain with small heart charms. Adjustable length.",
      es: "Cadena fina de plata con pequeños dijes de corazón. Largo regulable.",
    },
    image: {
      alt: {
        en: "Silver chain with heart charms",
        es: "Cadena de plata con dijes de corazón",
      },
      file: "necklace-1.jpg",
      height: 1026,
      width: 1200,
    },
    isAvailable: true,
    priceAmount: 89_000,
    title: { en: "Hearts chain", es: "Cadena corazones" },
  },
  {
    colors: ["plateado"],
    category: "cadenas",
    description: {
      en: "Silver box chain with a bright pendant. Comes in a gift box.",
      es: "Cadena de plata tipo veneciana con dije brillante. Viene en caja de regalo.",
    },
    image: {
      alt: {
        en: "Silver chain with a bright pendant",
        es: "Cadena de plata con dije brillante",
      },
      file: "necklace-2.jpg",
      height: 800,
      width: 1200,
    },
    isAvailable: true,
    priceAmount: 119_000,
    title: { en: "Shine pendant", es: "Dije brillo" },
  },
  {
    colors: ["dorado"],
    category: "cadenas",
    description: {
      en: "Gold-plated rope chain with a crown pendant.",
      es: "Cadena tipo soga con baño de oro y dije de corona.",
    },
    image: {
      alt: {
        en: "Gold rope chain with a crown pendant",
        es: "Cadena dorada tipo soga con dije de corona",
      },
      file: "necklace-3.jpg",
      height: 1200,
      width: 801,
    },
    isAvailable: false,
    priceAmount: 149_000,
    title: { en: "Crown chain", es: "Cadena corona" },
  },
  {
    colors: ["dorado"],
    category: "anillos",
    description: {
      en: "Gold-plated ring with an emerald-cut stone.",
      es: "Anillo con baño de oro y piedra de talle esmeralda.",
    },
    image: {
      alt: {
        en: "Gold ring with a clear stone",
        es: "Anillo dorado con piedra transparente",
      },
      file: "ring-1.jpg",
      height: 1200,
      width: 1200,
    },
    isAvailable: true,
    priceAmount: 99_000,
    title: { en: "Solitaire ring", es: "Anillo solitario" },
  },
  {
    colors: ["dorado"],
    category: "anillos",
    description: {
      en: "Gold-plated signet ring with a medallion.",
      es: "Anillo sello con baño de oro y medallón.",
    },
    image: {
      alt: { en: "Gold signet ring", es: "Anillo sello dorado" },
      file: "ring-2.jpg",
      height: 800,
      width: 1200,
    },
    isAvailable: true,
    priceAmount: 79_000,
    title: { en: "Signet ring", es: "Anillo sello" },
  },
  {
    colors: ["dorado", "oro-rosa"],
    category: "anillos",
    description: {
      en: "Gold-plated cluster ring with pink stones.",
      es: "Anillo con baño de oro y piedras rosadas.",
    },
    image: {
      alt: {
        en: "Gold ring with pink stones",
        es: "Anillo dorado con piedras rosadas",
      },
      file: "ring-3.jpg",
      height: 800,
      width: 1200,
    },
    isAvailable: true,
    priceAmount: 109_050,
    title: { en: "Pink flower ring", es: "Anillo flor rosa" },
  },
  {
    colors: ["dorado"],
    category: "aros",
    description: {
      en: "Small gold-plated studs, for every day.",
      es: "Aros pequeños con baño de oro, para todos los días.",
    },
    image: {
      alt: { en: "Gold stud earrings", es: "Aros dorados pequeños" },
      file: "earrings-1.jpg",
      height: 1200,
      width: 1200,
    },
    isAvailable: true,
    priceAmount: 49_000,
    title: { en: "Gold studs", es: "Aros abotonados" },
  },
  {
    colors: ["plateado", "blanco"],
    category: "aros",
    description: {
      en: "Crystal wreath earrings for a night out.",
      es: "Aros de cristales en forma de corona, para salir.",
    },
    image: {
      alt: { en: "Crystal wreath earrings", es: "Aros de cristales" },
      file: "earrings-2.jpg",
      height: 1200,
      width: 1200,
    },
    isAvailable: true,
    priceAmount: 89_000,
    title: { en: "Crystal wreath earrings", es: "Aros corona de cristal" },
  },
  {
    colors: ["dorado"],
    category: "pulseras",
    description: {
      en: "Fine gold-plated bracelet with an ID tag to engrave.",
      es: "Pulsera fina con baño de oro y chapita para grabar.",
    },
    image: {
      alt: {
        en: "Fine gold bracelet with an ID tag",
        es: "Pulsera dorada fina con chapita",
      },
      file: "bracelet-1.jpg",
      height: 1200,
      width: 800,
    },
    isAvailable: true,
    priceAmount: 69_000,
    title: { en: "ID bracelet", es: "Pulsera chapita" },
  },
  {
    colors: ["dorado"],
    category: "pulseras",
    description: {
      en: "A pair of gold-plated bangles.",
      es: "Par de esclavas con baño de oro.",
    },
    image: {
      alt: { en: "Two gold bangles", es: "Dos esclavas doradas" },
      file: "bracelet-2.jpg",
      height: 1200,
      width: 1200,
    },
    isAvailable: true,
    priceAmount: 129_000,
    title: { en: "Bangle pair", es: "Par de esclavas" },
  },
];

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
    const [image] = await tx
      .insert(productImage)
      .values({
        height: article.image.height,
        position: 0,
        productId: created.id,
        url: `/seed/${article.image.file}`,
        width: article.image.width,
      })
      .returning({ id: productImage.id });

    if (!image) {
      throw new Error("Inserting an image returned no row");
    }

    await tx.insert(productImageTranslation).values([
      { altText: article.image.alt.es, locale: "es", productImageId: image.id },
      { altText: article.image.alt.en, locale: "en", productImageId: image.id },
    ]);
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
 * the Bijouterie group, first in the list, when the store has none and has
 * one of its categories; each seeded category not yet in a group put in
 * its own; and the covers and their alt texts that are still empty, the
 * store's for the page of all articles included. Whatever the store already
 * has is left alone, so it is safe to run again. Returns what it changed.
 */
export async function seedCatalogPages(tx: DatabaseClient, storeId: number) {
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
      // First in the list: every other category moves one place down.
      await tx
        .update(category)
        .set({ position: sql`${category.position} + 1` })
        .where(eq(category.storeId, storeId));
      const [row] = await tx
        .insert(category)
        .values({ position: 0, slug: seedGroup.slug, storeId })
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

  for (const seedCategory of SEED_CATEGORIES) {
    const row = existing.find((entry) => entry.slug === seedCategory.slug);
    const groupId = seedCategory.group ? idOf.get(seedCategory.group) : null;

    if (!row) {
      continue;
    }

    if (
      groupId !== undefined &&
      groupId !== null &&
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
