import { sanitizeForLog } from "@/lib/redaction";
import { auth } from "@/server/better-auth";
import { db } from "@/server/db";

import { seed } from "./seed";

// `pnpm db:seed`: wires the app's database and Better Auth into `seed` and
// reports one line. The logic, the production guard included, is `seed.ts`.
try {
  const result = await seed({
    auth,
    databaseUrl: process.env.DATABASE_URL,
    db,
    nodeEnv: process.env.NODE_ENV,
  });
  console.log(
    `db:seed: logins ${result.createdAccounts.length > 0 ? `created: ${result.createdAccounts.join(", ")}` : "already there"}; stores ${result.createdStores.length > 0 ? `created: ${result.createdStores.join(", ")}` : "already there"}; sample articles ${result.createdArticles > 0 ? `created: ${result.createdArticles}` : "already there"}`
  );
} catch (error) {
  process.exitCode = 1;
  console.error("db:seed failed:", sanitizeForLog(error));
} finally {
  await db.$client.end();
}
