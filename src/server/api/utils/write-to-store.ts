import type { DatabaseClient } from "@/server/db";
import { withStoreAccess } from "@/server/services/access";

/** What a store-scoped handler knows: the resolved store and the caller. */
interface StoreWriteContext {
  db: DatabaseClient;
  session: { user: { id: string } };
  store: { id: number };
}

/**
 * Runs a write on the resolved store with the caller's access re-checked
 * inside its transaction: the one place every store-scoped write goes through,
 * so none can forget the re-check or pass another store's id.
 */
export async function writeToStore<T>(
  context: StoreWriteContext,
  write: (tx: DatabaseClient, storeId: number) => Promise<T>
): Promise<T> {
  return await withStoreAccess(
    context.db,
    { storeId: context.store.id, userId: context.session.user.id },
    async (tx) => await write(tx, context.store.id)
  );
}
