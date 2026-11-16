"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { redactOrderTokens } from "@/lib/redaction";

/** The event with its address's order token taken out (FER-026). */
function withoutOrderToken<Event extends { url: string }>(event: Event): Event {
  return { ...event, url: redactOrderTokens(event.url) };
}

/**
 * Vercel Analytics and Speed Insights, with every address they send cleared
 * of an order's token: the token is the only key to the order's page, and
 * the dashboards are read by more people than the order's shopper.
 */
function VercelInsights() {
  return (
    <>
      <Analytics beforeSend={withoutOrderToken} />
      <SpeedInsights beforeSend={withoutOrderToken} />
    </>
  );
}

export { VercelInsights, withoutOrderToken };
