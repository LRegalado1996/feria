import { invalidateCatalogCache } from "@/server/cache/catalog";
import {
  invalidateAnnouncementCache,
  invalidatePageCache,
  invalidatePagesCache,
} from "@/server/cache/page";
import type { DatabaseClient } from "@/server/db";
import { withAdmin } from "@/server/services/access";

/** What an admin handler knows: the store and the caller. */
interface StoreWriteContext {
  db: DatabaseClient;
  session: { user: { id: string } };
  store: { id: number };
}

/**
 * Runs a write on the store with the caller's login re-checked inside its
 * transaction: the one place every admin write goes through, so none can
 * forget the re-check or reach for a store id of its own.
 */
export async function writeToStore<T>(
  context: StoreWriteContext,
  write: (tx: DatabaseClient, storeId: number) => Promise<T>
): Promise<T> {
  return await withAdmin(
    context.db,
    context.session.user.id,
    async (tx) => await write(tx, context.store.id)
  );
}

/**
 * `writeToStore` for a write a shopper can see (an article's texts, price,
 * photos, availability or publication; a category's name): once it
 * committed, the store's cached article pages are dropped (FER-024). A write
 * that only sometimes reaches the storefront says when with `shows`, read
 * from what it committed: an article's save drops them only when the article
 * is published, so a draft's autosave (FER-017) never empties the cache.
 */
export async function writeToCatalog<T>(
  context: StoreWriteContext,
  write: (tx: DatabaseClient, storeId: number) => Promise<T>,
  shows: (result: T) => boolean = () => true
): Promise<T> {
  const result = await writeToStore(context, write);

  if (shows(result)) {
    invalidateCatalogCache(context.store.id);
  }

  return result;
}

/**
 * `writeToStore` for a write to what the store's pages may show (FER-020,
 * FER-058): a banner, which any page may place. Once it committed, every
 * cached page is dropped, so the storefront shows it on the next visit.
 */
export async function writeToPages<T>(
  context: StoreWriteContext,
  write: (tx: DatabaseClient, storeId: number) => Promise<T>
): Promise<T> {
  const result = await writeToStore(context, write);
  invalidatePagesCache(context.store.id);

  return result;
}

/**
 * `writeToStore` for a write to one page's order (FER-058). Once it
 * committed, that page's cached read is dropped, and every page's when
 * the write says it changed what they all show (`curatedChanged`: the
 * best sellers or the featured articles).
 */
export async function writeToPage<T extends { curatedChanged: boolean }>(
  context: StoreWriteContext,
  pageId: number,
  write: (tx: DatabaseClient, storeId: number) => Promise<T>
): Promise<T> {
  const result = await writeToStore(context, write);
  invalidatePageCache(context.store.id, pageId);

  if (result.curatedChanged) {
    invalidatePagesCache(context.store.id);
  }

  return result;
}

/**
 * `writeToStore` for the announcement (FER-020): once it committed, the
 * frame's cached bar is dropped.
 */
export async function writeToAnnouncement<T>(
  context: StoreWriteContext,
  write: (tx: DatabaseClient, storeId: number) => Promise<T>
): Promise<T> {
  const result = await writeToStore(context, write);
  invalidateAnnouncementCache(context.store.id);

  return result;
}
