import { ORPCError } from "@orpc/server";

import { classifyError } from "@/lib/errors";
import { translatePostgresError } from "@/lib/errors/postgres";
import { captureExceptionWithScope } from "@/lib/sentry";
import { safeRequestLogger } from "@/server/api/utils/logger";

const UNEXPECTED_MESSAGE = "Something went wrong.";
const UNEXPECTED_FIX =
  "Try again. If it keeps failing, contact support with the code shown.";

function requestIdOf(headers: Headers): string | undefined {
  return headers.get("x-request-id") ?? undefined;
}

/**
 * The client interceptor every oRPC handler (`/api/orpc`, `/api/health`)
 * installs, so a failure is classified the same way on every surface:
 *
 * 1. An `ORPCError` is a deliberate answer: it passes untouched.
 * 2. A constraint violation (SQLSTATE anywhere in the cause chain) becomes the
 *    typed 4xx the user can act on; the request log records its constraint.
 * 3. Anything else is a defect: captured once, recorded on the request log
 *    with its event id, and replaced by a curated
 *    `INTERNAL_SERVER_ERROR`. The raw message and `cause` never reach the
 *    client; it gets a curated `why`, the event id and the request id.
 *
 * A client interceptor, not a handler one: it wraps the procedure call only,
 * so a malformed request still becomes oRPC's own BAD_REQUEST instead of a
 * reported 500.
 */
export async function interceptErrors<T>({
  context,
  next,
  path,
}: {
  context: { headers: Headers };
  next: () => Promise<T>;
  path: readonly string[];
}): Promise<T> {
  try {
    return await next();
  } catch (error) {
    if (error instanceof ORPCError) {
      throw error;
    }
    const procedure = path.join(".");
    const requestId = requestIdOf(context.headers);
    const log = safeRequestLogger();
    const translated = translatePostgresError(error, { procedure, requestId });
    if (translated) {
      log?.set({
        outcome: {
          code: translated.error.code,
          constraint: translated.constraint,
        },
      });
      throw translated.error;
    }
    const eventId = captureExceptionWithScope(error, { procedure, requestId });
    log?.error(error instanceof Error ? error : String(error), {
      outcome: { code: "INTERNAL_SERVER_ERROR", eventId: eventId ?? undefined },
    });
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: UNEXPECTED_MESSAGE,
      data: {
        why: classifyError(error),
        fix: UNEXPECTED_FIX,
        eventId: eventId ?? undefined,
        requestId,
        procedure,
      },
    });
  }
}
