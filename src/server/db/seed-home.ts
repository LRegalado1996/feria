import { and, eq, inArray } from "drizzle-orm";

import type {
  CreateSpotlightValues,
  PageSection,
  SaveAnnouncementValues,
} from "@/lib/schemas/page";
import type { DatabaseClient } from "@/server/db";
import {
  announcement,
  banner,
  bannerTranslation,
  category,
  featuredProduct,
  pageCoverBanner,
  pageSection,
  product,
  productTranslation,
  rankingEntry,
  spotlight,
} from "@/server/db/schema";
import {
  createSpotlight,
  findHomePageId,
  lockStorePages,
  saveAnnouncement,
} from "@/server/services/page";

/**
 * The announcement the bar shows on a seeded store (FER-020): the fair's
 * days, with a shorter line for a phone, on and with no end, so a local
 * store always shows it. The admin edits or switches it off.
 */
export const SEED_ANNOUNCEMENT: SaveAnnouncementValues = {
  endsOn: null,
  isActive: true,
  linkUrl: null,
  shortTextEn: "At the fair · Dec 5 to Jan 5",
  shortTextEs: "En la feria · 5/12 al 5/1",
  startsOn: null,
  textEn: "Find us at the fair, from December 5 to January 5",
  textEs: "Encontranos en la feria, del 5/12 al 5/1",
};

/** A photo of `public/seed/` and its size (`docs/brand/seed-photos.md`). */
interface SeedPhoto {
  file: string;
  height: number;
  width: number;
}

interface SeedBanner {
  computer: SeedPhoto;
  cta: { en: string; es: string } | null;
  /** The slug of the category it leads to, or a path of the site. */
  link: { category: string } | { path: string };
  phone: SeedPhoto | null;
  title: { en: string; es: string };
}

/**
 * The cover's banners, in the carousel's order: the bubble guns, the
 * jewelry and the chains, each with its phone crop (the computer photo's
 * centre, `<photo>-phone.jpg`).
 */
export const SEED_COVER_BANNERS: SeedBanner[] = [
  {
    computer: { file: "bubble-gun-2.jpg", height: 1067, width: 1600 },
    cta: null,
    link: { category: "burbujeros" },
    phone: { file: "bubble-gun-2-phone.jpg", height: 1067, width: 854 },
    title: {
      en: "Bubble guns for the whole family",
      es: "Burbujeros para toda la familia",
    },
  },
  {
    computer: { file: "ring-3.jpg", height: 800, width: 1200 },
    cta: { en: "See the jewelry", es: "Ver las joyas" },
    link: { category: "bijouterie" },
    phone: { file: "ring-3-phone.jpg", height: 800, width: 800 },
    title: {
      en: "Jewelry to give this season",
      es: "Joyas para regalar en las fiestas",
    },
  },
  {
    computer: { file: "necklace-4.jpg", height: 1067, width: 1600 },
    cta: null,
    link: { category: "cadenas" },
    phone: { file: "necklace-4-phone.jpg", height: 1067, width: 854 },
    title: { en: "Chains that shine", es: "Cadenas que brillan" },
  },
];

/**
 * The banners between rows, each after the place it is listed with in
 * `SEED_SEQUENCE`: the fair, leading to the catalog, and the earrings.
 */
export const SEED_ROW_BANNERS: SeedBanner[] = [
  {
    computer: { file: "bubbles-1.jpg", height: 1063, width: 1600 },
    cta: { en: "See the catalog", es: "Ver el catálogo" },
    link: { path: "/productos" },
    phone: { file: "bubbles-1-phone.jpg", height: 1063, width: 850 },
    title: { en: "Find us at the fair", es: "Encontranos en la feria" },
  },
  {
    computer: { file: "earrings-4.jpg", height: 1067, width: 1600 },
    cta: null,
    link: { category: "aros" },
    phone: null,
    title: { en: "Earrings for every day", es: "Aros para todos los días" },
  },
];

/**
 * The home's sequence under the cover: the curated rows, the categories by
 * slug and the banners between rows by their index in `SEED_ROW_BANNERS`.
 * A category the store lacks is skipped; one not listed goes last.
 */
const SEED_SEQUENCE: (
  | { banner: number }
  | { category: string }
  | { curated: "best_sellers" | "featured" }
)[] = [
  { curated: "best_sellers" },
  { banner: 0 },
  { category: "burbujeros" },
  { curated: "featured" },
  { category: "cadenas" },
  { category: "anillos" },
  { banner: 1 },
  { category: "aros" },
  { category: "pulseras" },
];

/** The best sellers, by the seeded articles' Spanish titles, in their order. */
export const SEED_BEST_SELLERS = [
  "Burbujero pez",
  "Cadena corazones",
  "Anillo flor rosa",
  "Aros argolla gruesa",
  "Burbujero cristal",
  "Pulsera chapita",
  "Cadena corona",
  "Aros mariposa",
];

/**
 * The article spotlight right under the cover (FER-059): the fish bubble
 * gun, by its Spanish title, with its label and phrase in both languages.
 */
export const SEED_SPOTLIGHT = {
  title: "Burbujero pez",
  words: {
    labelEn: "New",
    labelEs: "Nuevo",
    phraseEn: "Blows bubbles nonstop. The one kids ask for most at the fair.",
    phraseEs:
      "Tira burbujas sin parar. El que más piden los chicos en la feria.",
  },
} satisfies {
  title: string;
  words: Pick<
    CreateSpotlightValues,
    "labelEn" | "labelEs" | "phraseEn" | "phraseEs"
  >;
};

/** The featured articles, the same way. */
export const SEED_FEATURED = [
  "Par de esclavas",
  "Anillo sello",
  "Burbujero rosa",
  "Aros perla",
];

/** A banner's photo columns: the computer's, and the phone's or none. */
function photoColumns(computer: SeedPhoto, phone: SeedPhoto | null) {
  return {
    imageHeight: computer.height,
    imagePhoneHeight: phone?.height ?? null,
    imagePhoneUrl: phone ? `/seed/${phone.file}` : null,
    imagePhoneWidth: phone?.width ?? null,
    imageUrl: `/seed/${computer.file}`,
    imageWidth: computer.width,
  };
}

/** The store's articles with these Spanish titles, in the order given. */
async function articleIds(
  tx: DatabaseClient,
  storeId: number,
  titles: readonly string[]
): Promise<number[]> {
  const rows = await tx
    .select({ id: product.id, title: productTranslation.title })
    .from(product)
    .innerJoin(productTranslation, eq(productTranslation.productId, product.id))
    .where(
      and(
        eq(product.storeId, storeId),
        eq(productTranslation.locale, "es"),
        inArray(productTranslation.title, [...titles])
      )
    );
  const idOf = new Map(rows.map((row) => [row.title, row.id]));

  return titles.flatMap((title) => {
    const id = idOf.get(title);

    return id === undefined ? [] : [id];
  });
}

/** Inserts a banner and its words; answers its id. */
async function insertBanner(
  tx: DatabaseClient,
  {
    categoryIds,
    seed,
    storeId,
  }: {
    categoryIds: ReadonlyMap<string, number>;
    seed: SeedBanner;
    storeId: number;
  }
): Promise<number> {
  const link =
    "category" in seed.link
      ? {
          linkCategoryId: categoryIds.get(seed.link.category) ?? null,
          linkUrl: null,
        }
      : { linkCategoryId: null, linkUrl: seed.link.path };
  const [row] = await tx
    .insert(banner)
    .values({
      ...photoColumns(seed.computer, seed.phone),
      ...link,
      isActive: true,
      storeId,
    })
    .returning({ id: banner.id });

  if (!row) {
    throw new Error("Inserting a banner returned no row");
  }

  await tx.insert(bannerTranslation).values(
    (["es", "en"] as const).map((locale) => ({
      bannerId: row.id,
      ctaLabel: seed.cta?.[locale] ?? null,
      locale,
      title: seed.title[locale],
    }))
  );

  return row.id;
}

/**
 * The home's demo content (FER-020, also FER-031's): the announcement, the
 * cover's three banners and two between rows, the order of the home page's
 * blocks (FER-058), an article spotlight right under the cover (FER-059),
 * the best sellers and the featured articles. Each part only when the store
 * has none of it yet, so a second run, or a home the admin already curated,
 * is left alone. Answers what it added.
 */
export async function seedHome(tx: DatabaseClient, storeId: number) {
  await lockStorePages(tx, storeId);
  const added = {
    announcement: false,
    banners: 0,
    featured: 0,
    ranking: 0,
    spotlight: false,
  };
  const existing = await tx.query.announcement.findFirst({
    columns: { id: true },
    where: eq(announcement.storeId, storeId),
  });

  if (!existing) {
    await saveAnnouncement(tx, { storeId, values: SEED_ANNOUNCEMENT });
    added.announcement = true;
  }

  const anyBanner = await tx.query.banner.findFirst({
    columns: { id: true },
    where: eq(banner.storeId, storeId),
  });

  const pageId = await findHomePageId(tx, { storeId });
  const anySection = await tx.query.pageSection.findFirst({
    columns: { id: true },
    where: eq(pageSection.pageId, pageId),
  });
  const categories =
    anyBanner && anySection
      ? []
      : await tx
          .select({ id: category.id, slug: category.slug })
          .from(category)
          .where(eq(category.storeId, storeId));
  const categoryIds = new Map(categories.map((row) => [row.slug, row.id]));
  // The banners between rows this run added, by their seed's index.
  const rowBannerIds: number[] = [];

  if (!anyBanner) {
    const coverBannerIds: number[] = [];

    for (const seed of SEED_COVER_BANNERS) {
      coverBannerIds.push(
        await insertBanner(tx, { categoryIds, seed, storeId })
      );
    }

    for (const seed of SEED_ROW_BANNERS) {
      rowBannerIds.push(await insertBanner(tx, { categoryIds, seed, storeId }));
    }

    // A store with no banner has no cover to replace.
    await tx.insert(pageCoverBanner).values(
      coverBannerIds.map((bannerId, position) => ({
        bannerId,
        pageId,
        position,
      }))
    );

    added.banners = SEED_COVER_BANNERS.length + SEED_ROW_BANNERS.length;
  }

  // An order the admin saved stays, banners or not: the banners added
  // above then come after it, as any banner new since the last save does.
  if (!anySection) {
    const listed = SEED_SEQUENCE.flatMap((entry): PageSection[] => {
      if ("curated" in entry) {
        return [{ kind: entry.curated }];
      }

      const id =
        "banner" in entry
          ? rowBannerIds[entry.banner]
          : categoryIds.get(entry.category);

      if (id === undefined) {
        return [];
      }

      return "banner" in entry
        ? [{ bannerId: id, kind: "banner" }]
        : [{ categoryId: id, kind: "category" }];
    });
    const placed = new Set(
      listed.flatMap((entry) =>
        entry.kind === "category" ? [entry.categoryId] : []
      )
    );
    const sections: PageSection[] = [
      ...listed,
      ...categories
        .filter((row) => !placed.has(row.id))
        .map((row) => ({ categoryId: row.id, kind: "category" as const })),
    ];

    await tx.insert(pageSection).values(
      sections.map((section, position) => ({
        bannerId: section.kind === "banner" ? section.bannerId : null,
        categoryId: section.kind === "category" ? section.categoryId : null,
        kind: section.kind,
        pageId,
        position,
        storeId,
      }))
    );
  }

  const anySpotlight = await tx.query.spotlight.findFirst({
    columns: { id: true },
    where: eq(spotlight.storeId, storeId),
  });

  if (!anySpotlight) {
    const [productId] = await articleIds(tx, storeId, [SEED_SPOTLIGHT.title]);

    // Through the service, as the admin adds one: first on the home page,
    // right under the cover, or after an order the admin saved (the index
    // is clamped to its end), which stays as it was.
    if (productId !== undefined) {
      await createSpotlight(tx, {
        storeId,
        values: {
          ...SEED_SPOTLIGHT.words,
          pageId,
          productId,
          rowsIndex: anySection ? Number.MAX_SAFE_INTEGER : 0,
        },
      });
      added.spotlight = true;
    }
  }

  const anyRanked = await tx.query.rankingEntry.findFirst({
    columns: { id: true },
    where: eq(rankingEntry.storeId, storeId),
  });

  if (!anyRanked) {
    const ids = await articleIds(tx, storeId, SEED_BEST_SELLERS);

    if (ids.length > 0) {
      await tx
        .insert(rankingEntry)
        .values(
          ids.map((productId, position) => ({ position, productId, storeId }))
        );
    }

    added.ranking = ids.length;
  }

  const anyFeatured = await tx.query.featuredProduct.findFirst({
    columns: { id: true },
    where: eq(featuredProduct.storeId, storeId),
  });

  if (!anyFeatured) {
    const ids = await articleIds(tx, storeId, SEED_FEATURED);

    // None or two to four: one alone is not a featured row.
    if (ids.length >= 2) {
      await tx
        .insert(featuredProduct)
        .values(
          ids.map((productId, position) => ({ position, productId, storeId }))
        );
      added.featured = ids.length;
    }
  }

  return added;
}
