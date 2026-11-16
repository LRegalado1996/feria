import { randomUUID } from "node:crypto";

import type { DatabaseClient } from "@/server/db";
import { findStore } from "@/server/services/store";

/**
 * The id of the store, the table's one row (FER-038), which the migrations
 * create in every integration database. Every file of a worker shares it,
 * and it holds the dev seed's catalog when the database the worker's clone
 * came from was seeded: a test creates its rows under names no other test
 * uses, asserts on those alone, and deletes them by the ids it captured.
 */
export async function theStoreId(db: DatabaseClient): Promise<number> {
  const found = await findStore(db);

  if (!found) {
    throw new Error("The integration database has no store: migrate it");
  }

  return found.id;
}

/**
 * Eight lowercase hex characters no other test holds: a name ending in it
 * is unique in the store, and slugs to itself.
 */
export function uniqueTag(): string {
  return randomUUID().slice(0, 8);
}

/** The rows of `rows` whose id is one of `ids`, in the order `rows` has. */
export function onlyIds<T extends { id: number }>(
  rows: readonly T[],
  ids: readonly number[]
): T[] {
  return rows.filter((row) => ids.includes(row.id));
}
