import { invalidateCatalogCache } from "@/server/cache/catalog";
import { invalidateHomeCache } from "@/server/cache/home";
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
 * `writeToStore` for a write to the home's curation (FER-020): the
 * announcement, a banner, the home's order. Once it committed, the store's
 * cached announcement and home are dropped, so the storefront shows it on
 * the next visit.
 */
export async function writeToHome<T>(
  context: StoreWriteContext,
  write: (tx: DatabaseClient, storeId: number) => Promise<T>
): Promise<T> {
  const result = await writeToStore(context, write);
  invalidateHomeCache(context.store.id);

  return result;
}
