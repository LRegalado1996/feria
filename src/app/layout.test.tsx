import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import RootLayout, { metadata, viewport } from "./layout";

// `next/font` is compiled by Next's build; outside it there is nothing to load.
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "font-geist-test" }),
}));

// The marker has its own tests; here it only shows where it is mounted.
vi.mock("@/app/_components/molecules/environment-marker", () => ({
  EnvironmentMarker: () => <div data-testid="environment-marker" />,
}));

// AppProviders has its own tests; here it only shows what it wraps.
vi.mock("@/app/_components/organisms/app-providers", () => ({
  AppProviders: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-providers">{children}</div>
  ),
}));

// Both read Next's router context, which exists only inside a Next render.
vi.mock("@vercel/analytics/next", () => ({
  Analytics: () => <div data-testid="vercel-analytics" />,
}));

vi.mock("@vercel/speed-insights/next", () => ({
  SpeedInsights: () => <div data-testid="vercel-speed-insights" />,
}));

const SHELL_START =
  '<html class="font-geist-test" lang="en-US"><head></head><body><div data-testid="environment-marker"></div><div data-testid="app-providers"><main>page content</main></div>';
const ANALYTICS =
  '<div data-testid="vercel-analytics"></div><div data-testid="vercel-speed-insights"></div>';
const SHELL_END = "</body></html>";

function setup({ vercel }: { vercel: string }) {
  vi.stubEnv("VERCEL", vercel);

  return renderToStaticMarkup(
    <RootLayout>
      <main>page content</main>
    </RootLayout>
  );
}

describe("RootLayout", () => {
  test("renders the page inside the document shell: the environment marker first, analytics last", () => {
    const html = setup({ vercel: "1" });

    expect(html).toBe(`${SHELL_START}${ANALYTICS}${SHELL_END}`);
  });

  test.each(["", "0"])(
    "leaves analytics out off Vercel (VERCEL=%j), where their scripts 404",
    (vercel) => {
      const html = setup({ vercel });

      expect(html).toBe(`${SHELL_START}${SHELL_END}`);
    }
  );

  test("names the app in the document metadata", () => {
    expect(metadata.title).toBe("Feria");
  });

  test("fits the device width and never locks zoom", () => {
    expect(viewport).toEqual({ width: "device-width", initialScale: 1 });
  });
});
