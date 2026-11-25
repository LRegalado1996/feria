import { sql } from "drizzle-orm";

import type { DatabaseClient } from "@/server/db";
import { withSingleConnectAttempt } from "@/server/db/resilient-pool";

/**
 * One round trip to the database, no retry, not even of opening the
 * connection the pool would otherwise retry: a retry would hide the outage
 * the health probe exists to see. Throws whatever the driver throws.
 */
export async function pingDatabase(db: DatabaseClient): Promise<void> {
  await withSingleConnectAttempt(async () => {
    await db.execute(sql`select 1`);
  });
}
