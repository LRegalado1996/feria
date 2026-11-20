import { ORPCError } from "@orpc/server";
import { and, asc, eq, ne, type SQL, sql } from "drizzle-orm";

import type { Locale } from "@/lib/i18n/config";
import { pickTranslation } from "@/lib/i18n/pick-translation";
import {
  type CreatePageValues,
  isPageSlug,
  type UpdatePageValues,
} from "@/lib/schemas/page";
import type { DatabaseClient } from "@/server/db";
import { category, page, pageTranslation, store } from "@/server/db/schema";
import { lockStoreCategories } from "@/server/services/category";
import { findHomePageId, lockStorePages } from "@/server/services/page";

/** The store a read or write is about, already resolved and trusted. */
interface StoreScope {
  storeId: number;
}

function pageNotFound() {
  return new ORPCError("NOT_FOUND", { message: "Page not found" });
}

/** The page the store shows at `/`, held `FOR UPDATE` by a write. */
async function lockHome(tx: DatabaseClient, storeId: number): Promise<number> {
  const [own] = await tx
    .select({ homePageId: store.homePageId })
    .from(store)
    .where(eq(store.id, storeId))
    .for("update");

  if (!own) {
    throw new ORPCError("NOT_FOUND", { message: "Store not found" });
  }

  return own.homePageId;
}

/** The text of `rows` in `locale`, or `null` when there is none. */
function textIn<Row extends { locale: Locale }>(
  rows: readonly Row[],
  locale: Locale
): Row | null {
  return rows.find((row) => row.locale === locale) ?? null;
}

/**
 * The store's pages for the admin's list (FER-060), the home first, then
 * the rest in the order they were made: each with its address, its names,
 * whether it is published, whether the header lists it and whether it is
 * the home.
 */
export async function listPages(db: DatabaseClient, { storeId }: StoreScope) {
  const [own] = await db
    .select({ homePageId: store.homePageId })
    .from(store)
    .where(eq(store.id, storeId));
  const rows = await db.query.page.findMany({
    columns: { id: true, isPublished: true, showInHeader: true, slug: true },
    orderBy: [asc(page.id)],
    where: eq(page.storeId, storeId),
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

  const pages = rows.map(({ translations, ...row }) => ({
    ...row,
    isHome: row.id === own?.homePageId,
    nameEn: textIn(translations, "en")?.name ?? null,
    nameEs: textIn(translations, "es")?.name ?? "",
    seoDescriptionEn: textIn(translations, "en")?.seoDescription ?? null,
    seoDescriptionEs: textIn(translations, "es")?.seoDescription ?? null,
    seoTitleEn: textIn(translations, "en")?.seoTitle ?? null,
    seoTitleEs: textIn(translations, "es")?.seoTitle ?? null,
  }));

  return [
    ...pages.filter((row) => row.isHome),
    ...pages.filter((row) => !row.isHome),
  ];
}

export type StorePageRow = Awaited<ReturnType<typeof listPages>>[number];

/**
 * Refuses an address the site already answers: one of the site's own
 * paths, a category's or a group's, or another page's (FER-060: pages,
 * groups and categories share `/<slug>`). Read under the categories' lock,
 * which a new category takes too, so neither side can take an address the
 * other is taking.
 */
async function assertSlugFree(
  tx: DatabaseClient,
  {
    excludeId,
    slug,
    storeId,
  }: StoreScope & { excludeId: number | null; slug: string }
) {
  if (!isPageSlug(slug)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That address is one the site uses",
    });
  }

  const [categoryTaken] = await tx
    .select({ id: category.id })
    .from(category)
    .where(and(eq(category.storeId, storeId), eq(category.slug, slug)))
    .limit(1);
  const [pageTaken] = await tx
    .select({ id: page.id })
    .from(page)
    .where(
      and(
        eq(page.storeId, storeId),
        eq(page.slug, slug),
        excludeId === null ? undefined : ne(page.id, excludeId)
      )
    )
    .limit(1);

  if (categoryTaken || pageTaken) {
    throw new ORPCError("CONFLICT", {
      message: "Another page or category already has that address",
    });
  }
}

/**
 * A page's words: Spanish always, English while it has a name (without one
 * its row goes, and the storefront shows the Spanish).
 */
async function writePageTexts(
  tx: DatabaseClient,
  pageId: number,
  values: Pick<
    CreatePageValues,
    | "nameEn"
    | "nameEs"
    | "seoDescriptionEn"
    | "seoDescriptionEs"
    | "seoTitleEn"
    | "seoTitleEs"
  >
) {
  const rows = [
    {
      locale: "es" as const,
      name: values.nameEs,
      pageId,
      seoDescription: values.seoDescriptionEs,
      seoTitle: values.seoTitleEs,
    },
    ...(values.nameEn === null
      ? []
      : [
          {
            locale: "en" as const,
            name: values.nameEn,
            pageId,
            seoDescription: values.seoDescriptionEn,
            seoTitle: values.seoTitleEn,
          },
        ]),
  ];

  await tx
    .insert(pageTranslation)
    .values(rows)
    .onConflictDoUpdate({
      set: {
        name: sql`excluded."name"`,
        seoDescription: sql`excluded."seoDescription"`,
        seoTitle: sql`excluded."seoTitle"`,
        updatedAt: sql`excluded."updatedAt"`,
      },
      target: [pageTranslation.pageId, pageTranslation.locale],
    });

  if (values.nameEn === null) {
    await tx
      .delete(pageTranslation)
      .where(
        and(
          eq(pageTranslation.pageId, pageId),
          eq(pageTranslation.locale, "en")
        )
      );
  }
}

/**
 * Creates a page of the store (FER-060) with no blocks yet: its address is
 * checked free under the pages' and the categories' locks.
 */
export async function createPage(
  tx: DatabaseClient,
  { storeId, values }: StoreScope & { values: CreatePageValues }
) {
  await lockStorePages(tx, storeId);
  await lockStoreCategories(tx, storeId);
  await assertSlugFree(tx, { excludeId: null, slug: values.slug, storeId });
  const [created] = await tx
    .insert(page)
    .values({
      isPublished: values.isPublished,
      showInHeader: values.showInHeader,
      slug: values.slug,
      storeId,
    })
    .returning({ id: page.id, slug: page.slug });

  if (!created) {
    throw new Error("Inserting a page returned no row");
  }

  await writePageTexts(tx, created.id, values);

  return created;
}

/**
 * Edits a page's settings: its names and texts, its address (checked free),
 * whether it is published and whether the header lists it. The page that
 * is the home stays published (choose another home first). Answers the
 * page's old and new address, for the caller to drop what it cached.
 */
export async function updatePage(
  tx: DatabaseClient,
  { storeId, values }: StoreScope & { values: UpdatePageValues }
) {
  await lockStorePages(tx, storeId);
  await lockStoreCategories(tx, storeId);
  const homePageId = await lockHome(tx, storeId);
  const [found] = await tx
    .select({ id: page.id, slug: page.slug })
    .from(page)
    .where(and(eq(page.id, values.id), eq(page.storeId, storeId)))
    .for("update");

  if (!found) {
    throw pageNotFound();
  }

  if (found.id === homePageId && !values.isPublished) {
    throw new ORPCError("BAD_REQUEST", {
      message: "The home cannot be unpublished: choose another home first",
    });
  }

  if (values.slug !== found.slug) {
    await assertSlugFree(tx, {
      excludeId: found.id,
      slug: values.slug,
      storeId,
    });
  }

  await tx
    .update(page)
    .set({
      isPublished: values.isPublished,
      showInHeader: values.showInHeader,
      slug: values.slug,
    })
    .where(and(eq(page.id, found.id), eq(page.storeId, storeId)));
  await writePageTexts(tx, found.id, values);

  return { id: found.id, previousSlug: found.slug, slug: values.slug };
}

/**
 * Deletes a page, its blocks and its cover with it; never the home, which
 * the database refuses too (the store points at it).
 */
export async function deletePage(
  tx: DatabaseClient,
  { id, storeId }: StoreScope & { id: number }
) {
  await lockStorePages(tx, storeId);
  const homePageId = await lockHome(tx, storeId);

  if (id === homePageId) {
    throw new ORPCError("BAD_REQUEST", {
      message: "The home cannot be deleted: choose another home first",
    });
  }

  const [deleted] = await tx
    .delete(page)
    .where(and(eq(page.id, id), eq(page.storeId, storeId)))
    .returning({ id: page.id, slug: page.slug });

  if (!deleted) {
    throw pageNotFound();
  }

  return deleted;
}

/**
 * Makes `pageId` the page `/` shows (FER-060), in one write under the
 * pages' lock with the store's row held: two admins choosing at once each
 * leave exactly one home, the last one. Only a published page of the store
 * can be the home. Answers the old and the new home, for the caller to
 * drop both pages' cached reads.
 */
export async function setHomePage(
  tx: DatabaseClient,
  { pageId, storeId }: StoreScope & { pageId: number }
) {
  await lockStorePages(tx, storeId);
  const previousHomeId = await lockHome(tx, storeId);
  const [found] = await tx
    .select({ id: page.id, isPublished: page.isPublished })
    .from(page)
    .where(and(eq(page.id, pageId), eq(page.storeId, storeId)))
    .for("key share");

  if (!found) {
    throw pageNotFound();
  }

  if (!found.isPublished) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Only a published page can be the home",
    });
  }

  await tx
    .update(store)
    .set({ homePageId: found.id })
    .where(eq(store.id, storeId));

  return { homePageId: found.id, previousHomeId };
}

/** A page of the store as the storefront shows it, found by `where`. */
async function findShownPage(
  db: DatabaseClient,
  { locale, storeId, where }: StoreScope & { locale: Locale; where: SQL }
) {
  const found = await db.query.page.findFirst({
    columns: { id: true, isPublished: true, slug: true, updatedAt: true },
    where: and(eq(page.storeId, storeId), where),
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
    return null;
  }

  const homePageId = await findHomePageId(db, { storeId });
  const words = pickTranslation(found.translations, locale);

  return {
    id: found.id,
    isHome: found.id === homePageId,
    isPublished: found.isPublished,
    lang: words?.locale ?? locale,
    name: words?.name ?? "",
    seoDescription: words?.seoDescription ?? null,
    seoTitle: words?.seoTitle ?? null,
    slug: found.slug,
  };
}

/**
 * The store's page at `/<slug>` as the storefront shows it (FER-060), in
 * `locale` or the language it has, or `null` when the store has none
 * there: its name and texts for search engines, whether it is published
 * and whether it is the home (whose address leads to `/`).
 */
export async function findStorePage(
  db: DatabaseClient,
  { locale, slug, storeId }: StoreScope & { locale: Locale; slug: string }
) {
  return await findShownPage(db, {
    locale,
    storeId,
    where: eq(page.slug, slug),
  });
}

/**
 * The page the store shows at `/` as the storefront shows it (FER-060):
 * its name and its own texts for search engines, which the home's metadata
 * takes when they are written.
 */
export async function findHomePage(
  db: DatabaseClient,
  { locale, storeId }: StoreScope & { locale: Locale }
) {
  return await findShownPage(db, {
    locale,
    storeId,
    where: eq(page.id, await findHomePageId(db, { storeId })),
  });
}

export type StorePage = NonNullable<Awaited<ReturnType<typeof findStorePage>>>;

/**
 * The published pages the header lists (FER-060), never the home (the
 * logo leads there), in the order they were made, named in `locale` or the
 * language they have.
 */
export async function listHeaderPages(
  db: DatabaseClient,
  { locale, storeId }: StoreScope & { locale: Locale }
) {
  const rows = await db.query.page.findMany({
    columns: { id: true, slug: true },
    orderBy: [asc(page.id)],
    where: and(
      eq(page.storeId, storeId),
      eq(page.isPublished, true),
      eq(page.showInHeader, true),
      ne(page.id, await findHomePageId(db, { storeId }))
    ),
    with: { translations: { columns: { locale: true, name: true } } },
  });

  return rows.map((row) => {
    const words = pickTranslation(row.translations, locale);

    return {
      id: row.id,
      lang: words?.locale ?? locale,
      name: words?.name ?? "",
      path: `/${row.slug}`,
      slug: row.slug,
    };
  });
}

/**
 * The published pages a search engine or an assistant is told about
 * (FER-060), never the home, which is `/` (listed once, as the home).
 */
export async function listIndexablePages(
  db: DatabaseClient,
  { locale, storeId }: StoreScope & { locale: Locale }
) {
  const rows = await db.query.page.findMany({
    columns: { id: true, slug: true, updatedAt: true },
    orderBy: [asc(page.id)],
    where: and(
      eq(page.storeId, storeId),
      eq(page.isPublished, true),
      ne(page.id, await findHomePageId(db, { storeId }))
    ),
    with: { translations: { columns: { locale: true, name: true } } },
  });

  return rows.map((row) => ({
    name: pickTranslation(row.translations, locale)?.name ?? "",
    path: `/${row.slug}`,
    updatedAt: row.updatedAt,
  }));
}
