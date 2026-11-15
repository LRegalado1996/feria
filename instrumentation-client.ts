import {
  type ErrorEvent,
  type EventHint,
  extraErrorDataIntegration,
  init,
  replayIntegration,
  zodErrorsIntegration,
} from "@sentry/nextjs";
import { initBotId } from "botid/client/core";

import { BOT_PROTECTED_REQUESTS } from "./src/lib/env/bot-protection";
import { readClientDeployEnv } from "./src/lib/env/deploy";
import {
  filterClientEvent,
  resolveSentryEnvironment,
  sentryDataCollection,
  tracesSampleRate,
} from "./src/lib/sentry-options";

export { captureRouterTransitionStart as onRouterTransitionStart } from "@sentry/nextjs";

// Same gate as the server: no DSN, or a throwaway preview, means no init and
// no replay recorded by a branch that will be deleted.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const deployEnv = readClientDeployEnv();
const environment = resolveSentryEnvironment(deployEnv);

function beforeSend(event: ErrorEvent, hint: EventHint): ErrorEvent | null {
  return filterClientEvent(event, hint, navigator.userAgent);
}

if (dsn && environment) {
  init({
    dsn,
    environment,
    tracesSampleRate: tracesSampleRate(deployEnv),
    // Trace headers go to this origin only, never to a third party.
    tracePropagationTargets: [/^\//],
    dataCollection: sentryDataCollection(),
    ignoreTransactions: [/\/monitoring/],
    beforeSend,
    // Replays only around an error, with every text, input and media masked
    // (the integration's defaults). Unmasking is a privacy review, not a tweak.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1,
    integrations: [
      zodErrorsIntegration(),
      extraErrorDataIntegration({ depth: 3 }),
      replayIntegration(),
    ],
  });
}

// BotID (FER-026): only on Vercel, where the server can check what this
// script attaches; elsewhere the server skips the check too
// (`src/server/api/utils/bot-check.ts`).
if (process.env.NEXT_PUBLIC_VERCEL === "1") {
  initBotId({ protect: BOT_PROTECTED_REQUESTS });
}
