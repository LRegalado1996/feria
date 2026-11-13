import "dotenv/config";
import { defineConfig } from "drizzle-kit";

import { resolveDatabaseUrl } from "./src/env-database-url.js";

export default defineConfig({
  schema: "src/server/db/schema/index.ts",
  out: "src/server/db/drizzle",
  dialect: "postgresql",
  // Not required at load: `db:generate` needs no database, and tools that only
  // read this file (knip) must load it without one. The commands that connect
  // (`db:push`, `db:migrate`, `db:studio`) fail on the missing URL themselves.
  // MIGRATION_DATABASE_URL (an owner role on the direct endpoint) is read here
  // only, never in src/env.js, so the running app never holds it. Scope it to
  // production and qa: a preview migrates its own Neon branch.
  dbCredentials: {
    url: process.env.MIGRATION_DATABASE_URL ?? resolveDatabaseUrl(process.env),
  },
});
