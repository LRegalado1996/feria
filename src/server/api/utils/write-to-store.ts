import { invalidateCatalogCache } from "@/server/cache/catalog";
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
 * committed, the store's cached article pages are dropped (FER-024).
 */
export async function writeToCatalog<T>(
  context: StoreWriteContext,
  write: (tx: DatabaseClient, storeId: number) => Promise<T>
): Promise<T> {
  const result = await writeToStore(context, write);
  invalidateCatalogCache(context.store.id);

  return result;
}
