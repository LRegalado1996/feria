import { ORPCError } from "@orpc/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { isOwnBlobUrl } from "@/lib/blob/paths";
import { imageOf } from "@/lib/catalog/cover";
import { categoriesWithArticles } from "@/lib/catalog/navigation";
import { articlePath, categoryPath } from "@/lib/catalog/paths";
import type { Locale } from "@/lib/i18n/config";
import { pickTranslation } from "@/lib/i18n/pick-translation";
import {
  composePageSections,
  PAGE_CATEGORY_ROW_MAX,
  type PageBanner,
  type PageContent,
  type PageSpotlight,
  type PageWords,
  type ShownAnnouncement,
} from "@/lib/page/content";
import {
  DEFAULT_ROWS_INDEX,
  DEFAULT_SPOTLIGHT_INDEX,
  placePageSection,
  resolvePageSections,
} from "@/lib/page/layout";
import { isShowing } from "@/lib/page/schedule";
import {
  type BannerLink,
  type BannerPlacement,
  COVER_BANNERS_MAX,
  type CreateBannerValues,
  type CreateSpotlightValues,
  type PageSection,
  type SaveAnnouncementValues,
  type SavePageLayoutValues,
  type UpdateBannerValues,
  type UpdateSpotlightValues,
} from "@/lib/schemas/page";
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
  page,
  pageCoverBanner,
  pageSection,
  product,
  productImage,
  rankingEntry,
  spotlight,
  spotlightTranslation,
  store,
} from "@/server/db/schema";
import {
  listCategories,
  loadCards,
  type ProductCard,
  storeOrderRank,
} from "@/server/services/catalog";
import type { BlobStore } from "@/server/services/upload";

/** The store a read or write is about, already resolved and trusted. */
interface StoreScope {
  storeId: number;
}

/** The page of the store a read or write is about (FER-058). */
interface PageScope {
  pageId: number;
}

/** A read of a page on a business day (`YYYY-MM-DD`, `businessDay`). */
interface OnDay {
  today: string;
}

// A snapshot: every read of one answer sees the same commit. Only on the
// top-level client: inside a caller's transaction Drizzle opens a savepoint,
// which ignores these options, so `getPageContent` and `getPageCuration`
// take `db` itself (the pages' cache and `page.get` both do).
const SNAPSHOT = {
  accessMode: "read only",
  isolationLevel: "repeatable read",
} as const;

function bannerNotFound() {
  return new ORPCError("NOT_FOUND", { message: "Banner not found" });
}

/**
 * Every write to a store's pages or to what they show (FER-020, FER-058)
 * takes this lock first, held to the end of its transaction, so a page's
 * sequence, its cover and the curated lists are decided by one writer at a
 * time: two saves never interleave their delete and insert, and a banner
 * placed between rows always lands in the sequence the other writer left.
 * One lock for the store's pages, not one per page: a banner or a curated
 * list is shared by every page that shows it.
 */
export async function lockStorePages(tx: DatabaseClient, storeId: number) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`pages:${storeId}`}))`
  );
}

// ── Reads ────────────────────────────────────────────────────────────────

/**
 * The page the store shows at `/` (FER-058): the store's `homePageId`,
 * which the database keeps set to one of its own pages. NOT_FOUND only on
 * a database whose migrations have not run.
 */
export async function findHomePageId(
  db: DatabaseClient,
  { storeId }: StoreScope
): Promise<number> {
  const [found] = await db
    .select({ homePageId: store.homePageId })
    .from(store)
    .where(eq(store.id, storeId));

  if (!found) {
    throw new ORPCError("NOT_FOUND", { message: "Store not found" });
  }

  return found.homePageId;
}

/** Whether the store has the page `pageId`. */
async function hasPage(
  db: DatabaseClient,
  { pageId, storeId }: StoreScope & PageScope
): Promise<boolean> {
  const found = await db.query.page.findFirst({
    columns: { id: true },
    where: and(eq(page.storeId, storeId), eq(page.id, pageId)),
  });

  return found !== undefined;
}

/** Whether `pageId` is the page the store shows at `/`. */
async function isHomePage(
  db: DatabaseClient,
  { pageId, storeId }: StoreScope & PageScope
): Promise<boolean> {
  const [own] = await db
    .select({ homePageId: store.homePageId })
    .from(store)
    .where(eq(store.id, storeId));

  return own?.homePageId === pageId;
}

/**
 * Holds the page a write is about `FOR KEY SHARE`: it only has to exist
 * until the write commits. NOT_FOUND when the store has no such page.
 */
async function lockPage(
  tx: DatabaseClient,
  { pageId, storeId }: StoreScope & PageScope
) {
  const [found] = await tx
    .select({ id: page.id })
    .from(page)
    .where(and(eq(page.storeId, storeId), eq(page.id, pageId)))
    .for("key share");

  if (!found) {
    throw new ORPCError("NOT_FOUND", { message: "Page not found" });
  }
}

/** A saved place of the sequence as the schemas name it. */
function toSection(row: {
  bannerId: number | null;
  categoryId: number | null;
  kind: PageSection["kind"];
  spotlightId: number | null;
}): PageSection[] {
  // The table's checks keep each target beside its kind; a row they have
  // not seen (a mock) is skipped rather than read as a broken place.
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

  if (row.kind === "spotlight") {
    return row.spotlightId === null
      ? []
      : [{ kind: "spotlight", spotlightId: row.spotlightId }];
  }

  return [{ kind: row.kind }];
}

/** A page's sequence as it was last saved, in its order. */
async function readSavedSections(
  db: DatabaseClient,
  pageId: number
): Promise<PageSection[]> {
  const rows = await db.query.pageSection.findMany({
    columns: {
      bannerId: true,
      categoryId: true,
      kind: true,
      spotlightId: true,
    },
    orderBy: [asc(pageSection.position)],
    where: eq(pageSection.pageId, pageId),
  });

  return rows.flatMap(toSection);
}

/** The banners of a page's sequence, in its order. */
function sectionBannerIds(sections: readonly PageSection[]): number[] {
  return sections.flatMap((section) =>
    section.kind === "banner" ? [section.bannerId] : []
  );
}

/** The article spotlights of a page's sequence, in its order. */
function sectionSpotlightIds(sections: readonly PageSection[]): number[] {
  return sections.flatMap((section) =>
    section.kind === "spotlight" ? [section.spotlightId] : []
  );
}

/**
 * The store's article spotlights (FER-059), in the order they were made,
 * with the article each features and their words. Given `ids` (the ones a
 * page places), only those: none when it places none.
 */
async function readSpotlights(
  db: DatabaseClient,
  storeId: number,
  ids?: readonly number[]
) {
  if (ids?.length === 0) {
    return [];
  }

  return await db.query.spotlight.findMany({
    columns: { id: true, productId: true },
    orderBy: [asc(spotlight.id)],
    where: ids
      ? and(eq(spotlight.storeId, storeId), inArray(spotlight.id, [...ids]))
      : eq(spotlight.storeId, storeId),
    with: {
      translations: { columns: { label: true, locale: true, phrase: true } },
    },
  });
}

type SpotlightRow = Awaited<ReturnType<typeof readSpotlights>>[number];

/**
 * One of a block's words in `locale`, else in the language that has it,
 * with the language it is in: a label and a phrase fall back each on its
 * own, so an English label beside a Spanish phrase both show.
 */
function wordsIn(
  rows: readonly ({ locale: Locale } & Record<
    "label" | "phrase",
    string | null
  >)[],
  field: "label" | "phrase",
  locale: Locale
): PageWords | null {
  const withWord = rows.filter((row) => row[field] !== null);
  const found =
    withWord.find((row) => row.locale === locale) ?? withWord[0] ?? null;
  const text = found?.[field] ?? null;

  return found && text !== null ? { lang: found.locale, text } : null;
}

/** A spotlight as a page shows it, around its article's card. */
function toPageSpotlight<Article>(
  row: SpotlightRow,
  article: Article,
  locale: Locale
): PageSpotlight<Article> {
  return {
    article,
    id: row.id,
    label: wordsIn(row.translations, "label", locale),
    phrase: wordsIn(row.translations, "phrase", locale),
  };
}

/** A page's cover: its banners in the carousel's order, with their places. */
async function readCover(db: DatabaseClient, pageId: number) {
  return await db.query.pageCoverBanner.findMany({
    columns: { bannerId: true, position: true },
    orderBy: [asc(pageCoverBanner.position)],
    where: eq(pageCoverBanner.pageId, pageId),
  });
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
 * The store's banners, in the order they were made, with their words and
 * what their link points at. Where each shows is a page's to say.
 */
async function readBanners(db: DatabaseClient, storeId: number) {
  return await db.query.banner.findMany({
    columns: {
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
      startsOn: true,
    },
    orderBy: [asc(banner.id)],
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
 * article is published (a draft's page is a 404), its category's page
 * while the storefront lists the category (`shownCategoryIds`: one with no
 * published article is linked from nowhere, FER-079), or its address;
 * `null` for none.
 */
function bannerHref(
  row: BannerRow,
  shownCategoryIds: ReadonlySet<number>
): string | null {
  if (row.linkProduct) {
    return row.linkProduct.status === "published"
      ? articlePath(row.linkProduct.slug)
      : null;
  }

  if (row.linkCategory) {
    return row.linkCategoryId !== null &&
      shownCategoryIds.has(row.linkCategoryId)
      ? categoryPath({
          parentSlug: row.linkCategory.parent?.slug ?? null,
          slug: row.linkCategory.slug,
        })
      : null;
  }

  return row.linkUrl;
}

/** A banner as the storefront shows it, in `locale` or the language it has. */
function toPageBanner(
  row: BannerRow,
  locale: Locale,
  shownCategoryIds: ReadonlySet<number>
): PageBanner {
  const words = pickTranslation(row.translations, locale);

  return {
    ctaLabel: words?.ctaLabel ?? null,
    href: bannerHref(row, shownCategoryIds),
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
): Promise<ShownAnnouncement | null> {
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
 * Up to `PAGE_CATEGORY_ROW_MAX` published articles of each category, in
 * the store's own order on `today` (the catalog's default: the featured
 * first, then the day's shuffle, `storeOrderRank`, FER-019).
 */
async function readCategoryRows(
  db: DatabaseClient,
  storeId: number,
  today: string
) {
  const rows = await db
    .select({ categoryId: product.categoryId, id: product.id })
    .from(product)
    .where(and(eq(product.storeId, storeId), eq(product.status, "published")))
    .orderBy(asc(storeOrderRank(today)), asc(product.id));
  const byCategory = new Map<number, number[]>();

  for (const row of rows) {
    // A published article always has its category (the table's check).
    if (row.categoryId !== null) {
      const ids = byCategory.get(row.categoryId) ?? [];

      if (ids.length < PAGE_CATEGORY_ROW_MAX) {
        ids.push(row.id);
        byCategory.set(row.categoryId, ids);
      }
    }
  }

  return byCategory;
}

/**
 * What a store's page shows on `today` in `locale` (FER-058, after
 * FER-020's home read that FER-022's home is built on): see `PageContent`
 * for what each part holds and what is left out. The articles are the
 * catalog's cards, with the store's currency. One read-only snapshot, given
 * the top-level `db` (see `SNAPSHOT`). A page the store does not have shows
 * nothing.
 */
export async function getPageContent(
  db: DatabaseClient,
  {
    currencyCode,
    locale,
    pageId,
    storeId,
    today,
  }: StoreScope & PageScope & OnDay & { currencyCode: Currency; locale: Locale }
): Promise<PageContent<ProductCard>> {
  return await db.transaction(async (tx) => {
    if (!(await hasPage(tx, { pageId, storeId }))) {
      return { cover: [], sections: [] };
    }

    const bannerRows = await readBanners(tx, storeId);
    const cover = await readCover(tx, pageId);
    const saved = await readSavedSections(tx, pageId);
    const categories = await listCategories(tx, { locale, storeId });
    const sections = resolvePageSections(saved, {
      categoryIds: categories.map((entry) => entry.id),
      fillIn: await isHomePage(tx, { pageId, storeId }),
      rowBannerIds: sectionBannerIds(saved),
      spotlightIds: sectionSpotlightIds(saved),
    });
    const categoryRows = await readCategoryRows(tx, storeId, today);
    // The categories the storefront lists: a banner leads only to those.
    const shownCategoryIds = new Set(
      categoriesWithArticles(categories, new Set(categoryRows.keys())).map(
        (entry) => entry.id
      )
    );
    const banners = new Map(
      bannerRows
        .filter((row) => isShowing(row, today))
        .map((row) => [row.id, toPageBanner(row, locale, shownCategoryIds)])
    );
    const curated = await readCurated(tx, storeId);
    // An unplaced spotlight cannot show: neither it nor its article is read.
    const spotlights = await readSpotlights(
      tx,
      storeId,
      sectionSpotlightIds(saved)
    );
    const ids = new Set([
      ...[...categoryRows.values()].flat(),
      ...curated.ranking,
      ...curated.featured,
      ...spotlights.map((row) => row.productId),
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
      cover: cover.flatMap((row) => banners.get(row.bannerId) ?? []),
      sections: composePageSections(sections, {
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
        rowBanners: banners,
        // A spotlight shows an article that can be bought: one not
        // published, or sold out, leaves the page until it can again.
        spotlights: new Map(
          spotlights.flatMap((row) => {
            const card = cards.get(row.productId);

            return card?.isAvailable
              ? [[row.id, toPageSpotlight(row, card, locale)] as const]
              : [];
          })
        ),
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
 * A page's own settings as its editor shows them (FER-060): its names and
 * texts for search engines in both languages, its address, status, place in
 * the header and whether it is the home. NOT_FOUND for a page the store does
 * not have.
 */
async function readPageSettings(
  tx: DatabaseClient,
  { pageId, storeId }: StoreScope & PageScope
) {
  const found = await tx.query.page.findFirst({
    columns: { id: true, isPublished: true, showInHeader: true, slug: true },
    where: and(eq(page.storeId, storeId), eq(page.id, pageId)),
    with: {
      translations: {
        columns: {
          locale: true,
          name: true,
          seoDescription: true,
          seoTitle: true,
        },
      },
    },
  });

  if (!found) {
    throw new ORPCError("NOT_FOUND", { message: "Page not found" });
  }

  const en = textIn(found.translations, "en");
  const es = textIn(found.translations, "es");

  return {
    id: found.id,
    isHome: await isHomePage(tx, { pageId, storeId }),
    isPublished: found.isPublished,
    nameEn: en?.name ?? null,
    nameEs: es?.name ?? "",
    seoDescriptionEn: en?.seoDescription ?? null,
    seoDescriptionEs: es?.seoDescription ?? null,
    seoTitleEn: en?.seoTitle ?? null,
    seoTitleEs: es?.seoTitle ?? null,
    showInHeader: found.showInHeader,
    slug: found.slug,
  };
}

/**
 * Everything a page's editor (FER-020's home screen, FER-058) edits and
 * previews, in one read-only snapshot: the store's announcement, its
 * banners with their texts in both languages and where each shows on this
 * page (`cover`, `rows` or `null`, not on it), the page's sequence under
 * the cover (resolved: a category with no place yet shows after the rest),
 * its cover's order, the curated rows' article ids, and the store's
 * categories and articles, from which the screen picks, warns about
 * articles that cannot be bought, and draws its preview. `today` is the
 * business day the screen's statuses are read on. Given the top-level `db`,
 * like `getPageContent`.
 */
export async function getPageCuration(
  db: DatabaseClient,
  { pageId, storeId, today }: StoreScope & PageScope & OnDay
) {
  return await db.transaction(async (tx) => {
    const [own] = await tx
      .select({ currencyCode: store.currencyCode })
      .from(store)
      .where(eq(store.id, storeId));

    if (!own) {
      throw new ORPCError("NOT_FOUND", { message: "Store not found" });
    }

    const settings = await readPageSettings(tx, { pageId, storeId });
    const { isHome } = settings;

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
    const saved = await readSavedSections(tx, pageId);
    const coverBannerIds = (await readCover(tx, pageId)).map(
      (row) => row.bannerId
    );
    const rowBannerIds = sectionBannerIds(saved);
    const spotlightIds = sectionSpotlightIds(saved);
    const spotlights = await readSpotlights(tx, storeId);
    const curated = await readCurated(tx, storeId);
    const slugOf = new Map(categories.map((row) => [row.id, row.slug]));
    // As the storefront reads them: the preview's banners lead where the
    // page's will.
    const shownCategoryIds = new Set(
      categoriesWithArticles(
        categories,
        new Set(
          articles.flatMap((row) =>
            row.status === "published" && row.categoryId !== null
              ? [row.categoryId]
              : []
          )
        )
      ).map((row) => row.id)
    );
    const placementOf = (id: number): BannerPlacement | null => {
      if (coverBannerIds.includes(id)) {
        return "cover";
      }

      return rowBannerIds.includes(id) ? "rows" : null;
    };

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
        href: bannerHref(row, shownCategoryIds),
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
        placement: placementOf(row.id),
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
      coverBannerIds,
      currencyCode: own.currencyCode,
      featuredProductIds: curated.featured,
      pageId,
      rankingProductIds: curated.ranking,
      page: settings,
      sections: resolvePageSections(saved, {
        categoryIds: categories.map((row) => row.id),
        fillIn: isHome,
        rowBannerIds,
        spotlightIds,
      }),
      spotlights: spotlights.map((row) => ({
        id: row.id,
        labelEn: textIn(row.translations, "en")?.label ?? null,
        labelEs: textIn(row.translations, "es")?.label ?? null,
        onPage: spotlightIds.includes(row.id),
        phraseEn: textIn(row.translations, "en")?.phrase ?? null,
        phraseEs: textIn(row.translations, "es")?.phrase ?? null,
        productId: row.productId,
      })),
      today,
    };
  }, SNAPSHOT);
}

export type PageCuration = Awaited<ReturnType<typeof getPageCuration>>;

// ── Writes ───────────────────────────────────────────────────────────────

/**
 * Reads what a write to a page refers to, after the pages' own lock and the
 * page's row: the store's categories, then the articles it names, both `FOR
 * KEY SHARE` (they only have to exist until it commits, and an edit of them
 * does not wait for that), then the store's banners and where each shows on
 * the page. The banners take no row lock: only a page write changes their
 * places or photos, and the pages' lock already keeps those one at a time;
 * deleting an article or a category only clears a banner's link. The
 * categories come in the store's order, the cover in the carousel's.
 */
async function lockPageTargets(
  tx: DatabaseClient,
  {
    pageId,
    productIds,
    storeId,
  }: StoreScope & { pageId: number; productIds: readonly number[] }
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
  // Held like the categories: an article's deletion takes its spotlights,
  // and a place written for one must not point at a row that went.
  const spotlights = await tx
    .select({ id: spotlight.id })
    .from(spotlight)
    .where(eq(spotlight.storeId, storeId))
    .orderBy(asc(spotlight.id))
    .for("key share");
  const banners = await tx
    .select({
      id: banner.id,
      imagePhoneUrl: banner.imagePhoneUrl,
      imageUrl: banner.imageUrl,
    })
    .from(banner)
    .where(eq(banner.storeId, storeId))
    .orderBy(asc(banner.id));
  const fillIn = await isHomePage(tx, { pageId, storeId });
  const cover = await readCover(tx, pageId);
  const saved = await readSavedSections(tx, pageId);

  return {
    fillIn,
    banners,
    categoryIds: categories.map((row) => row.id),
    coverBannerIds: cover.map((row) => row.bannerId),
    nextCoverPosition: Math.max(-1, ...cover.map((row) => row.position)) + 1,
    pageId,
    productIds: new Set(articles.map((row) => row.id)),
    rowBannerIds: sectionBannerIds(saved),
    saved,
    spotlightIds: sectionSpotlightIds(saved),
    storeSpotlightIds: spotlights.map((row) => row.id),
  };
}

type PageTargets = Awaited<ReturnType<typeof lockPageTargets>>;

/** Where a banner shows on the page the targets are of, or `null`. */
function placementOn(id: number, targets: PageTargets): BannerPlacement | null {
  if (targets.coverBannerIds.includes(id)) {
    return "cover";
  }

  return targets.rowBannerIds.includes(id) ? "rows" : null;
}

/**
 * Refuses a banner joining a page's cover that already holds
 * `COVER_BANNERS_MAX` (one already in it stays): the order's save refuses
 * a longer cover, so one more would block every save after it.
 */
function assertCoverRoom(
  placement: BannerPlacement,
  was: BannerPlacement | null,
  targets: PageTargets
) {
  if (
    placement === "cover" &&
    was !== "cover" &&
    targets.coverBannerIds.length >= COVER_BANNERS_MAX
  ) {
    throw new ORPCError("CONFLICT", {
      message: `The cover holds at most ${COVER_BANNERS_MAX} banners`,
    });
  }
}

/** Refuses a link to an article or a category the store does not have. */
function assertLinkTarget(link: BannerLink, targets: PageTargets) {
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

/** Replaces a page's whole sequence with `sections`, numbered from 0. */
async function writeSections(
  tx: DatabaseClient,
  { pageId, storeId }: StoreScope & { pageId: number },
  sections: readonly PageSection[]
) {
  await tx.delete(pageSection).where(eq(pageSection.pageId, pageId));

  if (sections.length > 0) {
    await tx.insert(pageSection).values(
      sections.map((section, position) => ({
        bannerId: section.kind === "banner" ? section.bannerId : null,
        categoryId: section.kind === "category" ? section.categoryId : null,
        kind: section.kind,
        pageId,
        position,
        spotlightId: section.kind === "spotlight" ? section.spotlightId : null,
        storeId,
      }))
    );
  }
}

/** Puts `bannerId` between the page's rows at `index` of its sequence. */
async function placeBannerInRows(
  tx: DatabaseClient,
  {
    bannerId,
    index,
    storeId,
    targets,
  }: StoreScope & { bannerId: number; index: number; targets: PageTargets }
) {
  const sections = resolvePageSections(targets.saved, targets);

  await writeSections(
    tx,
    { pageId: targets.pageId, storeId },
    placePageSection(sections, { bannerId, kind: "banner" }, index)
  );
}

/** Puts `bannerId` last in the page's cover. */
async function addToCover(
  tx: DatabaseClient,
  { bannerId, targets }: { bannerId: number; targets: PageTargets }
) {
  await tx.insert(pageCoverBanner).values({
    bannerId,
    pageId: targets.pageId,
    position: targets.nextCoverPosition,
  });
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
  await lockStorePages(tx, storeId);
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
 * Adds a banner (FER-020) and places it on a page (FER-058): its photos
 * must be this deployment's uploads for banners, its link the store's own
 * article or category. In the page's cover it goes last, while the cover
 * has room (`COVER_BANNERS_MAX`); between its rows at `rowsIndex` of the
 * sequence, after the first row when none is given.
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

  await lockStorePages(tx, storeId);
  const { pageId } = values;
  await lockPage(tx, { pageId, storeId });
  const targets = await lockPageTargets(tx, {
    pageId,
    productIds: linkedProductIds(values.link),
    storeId,
  });
  assertLinkTarget(values.link, targets);
  assertCoverRoom(values.placement, null, targets);

  const [created] = await tx
    .insert(banner)
    .values({
      ...linkColumns(values.link),
      ...phoneColumns(values.imagePhone),
      endsOn: values.endsOn,
      imageHeight: values.image.height,
      imageUrl: values.image.url,
      imageWidth: values.image.width,
      isActive: values.isActive,
      startsOn: values.startsOn,
      storeId,
    })
    .returning({ id: banner.id });

  if (!created) {
    throw new Error("Inserting a banner returned no row");
  }

  await writeBannerTexts(tx, created.id, values);

  await (values.placement === "cover"
    ? addToCover(tx, { bannerId: created.id, targets })
    : placeBannerInRows(tx, {
        bannerId: created.id,
        index: values.rowsIndex ?? DEFAULT_ROWS_INDEX,
        storeId,
        targets,
      }));

  return { id: created.id };
}

/**
 * Edits a banner, and where it shows on a page (FER-058). A photo left out
 * keeps the stored one; a new one must be this deployment's upload for
 * banners. Moved into the page's cover it goes last, while the cover has
 * room; moved between its rows, or given a new `rowsIndex` there, it takes
 * that place (after the first row when none is given); kept where it was,
 * it keeps its place. A banner not on the page yet is placed on it.
 * Answers the addresses the banner no longer shows, for the caller to
 * delete once this commits (FER-011).
 */
export async function updateBanner(
  tx: DatabaseClient,
  {
    blobStore,
    storeId,
    values,
  }: StoreScope & { blobStore: BlobStore | null; values: UpdateBannerValues }
) {
  await lockStorePages(tx, storeId);
  const { pageId } = values;
  await lockPage(tx, { pageId, storeId });
  const targets = await lockPageTargets(tx, {
    pageId,
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

  const was = placementOn(found.id, targets);
  assertLinkTarget(values.link, targets);
  assertCoverRoom(values.placement, was, targets);

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
      endsOn: values.endsOn,
      isActive: values.isActive,
      startsOn: values.startsOn,
    })
    .where(and(eq(banner.id, found.id), eq(banner.storeId, storeId)));
  await writeBannerTexts(tx, found.id, values);

  if (values.placement === "cover") {
    if (was === "rows") {
      await tx
        .delete(pageSection)
        .where(
          and(
            eq(pageSection.pageId, pageId),
            eq(pageSection.bannerId, found.id)
          )
        );
    }

    if (was !== "cover") {
      await addToCover(tx, { bannerId: found.id, targets });
    }
  } else {
    if (was === "cover") {
      await tx
        .delete(pageCoverBanner)
        .where(
          and(
            eq(pageCoverBanner.pageId, pageId),
            eq(pageCoverBanner.bannerId, found.id)
          )
        );
    }

    if (was !== "rows" || values.rowsIndex !== undefined) {
      await placeBannerInRows(tx, {
        bannerId: found.id,
        index: values.rowsIndex ?? DEFAULT_ROWS_INDEX,
        storeId,
        targets,
      });
    }
  }

  return { discardedImageUrls, id: found.id };
}

/**
 * Deletes a banner, its words and its places on every page with it.
 * Answers its photos' addresses, for the caller to delete those files once
 * this commits.
 */
export async function deleteBanner(
  tx: DatabaseClient,
  { id, storeId }: StoreScope & { id: number }
) {
  await lockStorePages(tx, storeId);
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

/**
 * Refuses a banner the store does not have, one that is not on the page,
 * or one in the page's other place.
 */
function assertBannerIn(
  id: number,
  placement: BannerPlacement,
  targets: PageTargets
) {
  if (!targets.banners.some((row) => row.id === id)) {
    throw bannerNotFound();
  }

  const where = placementOn(id, targets);

  if (where === null) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That banner is not on this page",
    });
  }

  if (where !== placement) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        placement === "cover"
          ? "That banner is between rows, not in the cover"
          : "That banner is in the cover, not between rows",
    });
  }
}

function spotlightNotFound() {
  return new ORPCError("NOT_FOUND", { message: "Spotlight not found" });
}

/** Refuses a spotlight the store does not have, or one not on the page. */
function assertSpotlightOn(id: number, targets: PageTargets) {
  if (!targets.storeSpotlightIds.includes(id)) {
    throw spotlightNotFound();
  }

  if (!targets.spotlightIds.includes(id)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That spotlight is not on this page",
    });
  }
}

/**
 * A spotlight's words: a row per language that has a label or a phrase,
 * and none for a language left with neither.
 */
async function writeSpotlightTexts(
  tx: DatabaseClient,
  spotlightId: number,
  values: Pick<
    CreateSpotlightValues,
    "labelEn" | "labelEs" | "phraseEn" | "phraseEs"
  >
) {
  const texts = [
    { label: values.labelEs, locale: "es" as const, phrase: values.phraseEs },
    { label: values.labelEn, locale: "en" as const, phrase: values.phraseEn },
  ];
  const written = texts.filter(
    (text) => text.label !== null || text.phrase !== null
  );
  const empty = texts
    .filter((text) => text.label === null && text.phrase === null)
    .map((text) => text.locale);

  if (written.length > 0) {
    await tx
      .insert(spotlightTranslation)
      .values(written.map((text) => ({ ...text, spotlightId })))
      .onConflictDoUpdate({
        set: {
          label: sql`excluded."label"`,
          phrase: sql`excluded."phrase"`,
          updatedAt: sql`excluded."updatedAt"`,
        },
        target: [spotlightTranslation.spotlightId, spotlightTranslation.locale],
      });
  }

  if (empty.length > 0) {
    await tx
      .delete(spotlightTranslation)
      .where(
        and(
          eq(spotlightTranslation.spotlightId, spotlightId),
          inArray(spotlightTranslation.locale, empty)
        )
      );
  }
}

/** Puts `spotlightId` between the page's rows at `index` of its sequence. */
async function placeSpotlight(
  tx: DatabaseClient,
  {
    index,
    spotlightId,
    storeId,
    targets,
  }: StoreScope & { index: number; spotlightId: number; targets: PageTargets }
) {
  await writeSections(
    tx,
    { pageId: targets.pageId, storeId },
    placePageSection(
      resolvePageSections(targets.saved, targets),
      { kind: "spotlight", spotlightId },
      index
    )
  );
}

/**
 * Adds an article spotlight (FER-059) and places it between a page's rows,
 * at `rowsIndex` of its sequence, first (right under the cover) when none
 * is given. The article must be the store's; it may be in any state: the
 * storefront leaves out one that cannot be bought, and the admin warns.
 */
export async function createSpotlight(
  tx: DatabaseClient,
  { storeId, values }: StoreScope & { values: CreateSpotlightValues }
) {
  await lockStorePages(tx, storeId);
  const { pageId } = values;
  await lockPage(tx, { pageId, storeId });
  const targets = await lockPageTargets(tx, {
    pageId,
    productIds: [values.productId],
    storeId,
  });

  if (!targets.productIds.has(values.productId)) {
    throw new ORPCError("NOT_FOUND", { message: "Article not found" });
  }

  const [created] = await tx
    .insert(spotlight)
    .values({ productId: values.productId, storeId })
    .returning({ id: spotlight.id });

  if (!created) {
    throw new Error("Inserting a spotlight returned no row");
  }

  await writeSpotlightTexts(tx, created.id, values);
  await placeSpotlight(tx, {
    index: values.rowsIndex ?? DEFAULT_SPOTLIGHT_INDEX,
    spotlightId: created.id,
    storeId,
    targets,
  });

  return { id: created.id };
}

/**
 * Edits a spotlight: its article, its words, and its place on a page. Given
 * a `rowsIndex`, or not on the page yet, it takes that place (first when
 * none is given); else it keeps the one it has.
 */
export async function updateSpotlight(
  tx: DatabaseClient,
  { storeId, values }: StoreScope & { values: UpdateSpotlightValues }
) {
  await lockStorePages(tx, storeId);
  const { pageId } = values;
  await lockPage(tx, { pageId, storeId });
  const targets = await lockPageTargets(tx, {
    pageId,
    productIds: [values.productId],
    storeId,
  });

  if (!targets.storeSpotlightIds.includes(values.id)) {
    throw spotlightNotFound();
  }

  if (!targets.productIds.has(values.productId)) {
    throw new ORPCError("NOT_FOUND", { message: "Article not found" });
  }

  await tx
    .update(spotlight)
    .set({ productId: values.productId })
    .where(and(eq(spotlight.id, values.id), eq(spotlight.storeId, storeId)));
  await writeSpotlightTexts(tx, values.id, values);

  if (
    !targets.spotlightIds.includes(values.id) ||
    values.rowsIndex !== undefined
  ) {
    await placeSpotlight(tx, {
      index: values.rowsIndex ?? DEFAULT_SPOTLIGHT_INDEX,
      spotlightId: values.id,
      storeId,
      targets,
    });
  }

  return { id: values.id };
}

/** Deletes a spotlight, its words and its places on every page with it. */
export async function deleteSpotlight(
  tx: DatabaseClient,
  { id, storeId }: StoreScope & { id: number }
) {
  await lockStorePages(tx, storeId);
  const [deleted] = await tx
    .delete(spotlight)
    .where(and(eq(spotlight.id, id), eq(spotlight.storeId, storeId)))
    .returning({ id: spotlight.id });

  if (!deleted) {
    throw spotlightNotFound();
  }

  return { id: deleted.id };
}

/** Whether two lists hold the same ids in the same order. */
function sameIds(one: readonly number[], other: readonly number[]): boolean {
  return one.length === other.length && one.every((id, at) => id === other[at]);
}

/**
 * Saves a page's order (FER-020, FER-058) whole: its sequence under the
 * cover, its cover's order, and the store's best sellers and featured
 * articles. Every id must be the store's: a category, an article or a
 * banner it does not have is NOT_FOUND, and a banner listed in a place it
 * is not in on the page is refused. A category or a banner left out (one
 * added in another tab) keeps a place after the rest, and a cover banner
 * left out goes after the others, so a save never hides what the person
 * did not see. An article may be curated whatever its state: the
 * storefront leaves out what cannot be bought. Answers what it saved, and
 * whether the curated lists changed, which every page shows.
 */
export async function savePageLayout(
  tx: DatabaseClient,
  { storeId, values }: StoreScope & { values: SavePageLayoutValues & PageScope }
) {
  await lockStorePages(tx, storeId);
  const { pageId } = values;
  await lockPage(tx, { pageId, storeId });
  const productIds = [
    ...new Set([...values.rankingProductIds, ...values.featuredProductIds]),
  ];
  const targets = await lockPageTargets(tx, { pageId, productIds, storeId });

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

    if (section.kind === "spotlight") {
      assertSpotlightOn(section.spotlightId, targets);
    }
  }

  for (const id of values.coverBannerIds) {
    assertBannerIn(id, "cover", targets);
  }

  const sections = resolvePageSections(values.sections, targets);
  const listed = new Set(values.coverBannerIds);
  const coverBannerIds = [
    ...values.coverBannerIds,
    ...targets.coverBannerIds.filter((id) => !listed.has(id)),
  ];
  const curated = await readCurated(tx, storeId);

  await writeSections(tx, { pageId, storeId }, sections);
  await tx.delete(pageCoverBanner).where(eq(pageCoverBanner.pageId, pageId));

  if (coverBannerIds.length > 0) {
    await tx.insert(pageCoverBanner).values(
      coverBannerIds.map((bannerId, position) => ({
        bannerId,
        pageId,
        position,
      }))
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
    curatedChanged:
      !sameIds(curated.ranking, values.rankingProductIds) ||
      !sameIds(curated.featured, values.featuredProductIds),
    featuredProductIds: values.featuredProductIds,
    rankingProductIds: values.rankingProductIds,
    sections,
  };
}
