import { sanitizeForLog } from "@/lib/redaction";
import { auth } from "@/server/better-auth";
import { db } from "@/server/db";

import { seed } from "./seed";

// `pnpm db:seed`: wires the app's database and Better Auth into `seed` and
// reports one line. The logic, the production guard included, is `seed.ts`.
try {
  const result = await seed({ auth, db, nodeEnv: process.env.NODE_ENV });
  console.log(
    `db:seed: ${result.email} ${result.createdUser ? "created" : "already there"}; welcome post ${result.createdPost ? "created" : "skipped, posts exist"}`
  );
} catch (error) {
  process.exitCode = 1;
  console.error("db:seed failed:", sanitizeForLog(error));
} finally {
  await db.$client.end();
}
