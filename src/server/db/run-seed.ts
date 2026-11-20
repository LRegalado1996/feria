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
    `db:seed: logins ${result.createdAccounts.length > 0 ? `created: ${result.createdAccounts.join(", ")}` : "already there"}; store texts ${result.createdStoreTexts.length > 0 ? `created: ${result.createdStoreTexts.join(", ")}` : "already there"}; sample articles ${result.createdArticles > 0 ? `created: ${result.createdArticles}` : "already there"}; catalog pages: ${result.catalogPages.groups} groups added, ${result.catalogPages.grouped} categories grouped, ${result.catalogPages.covers} covers set; home: announcement ${result.home.announcement ? "added" : "already there"}, ${result.home.banners} banners, ${result.home.ranking} best sellers, ${result.home.featured} featured added, ${result.home.spotlight ? "a spotlight added" : "no spotlight added"}; coming-soon page ${result.openedStore ? "added, unpublished (the store is open)" : "already there"}`
  );
} catch (error) {
  process.exitCode = 1;
  console.error("db:seed failed:", sanitizeForLog(error));
} finally {
  await db.$client.end();
}
