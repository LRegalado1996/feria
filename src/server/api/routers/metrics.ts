import { countViewSchema, dashboardSchema } from "@/lib/schemas/metrics";
import { businessDay } from "@/lib/utils/format";
import { adminProcedure, publicProcedure } from "@/server/api/orpc";
import { metricsBucket } from "@/server/api/utils/client-key";
import { keepAlivePastResponse } from "@/server/api/utils/keep-alive-past-response";
import { isKnownBot } from "@/server/api/utils/known-bot";
import { safeRequestLogger } from "@/server/api/utils/logger";
import { getDashboard } from "@/server/services/dashboard";
import { countProductView, countStoreVisit } from "@/server/services/metrics";

interface CountRequest {
  headers: Headers;
  session: { user?: unknown } | null;
  sessionFailure: { error: unknown } | null;
}

/**
 * Why a request counts nothing, or `null` when it counts: a known bot by its
 * user agent, a signed-in login (every login is an admin, FER-038), or a
 * session that could not be read, which might be one.
 */
function ignoredBecause(request: CountRequest) {
  if (isKnownBot(request.headers.get("user-agent"))) {
    return "bot";
  }

  if (request.sessionFailure) {
    return "session_unreadable";
  }

  return request.session?.user ? "admin" : null;
}

/**
 * Hands a count to the time after the response: it starts only once the
 * answer is sent, and a failed write is reported, never the caller's. The request's
 * log line says what was done with it, and when the cap was skipped for
 * want of the client's address.
 */
function countAfterResponse(
  request: CountRequest,
  bucket: string | null,
  count: () => Promise<unknown>,
  action: string
) {
  const ignored = ignoredBecause(request);

  if (ignored) {
    safeRequestLogger()?.set({ metrics: { outcome: ignored } });

    return;
  }

  safeRequestLogger()?.set({
    metrics: {
      clientLimit: bucket === null ? "skipped" : "applied",
      outcome: "queued",
    },
  });
  // Started only once the response is sent.
  keepAlivePastResponse(count, { action });
}

/**
 * The storefront's own counts (FER-029), called by the browser once the
 * page is shown, once per tab session: a visit to the store and a view
 * of an article. Public and cheap: the answer is always empty, whatever was
 * counted, and the day is the business day in Montevideo when the request
 * arrived. And the admin's dashboard (FER-030), which reads them with the
 * store's orders and articles for a range of business days.
 */
export const metricsRouter = {
  dashboard: adminProcedure
    .input(dashboardSchema)
    .handler(
      async ({ context, input }) =>
        await getDashboard(context.db, {
          from: input.from,
          locale: input.locale,
          storeId: context.store.id,
          to: input.to,
        })
    )
    .route({
      method: "GET",
      path: "/admin/metrics",
      summary: "The store's metrics for a range of business days",
      tags: ["metrics"],
    }),

  countVisit: publicProcedure
    .handler(({ context }) => {
      const day = businessDay(new Date());
      const bucket = metricsBucket(context.headers, { day, subject: "visit" });

      countAfterResponse(
        context,
        bucket,
        async () => await countStoreVisit(context.db, { bucket, day }),
        "Metrics.count_visit"
      );
    })
    .route({
      method: "POST",
      path: "/metrics/visits",
      summary: "Count a tab session's visit to the store",
      tags: ["metrics"],
    }),

  countView: publicProcedure
    .input(countViewSchema)
    .handler(({ context, input }) => {
      const day = businessDay(new Date());
      const bucket = metricsBucket(context.headers, {
        day,
        subject: `view:${String(input.productId)}`,
      });

      countAfterResponse(
        context,
        bucket,
        async () =>
          await countProductView(context.db, {
            bucket,
            day,
            productId: input.productId,
          }),
        "Metrics.count_view"
      );
    })
    .route({
      method: "POST",
      path: "/metrics/views",
      summary: "Count a tab session's view of an article",
      tags: ["metrics"],
    }),
};
