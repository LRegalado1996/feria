import { workerDatabaseUrl } from "@/server/test/integration-global-setup";

// Runs in each worker before its test file is imported, so `@/env` and the
// shared pool see this worker's clone. `VITEST_POOL_ID` is unique among the
// workers running at any moment and never exceeds `maxWorkers`, the number of
// clones the global setup made. The template URL is kept aside so a reused
// worker derives the same clone instead of appending a second suffix.
process.env.INTEGRATION_TEMPLATE_DATABASE_URL ??= process.env.DATABASE_URL;
const templateUrl = process.env.INTEGRATION_TEMPLATE_DATABASE_URL;
const poolId = Number(process.env.VITEST_POOL_ID);

if (!templateUrl || !Number.isInteger(poolId) || poolId < 1) {
  throw new Error(
    "Integration worker database: DATABASE_URL and VITEST_POOL_ID are required."
  );
}

process.env.DATABASE_URL = workerDatabaseUrl(templateUrl, poolId);
