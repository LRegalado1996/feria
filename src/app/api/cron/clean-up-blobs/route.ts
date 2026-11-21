import type { NextRequest } from "next/server";

import { env } from "@/env";
import { withEvlog } from "@/lib/evlog";
import { captureExceptionWithScope } from "@/lib/sentry";
import { readBlobStore } from "@/server/api/utils/blob-store";
import { isCronRequest } from "@/server/api/utils/cron";
import { safeRequestLogger } from "@/server/api/utils/logger";
import { db } from "@/server/db";
import {
  cleanUpOrphanBlobs,
  ORPHAN_BLOB_MIN_AGE_MS,
} from "@/server/services/upload";

const JOB = "clean_up_blobs";

/** An answer no cache keeps: every run reports its own work. */
function answer(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    headers: { "Cache-Control": "no-store" },
    status,
  });
}

/**
 * The orphan cleanup (FER-011), as Vercel's cron calls it once a day
 * (`vercel.json`): a GET carrying `Authorization: Bearer <CRON_SECRET>`.
 * Without a secret configured it refuses to run at all, and a caller without
 * the right one is a 401. It deletes this deployment's files that no row
 * names and that are older than two days, and answers how many it checked
 * and deleted. The request's log line carries the outcome and the counts.
 */
async function cleanUpBlobs(request: NextRequest): Promise<Response> {
  const log = safeRequestLogger();
  const secret = env.CRON_SECRET;

  if (!secret) {
    log?.set({ cron: { job: JOB, outcome: "unconfigured" } });

    return answer(
      { code: "SERVICE_UNAVAILABLE", message: "CRON_SECRET is not set." },
      503
    );
  }

  if (!isCronRequest(request.headers.get("authorization"), secret)) {
    log?.set({ cron: { job: JOB, outcome: "unauthorized" } });

    return answer({ code: "UNAUTHORIZED", message: "Unauthorized" }, 401);
  }

  const blobStore = readBlobStore();

  if (!blobStore) {
    log?.set({ cron: { job: JOB, outcome: "no_store" } });

    return answer(
      {
        code: "SERVICE_UNAVAILABLE",
        message: "BLOB_READ_WRITE_TOKEN is not set.",
      },
      503
    );
  }

  try {
    const { checked, deleted } = await cleanUpOrphanBlobs(db, blobStore, {
      olderThan: new Date(Date.now() - ORPHAN_BLOB_MIN_AGE_MS),
    });
    log?.set({
      cron: {
        checked,
        deleted: deleted.length,
        job: JOB,
        namespace: blobStore.namespace,
        outcome: "cleaned",
      },
    });

    return answer({ checked, deleted: deleted.length });
  } catch (error) {
    log?.set({ cron: { job: JOB, outcome: "failed" } });
    const eventId = captureExceptionWithScope(error, {
      action: "Upload.clean_up_blobs",
      requestId: request.headers.get("x-request-id") ?? undefined,
    });

    return answer(
      {
        code: "INTERNAL_SERVER_ERROR",
        eventId,
        message: "The cleanup failed.",
      },
      500
    );
  }
}

/** `GET` only, the method Vercel's cron uses; one wide event per run. */
export const GET = withEvlog(cleanUpBlobs);
