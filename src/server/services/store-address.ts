import { eq } from "drizzle-orm";

import { categoryPath } from "@/lib/catalog/paths";
import type { StoreAddresses } from "@/lib/catalog/store-address";
import type { DatabaseClient } from "@/server/db";
import { page } from "@/server/db/schema";

/**
 * Every address of the store that a one- or two-segment route answers
 * (FER-069): each category and group at its page's address, shown or not,
 * and each page built from sections, drafts included, with which one is
 * the home. `null` before the store's row exists. Slugs and published
 * flags only: the proxy reads it on its way to a page, and keeps it.
 */
export async function listStoreAddresses(
  db: DatabaseClient
): Promise<StoreAddresses | null> {
  const found = await db.query.store.findFirst({
    columns: { homePageId: true, id: true },
    with: {
      categories: {
        columns: { slug: true },
        with: { parent: { columns: { slug: true } } },
      },
    },
  });

  if (!found) {
    return null;
  }

  const pages = await db.query.page.findMany({
    columns: { id: true, isPublished: true, slug: true },
    where: eq(page.storeId, found.id),
  });

  return {
    categories: found.categories.map((entry) => ({
      path: categoryPath({
        parentSlug: entry.parent?.slug ?? null,
        slug: entry.slug,
      }),
      slug: entry.slug,
    })),
    pages: pages.map((entry) => ({
      isHome: entry.id === found.homePageId,
      isPublished: entry.isPublished,
      slug: entry.slug,
    })),
  };
}
