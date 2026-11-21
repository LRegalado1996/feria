import { checkBotId } from "botid/server";

import { safeRequestLogger } from "@/server/api/utils/logger";

/**
 * Whether Vercel BotID judges this request a bot (FER-026). It answers only
 * on a Vercel deployment, where the platform signs the check; anywhere else
 * (the e2e run's standalone build, a container) the check would throw for
 * want of Vercel's token, so it is skipped and the request's log line says
 * so. The browser side (`instrumentation-client.ts`) loads its script under
 * the same condition, so a request it protects always carries the token.
 */
export async function isBotRequest(
  env: Record<string, string | undefined> = process.env
): Promise<boolean> {
  if (env.VERCEL !== "1") {
    safeRequestLogger()?.set({ botCheck: "skipped" });

    return false;
  }

  const verdict = await checkBotId();

  return verdict.isBot;
}
