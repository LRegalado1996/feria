import { ORPCError } from "@orpc/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { isOwnBlobUrl } from "@/lib/blob/paths";
import { imageOf } from "@/lib/catalog/cover";
import { articlePath, categoryPath } from "@/lib/catalog/paths";
import {
  composeHomeSections,
  HOME_CATEGORY_ROW_MAX,
  type HomeAnnouncement,
  type HomeBanner,
  type HomeContent,
} from "@/lib/home/content";
import {
  DEFAULT_ROWS_INDEX,
  placeHomeSection,
  resolveHomeSections,
} from "@/lib/home/layout";
import { isShowing } from "@/lib/home/schedule";
import type { Locale } from "@/lib/i18n/config";
import { pickTranslation } from "@/lib/i18n/pick-translation";
import type {
  BannerLink,
  CreateBannerValues,
  HomeSection,
  SaveAnnouncementValues,
  SaveHomeLayoutValues,
  UpdateBannerValues,
} from "@/lib/schemas/home";
import type { UploadedImage } from "@/lib/schemas/upload";
import type { Currency } from "@/lib/utils/format";
import type { DatabaseClient } from "@/server/db";
import {
  announcement,
  announcementTranslation,
  banner,
  bannerTranslation,
  category,
  featuredProduct,
  homeSection,
  product,
  productImage,
  rankingEntry,
  store,
} from "@/server/db/schema";
import {
  listCategories,
  loadCards,
  type ProductCard,
} from "@/server/services/catalog";
import type { BlobStore } from "@/server/services/upload";

/** The store a home read or write is about, already resolved and trusted. */
interface StoreScope {
  storeId: number;
}

/** A read of the home on a business day (`YYYY-MM-DD`, `businessDay`). */
interface OnDay {
  today: string;
}

// A snapshot: every read of one answer sees the same commit.
const SNAPSHOT = {
  accessMode: "read only",
  isolationLevel: "repeatable read",
} as const;

function bannerNotFound() {
  return new ORPCError("NOT_FOUND", { message: "Banner not found" });
}

/**
 * Every write to a store's home takes this lock first, held to the end of
 * its transaction, so the sequence, the cover's order and the curated rows
 * are decided by one writer at a time: two saves never interleave their
 * delete and insert, and a banner placed between rows always lands in the
 * sequence the other writer left.
 */
export async function lockStoreHome(tx: DatabaseClient, storeId: number) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`home:${storeId}`}))`
  );
}

// ── Reads ────────────────────────────────────────────────────────────────

/** A saved place of the sequence as the schemas name it. */
function toSection(row: {
  bannerId: number | null;
  categoryId: number | null;
  kind: HomeSection["kind"];
}): HomeSection[] {
  // The table's check keeps each target beside its kind; a row it has not
  // seen (a mock) is skipped rather than read as a broken place.
  if (row.kind === "category") {
    return row.categoryId === null
      ? []
      : [{ categoryId: row.categoryId, kind: "category" }];
  }

  if (row.kind === "banner") {
    return row.bannerId === null
      ? []
      : [{ bannerId: row.bannerId, kind: "banner" }];
  }

  return [{ kind: row.kind }];
}

/** The sequence as it was last saved, in its order. */
async function readSavedSections(
  db: DatabaseClient,
  storeId: number
): Promise<HomeSection[]> {
  const rows = await db.query.homeSection.findMany({
    columns: { bannerId: true, categoryId: true, kind: true },
    orderBy: [asc(homeSection.position)],
    where: eq(homeSection.storeId, storeId),
  });

  return rows.flatMap(toSection);
}

/** The ids of a curated row, in their order. */
async function readCurated(
  db: DatabaseClient,
  storeId: number
): Promise<{ featured: number[]; ranking: number[] }> {
  const ranking = await db.query.rankingEntry.findMany({
    columns: { productId: true },
    orderBy: [asc(rankingEntry.position)],
    where: eq(rankingEntry.storeId, storeId),
  });
  const featured = await db.query.featuredProduct.findMany({
    columns: { productId: true },
    orderBy: [asc(featuredProduct.position)],
    where: eq(featuredProduct.storeId, storeId),
  });

  return {
    featured: featured.map((row) => row.productId),
    ranking: ranking.map((row) => row.productId),
  };
}

/**
 * The store's banners with their words and what their link points at: the
 * cover's in the carousel's order, then those between rows.
 */
async function readBanners(db: DatabaseClient, storeId: number) {
  return await db.query.banner.findMany({
    columns: {
      coverPosition: true,
      endsOn: true,
      id: true,
      imageHeight: true,
      imagePhoneHeight: true,
      imagePhoneUrl: true,
      imagePhoneWidth: true,
      imageUrl: true,
      imageWidth: true,
      isActive: true,
      linkCategoryId: true,
      linkProductId: true,
      linkUrl: true,
      placement: true,
      startsOn: true,
    },
    orderBy: [asc(banner.coverPosition), asc(banner.id)],
    where: eq(banner.storeId, storeId),
    with: {
      linkCategory: {
        columns: { slug: true },
        with: { parent: { columns: { slug: true } } },
      },
      linkProduct: { columns: { slug: true, status: true } },
      translations: { columns: { ctaLabel: true, locale: true, title: true } },
    },
  });
}

type BannerRow = Awaited<ReturnType<typeof readBanners>>[number];

/**
 * Where a banner leads on the storefront: its article's page while the
 * article is published (a draft's page is a 404), its category's page, or
 * its address; `null` for none.
 */
function bannerHref(row: BannerRow): string | null {
  if (row.linkProduct) {
    return row.linkProduct.status === "published"
      ? articlePath(row.linkProduct.slug)
      : null;
  }

  if (row.linkCategory) {
    return categoryPath({
      parentSlug: row.linkCategory.parent?.slug ?? null,
      slug: row.linkCategory.slug,
    });
  }

  return row.linkUrl;
}

/** A banner as the storefront shows it, in `locale` or the language it has. */
function toHomeBanner(row: BannerRow, locale: Locale): HomeBanner {
  const words = pickTranslation(row.translations, locale);

  return {
    ctaLabel: words?.ctaLabel ?? null,
    href: bannerHref(row),
    id: row.id,
    image: {
      height: row.imageHeight,
      url: row.imageUrl,
      width: row.imageWidth,
    },
    lang: words?.locale ?? locale,
    phoneImage: imageOf(
      row.imagePhoneUrl,
      row.imagePhoneWidth,
      row.imagePhoneHeight
    ),
    title: words?.title ?? "",
  };
}

/**
 * The announcement the storefront's bar shows on `today` in `locale` (or
 * the language it has), or `null`: none written, its switch off, or
 * outside its days.
 */
export async function findShowingAnnouncement(
  db: DatabaseClient,
  { locale, storeId, today }: StoreScope & OnDay & { locale: Locale }
): Promise<HomeAnnouncement | null> {
  const found = await db.query.announcement.findFirst({
    columns: { endsOn: true, isActive: true, linkUrl: true, startsOn: true },
    where: eq(announcement.storeId, storeId),
    with: {
      translations: { columns: { locale: true, shortText: true, text: true } },
    },
  });

  if (!found || !isShowing(found, today)) {
    return null;
  }

  const words = pickTranslation(found.translations, locale);

  return words
    ? {
        href: found.linkUrl,
        lang: words.locale,
        shortText: words.shortText,
        text: words.text,
      }
    : null;
}

/**
 * Up to `HOME_CATEGORY_ROW_MAX` published articles of each category, in
 * the store's own order (the catalog's default, FER-044).
 */
async function readCategoryRows(db: DatabaseClient, storeId: number) {
  const rows = await db
    .select({ categoryId: product.categoryId, id: product.id })
    .from(product)
    .where(and(eq(product.storeId, storeId), eq(product.status, "published")))
    .orderBy(asc(product.position), asc(product.id));
  const byCategory = new Map<number, number[]>();

  for (const row of rows) {
    // A published article always has its category (the table's check).
    if (row.categoryId !== null) {
      const ids = byCategory.get(row.categoryId) ?? [];

      if (ids.length < HOME_CATEGORY_ROW_MAX) {
        ids.push(row.id);
        byCategory.set(row.categoryId, ids);
      }
    }
  }

  return byCategory;
}

/**
 * What the storefront's home shows on `today` in `locale` (FER-020, the
 * read FER-022's home is built on): see `HomeContent` for what each part
 * holds and what is left out. The articles are the catalog's cards, with
 * the store's currency. One read-only snapshot.
 */
export async function getHomeContent(
  db: DatabaseClient,
  {
    currencyCode,
    locale,
    storeId,
    today,
  }: StoreScope & OnDay & { currencyCode: Currency; locale: Locale }
): Promise<HomeContent<ProductCard>> {
  return await db.transaction(async (tx) => {
    const shownAnnouncement = await findShowingAnnouncement(tx, {
      locale,
      storeId,
      today,
    });
    const banners = (await readBanners(tx, storeId)).filter((row) =>
      isShowing(row, today)
    );
    const rowBanners = new Map(
      banners
        .filter((row) => row.placement === "rows")
        .map((row) => [row.id, toHomeBanner(row, locale)])
    );
    const categories = await listCategories(tx, { locale, storeId });
    const sections = resolveHomeSections(await readSavedSections(tx, storeId), {
      categoryIds: categories.map((entry) => entry.id),
      rowBannerIds: [...rowBanners.keys()],
    });
    const categoryRows = await readCategoryRows(tx, storeId);
    const curated = await readCurated(tx, storeId);
    const ids = new Set([
      ...[...categoryRows.values()].flat(),
      ...curated.ranking,
      ...curated.featured,
    ]);
    // `loadCards` keeps published articles only: a curated draft drops out.
    const cards = new Map(
      (await loadCards(tx, { currencyCode, ids: [...ids], locale })).map(
        (card) => [card.id, card]
      )
    );
    const cardsOf = (list: readonly number[]) =>
      list.flatMap((id) => cards.get(id) ?? []);

    return {
      announcement: shownAnnouncement,
      cover: banners
        .filter((row) => row.placement === "cover")
        .map((row) => toHomeBanner(row, locale)),
      sections: composeHomeSections(sections, {
        // A curated row offers what can be bought: an article sold out
        // drops out until it is available again.
        bestSellers: cardsOf(curated.ranking).filter(
          (card) => card.isAvailable
        ),
        categories: new Map(
          categories.map((entry) => [
            entry.id,
            {
              articles: cardsOf(categoryRows.get(entry.id) ?? []),
              lang: entry.lang,
              name: entry.name,
              path: entry.path,
            },
          ])
        ),
        featured: cardsOf(curated.featured).filter((card) => card.isAvailable),
        rowBanners,
      }),
    };
  }, SNAPSHOT);
}

/** A banner's link as the schemas name it. */
function linkOf(row: BannerRow): BannerLink {
  if (row.linkProductId !== null) {
    return { kind: "product", productId: row.linkProductId };
  }

  if (row.linkCategoryId !== null) {
    return { categoryId: row.linkCategoryId, kind: "category" };
  }

  return row.linkUrl === null
    ? { kind: "none" }
    : { kind: "url", url: row.linkUrl };
}

/** The text of `rows` in `locale`, or `null` when there is none. */
function textIn<Row extends { locale: Locale }>(
  rows: readonly Row[],
  locale: Locale
): Row | null {
  return rows.find((row) => row.locale === locale) ?? null;
}

/**
 * Everything the admin's home screen (FER-020) edits and previews, in one
 * read-only snapshot: the announcement, the banners with their texts in
 * both languages, the sequence under the cover (resolved: a category or a
 * banner with no place yet shows after the rest), the cover's order, the
 * curated rows' article ids, and the store's categories and articles, from
 * which the screen picks, warns about articles that cannot be bought, and
 * draws its preview. `today` is the business day the screen's statuses are
 * read on.
 */
export async function getHomeCuration(
  db: DatabaseClient,
  { storeId, today }: StoreScope & OnDay
) {
  return await db.transaction(async (tx) => {
    const [own] = await tx
      .select({ currencyCode: store.currencyCode })
      .from(store)
      .where(eq(store.id, storeId));

    if (!own) {
      throw new ORPCError("NOT_FOUND", { message: "Store not found" });
    }

    const found = await tx.query.announcement.findFirst({
      columns: { endsOn: true, isActive: true, linkUrl: true, startsOn: true },
      where: eq(announcement.storeId, storeId),
      with: {
        translations: {
          columns: { locale: true, shortText: true, text: true },
        },
      },
    });
    const banners = await readBanners(tx, storeId);
    const categories = await tx.query.category.findMany({
      columns: { id: true, parentId: true, slug: true },
      orderBy: [asc(category.position), asc(category.id)],
      where: eq(category.storeId, storeId),
      with: { translations: { columns: { locale: true, name: true } } },
    });
    const articles = await tx.query.product.findMany({
      columns: {
        categoryId: true,
        id: true,
        isAvailable: true,
        priceAmount: true,
        slug: true,
        status: true,
      },
      orderBy: [asc(product.position), asc(product.id)],
      where: eq(product.storeId, storeId),
      with: {
        images: {
          columns: { height: true, url: true, width: true },
          limit: 1,
          orderBy: [asc(productImage.position), asc(productImage.id)],
        },
        translations: { columns: { locale: true, title: true } },
      },
    });
    const saved = await readSavedSections(tx, storeId);
    const curated = await readCurated(tx, storeId);
    const slugOf = new Map(categories.map((row) => [row.id, row.slug]));
    const cover = banners.filter((row) => row.placement === "cover");

    return {
      announcement: found
        ? {
            endsOn: found.endsOn,
            isActive: found.isActive,
            linkUrl: found.linkUrl,
            shortTextEn: textIn(found.translations, "en")?.shortText ?? null,
            shortTextEs: textIn(found.translations, "es")?.shortText ?? null,
            startsOn: found.startsOn,
            textEn: textIn(found.translations, "en")?.text ?? null,
            textEs: textIn(found.translations, "es")?.text ?? "",
          }
        : null,
      articles: articles.map(({ images, translations, ...row }) => ({
        ...row,
        image: images[0] ?? null,
        titleEn: textIn(translations, "en")?.title ?? null,
        titleEs: textIn(translations, "es")?.title ?? "",
      })),
      banners: banners.map((row) => ({
        ctaLabelEn: textIn(row.translations, "en")?.ctaLabel ?? null,
        ctaLabelEs: textIn(row.translations, "es")?.ctaLabel ?? null,
        endsOn: row.endsOn,
        href: bannerHref(row),
        id: row.id,
        image: {
          height: row.imageHeight,
          url: row.imageUrl,
          width: row.imageWidth,
        },
        imagePhone: imageOf(
          row.imagePhoneUrl,
          row.imagePhoneWidth,
          row.imagePhoneHeight
        ),
        isActive: row.isActive,
        link: linkOf(row),
        placement: row.placement,
        startsOn: row.startsOn,
        titleEn: textIn(row.translations, "en")?.title ?? null,
        titleEs: textIn(row.translations, "es")?.title ?? "",
      })),
      categories: categories.map((row) => ({
        id: row.id,
        nameEn: textIn(row.translations, "en")?.name ?? null,
        nameEs: textIn(row.translations, "es")?.name ?? "",
        path: categoryPath({
          parentSlug:
            row.parentId === null ? null : (slugOf.get(row.parentId) ?? null),
          slug: row.slug,
        }),
      })),
      coverBannerIds: cover.map((row) => row.id),
      currencyCode: own.currencyCode,
      featuredProductIds: curated.featured,
      rankingProductIds: curated.ranking,
      sections: resolveHomeSections(saved, {
        categoryIds: categories.map((row) => row.id),
        rowBannerIds: banners
          .filter((row) => row.placement === "rows")
          .map((row) => row.id),
      }),
      today,
    };
  }, SNAPSHOT);
}

export type HomeCuration = Awaited<ReturnType<typeof getHomeCuration>>;

// ── Writes ───────────────────────────────────────────────────────────────

/**
 * Reads what a write to the home refers to, after the home's own lock: the
 * store's categories, then the articles it names, both `FOR KEY SHARE`
 * (they only have to exist until it commits, and an edit of them does not
 * wait for that), then the store's banners. The banners take no row lock:
 * only a home write changes their place or photos, and the home's lock
 * already keeps those one at a time; deleting an article or a category
 * only clears a banner's link. Each list comes in the order it is used:
 * the categories in the store's, the cover's banners in the carousel's.
 */
async function lockHomeTargets(
  tx: DatabaseClient,
  { productIds, storeId }: StoreScope & { productIds: readonly number[] }
) {
  const categories = await tx
    .select({ id: category.id })
    .from(category)
    .where(eq(category.storeId, storeId))
    .orderBy(asc(category.position), asc(category.id))
    .for("key share");
  const articles =
    productIds.length === 0
      ? []
      : await tx
          .select({ id: product.id })
          .from(product)
          .where(
            and(eq(product.storeId, storeId), inArray(product.id, productIds))
          )
          .orderBy(asc(product.id))
          .for("key share");
  // Postgres puts NULLs last in ascending order: the cover's banners first.
  const banners = await tx
    .select({
      coverPosition: banner.coverPosition,
      id: banner.id,
      imagePhoneUrl: banner.imagePhoneUrl,
      imageUrl: banner.imageUrl,
      placement: banner.placement,
    })
    .from(banner)
    .where(eq(banner.storeId, storeId))
    .orderBy(asc(banner.coverPosition), asc(banner.id));
  const cover = banners.flatMap(({ coverPosition, id }) =>
    coverPosition === null ? [] : [{ coverPosition, id }]
  );

  return {
    banners,
    categoryIds: categories.map((row) => row.id),
    coverBannerIds: cover.map((row) => row.id),
    nextCoverPosition:
      Math.max(-1, ...cover.map((row) => row.coverPosition)) + 1,
    productIds: new Set(articles.map((row) => row.id)),
    rowBannerIds: banners
      .filter((row) => row.placement === "rows")
      .map((row) => row.id),
  };
}

type HomeTargets = Awaited<ReturnType<typeof lockHomeTargets>>;

/** Refuses a link to an article or a category the store does not have. */
function assertLinkTarget(link: BannerLink, targets: HomeTargets) {
  if (link.kind === "product" && !targets.productIds.has(link.productId)) {
    throw new ORPCError("NOT_FOUND", { message: "Article not found" });
  }

  if (
    link.kind === "category" &&
    !targets.categoryIds.includes(link.categoryId)
  ) {
    throw new ORPCError("NOT_FOUND", { message: "Category not found" });
  }
}

/** A link's three columns: at most one set. */
function linkColumns(link: BannerLink) {
  return {
    linkCategoryId: link.kind === "category" ? link.categoryId : null,
    linkProductId: link.kind === "product" ? link.productId : null,
    linkUrl: link.kind === "url" ? link.url : null,
  };
}

/** The articles a link names, to lock with the rest. */
function linkedProductIds(link: BannerLink): number[] {
  return link.kind === "product" ? [link.productId] : [];
}

/**
 * Refuses a photo that is neither the one stored nor this deployment's
 * upload for banners (FER-011's rule): no address from anywhere else is
 * ever saved, and a seeded `/seed/...` photo is only kept, never re-sent.
 */
function assertOwnUpload(
  image: UploadedImage,
  storedUrl: string | null,
  blobStore: BlobStore | null
) {
  const uploaded =
    blobStore !== null &&
    isOwnBlobUrl(image.url, { ...blobStore, purpose: "banner" });

  if (image.url !== storedUrl && !uploaded) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A banner photo must be one uploaded to this store",
    });
  }
}

/** A phone photo's three columns, all `null` for none. */
function phoneColumns(image: UploadedImage | null) {
  return {
    imagePhoneHeight: image?.height ?? null,
    imagePhoneUrl: image?.url ?? null,
    imagePhoneWidth: image?.width ?? null,
  };
}

/**
 * A banner's words: Spanish always, English while it has a title (without
 * one its row goes, and the storefront shows the Spanish).
 */
async function writeBannerTexts(
  tx: DatabaseClient,
  bannerId: number,
  values: Pick<
    CreateBannerValues,
    "ctaLabelEn" | "ctaLabelEs" | "titleEn" | "titleEs"
  >
) {
  const rows = [
    {
      bannerId,
      ctaLabel: values.ctaLabelEs,
      locale: "es" as const,
      title: values.titleEs,
    },
    ...(values.titleEn === null
      ? []
      : [
          {
            bannerId,
            ctaLabel: values.ctaLabelEn,
            locale: "en" as const,
            title: values.titleEn,
          },
        ]),
  ];

  await tx
    .insert(bannerTranslation)
    .values(rows)
    .onConflictDoUpdate({
      set: {
        ctaLabel: sql`excluded."ctaLabel"`,
        title: sql`excluded."title"`,
        updatedAt: sql`excluded."updatedAt"`,
      },
      target: [bannerTranslation.bannerId, bannerTranslation.locale],
    });

  if (values.titleEn === null) {
    await tx
      .delete(bannerTranslation)
      .where(
        and(
          eq(bannerTranslation.bannerId, bannerId),
          eq(bannerTranslation.locale, "en")
        )
      );
  }
}

/** Replaces the store's whole sequence with `sections`, numbered from 0. */
async function writeSections(
  tx: DatabaseClient,
  storeId: number,
  sections: readonly HomeSection[]
) {
  await tx.delete(homeSection).where(eq(homeSection.storeId, storeId));

  if (sections.length > 0) {
    await tx.insert(homeSection).values(
      sections.map((section, position) => ({
        bannerId: section.kind === "banner" ? section.bannerId : null,
        categoryId: section.kind === "category" ? section.categoryId : null,
        kind: section.kind,
        position,
        storeId,
      }))
    );
  }
}

/** Puts `bannerId` between rows at `index` of the current sequence. */
async function placeBannerInRows(
  tx: DatabaseClient,
  {
    bannerId,
    index,
    storeId,
    targets,
  }: StoreScope & { bannerId: number; index: number; targets: HomeTargets }
) {
  const sections = resolveHomeSections(await readSavedSections(tx, storeId), {
    categoryIds: targets.categoryIds,
    rowBannerIds: targets.rowBannerIds,
  });

  await writeSections(
    tx,
    storeId,
    placeHomeSection(sections, { bannerId, kind: "banner" }, index)
  );
}

/**
 * Writes the store's announcement (FER-020): there is one, so a save
 * creates it the first time and replaces it after. The English row goes
 * when no English text is given.
 */
export async function saveAnnouncement(
  tx: DatabaseClient,
  { storeId, values }: StoreScope & { values: SaveAnnouncementValues }
) {
  await lockStoreHome(tx, storeId);
  const columns = {
    endsOn: values.endsOn,
    isActive: values.isActive,
    linkUrl: values.linkUrl,
    startsOn: values.startsOn,
  };
  const [saved] = await tx
    .insert(announcement)
    .values({ ...columns, storeId })
    .onConflictDoUpdate({
      set: { ...columns, updatedAt: sql`excluded."updatedAt"` },
      target: announcement.storeId,
    })
    .returning({ id: announcement.id });

  if (!saved) {
    throw new Error("Saving the announcement returned no row");
  }

  const texts = [
    {
      announcementId: saved.id,
      locale: "es" as const,
      shortText: values.shortTextEs,
      text: values.textEs,
    },
    ...(values.textEn === null
      ? []
      : [
          {
            announcementId: saved.id,
            locale: "en" as const,
            shortText: values.shortTextEn,
            text: values.textEn,
          },
        ]),
  ];

  await tx
    .insert(announcementTranslation)
    .values(texts)
    .onConflictDoUpdate({
      set: {
        shortText: sql`excluded."shortText"`,
        text: sql`excluded."text"`,
        updatedAt: sql`excluded."updatedAt"`,
      },
      target: [
        announcementTranslation.announcementId,
        announcementTranslation.locale,
      ],
    });

  if (values.textEn === null) {
    await tx
      .delete(announcementTranslation)
      .where(
        and(
          eq(announcementTranslation.announcementId, saved.id),
          eq(announcementTranslation.locale, "en")
        )
      );
  }

  return { id: saved.id };
}

/**
 * Adds a banner (FER-020): its photos must be this deployment's uploads for
 * banners, its link the store's own article or category. In the cover it
 * goes last; between rows at `rowsIndex` of the sequence, after the first
 * row when none is given.
 */
export async function createBanner(
  tx: DatabaseClient,
  {
    blobStore,
    storeId,
    values,
  }: StoreScope & { blobStore: BlobStore | null; values: CreateBannerValues }
) {
  assertOwnUpload(values.image, null, blobStore);

  if (values.imagePhone) {
    assertOwnUpload(values.imagePhone, null, blobStore);
  }

  await lockStoreHome(tx, storeId);
  const targets = await lockHomeTargets(tx, {
    productIds: linkedProductIds(values.link),
    storeId,
  });
  assertLinkTarget(values.link, targets);
  const [created] = await tx
    .insert(banner)
    .values({
      ...linkColumns(values.link),
      ...phoneColumns(values.imagePhone),
      coverPosition:
        values.placement === "cover" ? targets.nextCoverPosition : null,
      endsOn: values.endsOn,
      imageHeight: values.image.height,
      imageUrl: values.image.url,
      imageWidth: values.image.width,
      isActive: values.isActive,
      placement: values.placement,
      startsOn: values.startsOn,
      storeId,
    })
    .returning({ id: banner.id });

  if (!created) {
    throw new Error("Inserting a banner returned no row");
  }

  await writeBannerTexts(tx, created.id, values);

  if (values.placement === "rows") {
    await placeBannerInRows(tx, {
      bannerId: created.id,
      index: values.rowsIndex ?? DEFAULT_ROWS_INDEX,
      storeId,
      targets,
    });
  }

  return { id: created.id };
}

/**
 * Edits a banner. A photo left out keeps the stored one; a new one must be
 * this deployment's upload for banners. Moved into the cover it goes last;
 * moved between rows, or given a new `rowsIndex` there, it takes that
 * place (after the first row when none is given); kept where it was, it
 * keeps its place. Answers the addresses the banner no longer shows, for
 * the caller to delete once this commits (FER-011).
 */
export async function updateBanner(
  tx: DatabaseClient,
  {
    blobStore,
    storeId,
    values,
  }: StoreScope & { blobStore: BlobStore | null; values: UpdateBannerValues }
) {
  await lockStoreHome(tx, storeId);
  const targets = await lockHomeTargets(tx, {
    productIds: linkedProductIds(values.link),
    storeId,
  });
  const found = targets.banners.find((row) => row.id === values.id);

  if (!found) {
    throw bannerNotFound();
  }

  if (values.image) {
    assertOwnUpload(values.image, found.imageUrl, blobStore);
  }

  if (values.imagePhone) {
    assertOwnUpload(values.imagePhone, found.imagePhoneUrl, blobStore);
  }

  assertLinkTarget(values.link, targets);
  const imageUrl = values.image?.url ?? found.imageUrl;
  const imagePhoneUrl =
    values.imagePhone === undefined
      ? found.imagePhoneUrl
      : (values.imagePhone?.url ?? null);
  const kept = new Set([imageUrl, imagePhoneUrl]);
  const discardedImageUrls = [
    ...new Set(
      [found.imageUrl, found.imagePhoneUrl].filter(
        (url): url is string => url !== null && !kept.has(url)
      )
    ),
  ];
  const coverPosition =
    values.placement === "cover"
      ? (found.coverPosition ?? targets.nextCoverPosition)
      : null;

  await tx
    .update(banner)
    .set({
      ...linkColumns(values.link),
      ...(values.image
        ? {
            imageHeight: values.image.height,
            imageUrl: values.image.url,
            imageWidth: values.image.width,
          }
        : {}),
      ...(values.imagePhone === undefined
        ? {}
        : phoneColumns(values.imagePhone)),
      coverPosition,
      endsOn: values.endsOn,
      isActive: values.isActive,
      placement: values.placement,
      startsOn: values.startsOn,
    })
    .where(and(eq(banner.id, found.id), eq(banner.storeId, storeId)));
  await writeBannerTexts(tx, found.id, values);

  if (
    values.placement === "rows" &&
    (found.placement !== "rows" || values.rowsIndex !== undefined)
  ) {
    await placeBannerInRows(tx, {
      bannerId: found.id,
      index: values.rowsIndex ?? DEFAULT_ROWS_INDEX,
      storeId,
      targets,
    });
  }

  if (values.placement === "cover" && found.placement === "rows") {
    await tx
      .delete(homeSection)
      .where(
        and(
          eq(homeSection.storeId, storeId),
          eq(homeSection.bannerId, found.id)
        )
      );
  }

  return { discardedImageUrls, id: found.id };
}

/**
 * Deletes a banner, its words and its place with it. Answers its photos'
 * addresses, for the caller to delete those files once this commits.
 */
export async function deleteBanner(
  tx: DatabaseClient,
  { id, storeId }: StoreScope & { id: number }
) {
  await lockStoreHome(tx, storeId);
  const [deleted] = await tx
    .delete(banner)
    .where(and(eq(banner.id, id), eq(banner.storeId, storeId)))
    .returning({
      id: banner.id,
      imagePhoneUrl: banner.imagePhoneUrl,
      imageUrl: banner.imageUrl,
    });

  if (!deleted) {
    throw bannerNotFound();
  }

  return {
    discardedImageUrls: [deleted.imageUrl, deleted.imagePhoneUrl].filter(
      (url): url is string => url !== null
    ),
    id: deleted.id,
  };
}

/** Refuses a banner the store does not have, or one in the other place. */
function assertBannerIn(
  id: number,
  placement: "cover" | "rows",
  targets: HomeTargets
) {
  const found = targets.banners.find((row) => row.id === id);

  if (!found) {
    throw bannerNotFound();
  }

  if (found.placement !== placement) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        placement === "cover"
          ? "That banner is between rows, not in the cover"
          : "That banner is in the cover, not between rows",
    });
  }
}

/**
 * Saves the home's order (FER-020) whole: the sequence under the cover, the
 * cover's order, the best sellers and the featured articles. Every id must
 * be the store's: a category, an article or a banner it does not have is
 * NOT_FOUND, and a banner listed in the place it is not in is refused. A
 * category or a banner left out (one added in another tab) keeps a place
 * after the rest, and a cover banner left out goes after the others, so a
 * save never hides what the person did not see. An article may be curated
 * whatever its state: the storefront leaves out what cannot be bought.
 */
export async function saveHomeLayout(
  tx: DatabaseClient,
  { storeId, values }: StoreScope & { values: SaveHomeLayoutValues }
) {
  await lockStoreHome(tx, storeId);
  const productIds = [
    ...new Set([...values.rankingProductIds, ...values.featuredProductIds]),
  ];
  const targets = await lockHomeTargets(tx, { productIds, storeId });

  if (productIds.some((id) => !targets.productIds.has(id))) {
    throw new ORPCError("NOT_FOUND", { message: "Article not found" });
  }

  for (const section of values.sections) {
    if (
      section.kind === "category" &&
      !targets.categoryIds.includes(section.categoryId)
    ) {
      throw new ORPCError("NOT_FOUND", { message: "Category not found" });
    }

    if (section.kind === "banner") {
      assertBannerIn(section.bannerId, "rows", targets);
    }
  }

  for (const id of values.coverBannerIds) {
    assertBannerIn(id, "cover", targets);
  }

  const sections = resolveHomeSections(values.sections, targets);
  const listed = new Set(values.coverBannerIds);
  const coverBannerIds = [
    ...values.coverBannerIds,
    ...targets.coverBannerIds.filter((id) => !listed.has(id)),
  ];

  await writeSections(tx, storeId, sections);

  if (coverBannerIds.length > 0) {
    const positions = sql.join(
      coverBannerIds.map((id, index) => sql`when ${id} then ${index}::int`),
      sql` `
    );

    await tx
      .update(banner)
      .set({ coverPosition: sql`case ${banner.id} ${positions} end` })
      .where(
        and(eq(banner.storeId, storeId), inArray(banner.id, coverBannerIds))
      );
  }

  await tx.delete(rankingEntry).where(eq(rankingEntry.storeId, storeId));

  if (values.rankingProductIds.length > 0) {
    await tx.insert(rankingEntry).values(
      values.rankingProductIds.map((productId, position) => ({
        position,
        productId,
        storeId,
      }))
    );
  }

  await tx.delete(featuredProduct).where(eq(featuredProduct.storeId, storeId));

  if (values.featuredProductIds.length > 0) {
    await tx.insert(featuredProduct).values(
      values.featuredProductIds.map((productId, position) => ({
        position,
        productId,
        storeId,
      }))
    );
  }

  return {
    coverBannerIds,
    featuredProductIds: values.featuredProductIds,
    rankingProductIds: values.rankingProductIds,
    sections,
  };
}
