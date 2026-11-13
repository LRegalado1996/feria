import { sql } from "drizzle-orm";

import type { DatabaseClient } from "@/server/db";

/**
 * One round trip to the database, no retry: a retry would hide the outage the
 * health probe exists to see. Throws whatever the driver throws.
 */
export async function pingDatabase(db: DatabaseClient): Promise<void> {
  await db.execute(sql`select 1`);
}
