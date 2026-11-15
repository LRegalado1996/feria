import { sanitizeForLog } from "@/lib/redaction";
import { auth } from "@/server/better-auth";
import { db } from "@/server/db";

import { createSuperadmin } from "./create-superadmin";

// `pnpm db:create-superadmin`: wires the app's database and Better Auth into
// `createSuperadmin` and reports one line. The logic and its guards are
// `create-superadmin.ts`.
try {
  const created = await createSuperadmin({ auth, db, env: process.env });
  console.log(`db:create-superadmin: ${created.email} created`);
} catch (error) {
  process.exitCode = 1;
  console.error("db:create-superadmin failed:", sanitizeForLog(error));
} finally {
  await db.$client.end();
}
