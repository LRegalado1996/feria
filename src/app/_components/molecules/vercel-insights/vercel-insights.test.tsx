import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { VercelInsights, withoutOrderToken } from "./vercel-insights";

// The packages' own components load Vercel's scripts; here they only hand
// over the `beforeSend` each was given.
const { analytics, speedInsights } = vi.hoisted(() => ({
  analytics: vi.fn((_props: { beforeSend?: unknown }) => null),
  speedInsights: vi.fn((_props: { beforeSend?: unknown }) => null),
}));

vi.mock("@vercel/analytics/next", () => ({ Analytics: analytics }));
vi.mock("@vercel/speed-insights/next", () => ({
  SpeedInsights: speedInsights,
}));

const TOKEN = "Ab3_-".repeat(9).slice(0, 43);

function setup() {
  render(<VercelInsights />);
  const [analyticsProps] = analytics.mock.calls[0] ?? [];
  const [speedInsightsProps] = speedInsights.mock.calls[0] ?? [];

  return {
    analyticsBeforeSend: analyticsProps?.beforeSend,
    speedInsightsBeforeSend: speedInsightsProps?.beforeSend,
  };
}

describe("VercelInsights", () => {
  test("hands both Analytics and Speed Insights the token filter", () => {
    const { analyticsBeforeSend, speedInsightsBeforeSend } = setup();

    expect(analyticsBeforeSend).toBe(withoutOrderToken);
    expect(speedInsightsBeforeSend).toBe(withoutOrderToken);
  });
});

describe("withoutOrderToken", () => {
  test("takes an order's token out of the url and keeps every other field", () => {
    expect(
      withoutOrderToken({
        type: "pageview",
        url: `https://feria.test/en/orders/${TOKEN}?ref=cart`,
        value: 3,
      })
    ).toEqual({
      type: "pageview",
      url: "https://feria.test/en/orders/[token]?ref=cart",
      value: 3,
    });
  });

  test("leaves a url without an order's token as it is", () => {
    const event = {
      type: "pageview",
      url: "https://feria.test/products/collar-de-perlas",
    };

    expect(withoutOrderToken(event)).toEqual(event);
  });
});
