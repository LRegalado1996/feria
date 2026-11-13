import {
  extraErrorDataIntegration,
  init,
  zodErrorsIntegration,
} from "@sentry/nextjs";

import {
  resolveSentryEnvironment,
  SENTRY_IGNORE_TRANSACTIONS,
  scrubEventSecrets,
  sentryDataCollection,
  tracesSampleRate,
} from "./src/lib/sentry-options";

// Loaded by `register()` in src/instrumentation.ts, Node runtime only: the
// proxy runs on Node and no route declares the edge runtime, so there is no
// edge config. Without a DSN, or on a throwaway preview, nothing initialises
// and every capture helper returns null.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const environment = resolveSentryEnvironment(process.env);

if (dsn && environment) {
  init({
    dsn,
    environment,
    tracesSampleRate: tracesSampleRate(process.env),
    dataCollection: sentryDataCollection(),
    ignoreTransactions: SENTRY_IGNORE_TRANSACTIONS,
    beforeSend: scrubEventSecrets,
    integrations: [
      // A zod failure that escapes arrives as an opaque ZodError; this lists
      // its issues by field path.
      zodErrorsIntegration(),
      // Surfaces an error's own properties, `ORPCError.data` among them.
      // `beforeSend` scrubs them like the rest of the event.
      extraErrorDataIntegration({ depth: 3 }),
    ],
  });
}
