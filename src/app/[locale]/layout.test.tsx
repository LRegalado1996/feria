import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import type { Dictionary } from "@/content";

import RootLayout, {
  generateMetadata,
  generateStaticParams,
  viewport,
} from "./layout";

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// `next/font` is compiled by Next's build; outside it there is nothing to load.
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "font-geist-test" }),
}));

// The marker has its own tests; here it only shows where it is mounted and
// the language it was given.
vi.mock("@/app/_components/molecules/environment-marker", () => ({
  EnvironmentMarker: ({ locale }: { locale: string }) => (
    <div data-locale={locale} data-testid="environment-marker" />
  ),
}));

// AppProviders has its own tests; here it shows what it wraps and the
// language and dictionary it was handed.
vi.mock("@/app/_components/organisms/app-providers", () => ({
  AppProviders: ({
    children,
    dictionary,
    locale,
  }: {
    children: ReactNode;
    dictionary: Dictionary;
    locale: string;
  }) => (
    <div
      data-locale={locale}
      data-testid="app-providers"
      data-welcome={dictionary.auth.welcome.title}
    >
      {children}
    </div>
  ),
}));

// Both read Next's router context, which exists only inside a Next render.
vi.mock("@vercel/analytics/next", () => ({
  Analytics: () => <div data-testid="vercel-analytics" />,
}));

vi.mock("@vercel/speed-insights/next", () => ({
  SpeedInsights: () => <div data-testid="vercel-speed-insights" />,
}));

const WELCOME = { es: "Hola de nuevo", en: "Welcome back" };
const ANALYTICS =
  '<div data-testid="vercel-analytics"></div><div data-testid="vercel-speed-insights"></div>';
const SHELL_END = "</body></html>";

function shellStart(locale: "en" | "es") {
  return `<html class="font-geist-test" lang="${locale}"><head></head><body><div data-locale="${locale}" data-testid="environment-marker"></div><div data-locale="${locale}" data-testid="app-providers" data-welcome="${WELCOME[locale]}"><main>page content</main></div>`;
}

async function makeParams(locale: string) {
  return await Promise.resolve({ locale });
}

async function setup({ locale = "es", vercel = "" } = {}) {
  vi.stubEnv("VERCEL", vercel);

  return renderToStaticMarkup(
    await RootLayout({
      children: <main>page content</main>,
      params: makeParams(locale),
    })
  );
}

describe("RootLayout", () => {
  test.each(["es", "en"] as const)(
    "renders the %s document: its lang, then the marker and the providers in that language",
    async (locale) => {
      const html = await setup({ locale });

      expect(html).toBe(`${shellStart(locale)}${SHELL_END}`);
    }
  );

  test("puts analytics last on Vercel", async () => {
    const html = await setup({ vercel: "1" });

    expect(html).toBe(`${shellStart("es")}${ANALYTICS}${SHELL_END}`);
  });

  test.each(["", "0"])(
    "leaves analytics out off Vercel (VERCEL=%j), where their scripts 404",
    async (vercel) => {
      const html = await setup({ vercel });

      expect(html).toBe(`${shellStart("es")}${SHELL_END}`);
    }
  );

  test.each(["fr", "ES", "es-UY"])(
    "answers 404 for %j, which is not a language of the product",
    async (locale) => {
      await expect(setup({ locale })).rejects.toMatchObject({
        digest: "NEXT_HTTP_ERROR_FALLBACK;404",
      });
    }
  );

  test("fits the device width and never locks zoom", () => {
    expect(viewport).toEqual({ width: "device-width", initialScale: 1 });
  });
});

describe("generateStaticParams", () => {
  test("prerenders one shell per language", () => {
    expect(generateStaticParams()).toEqual([
      { locale: "es" },
      { locale: "en" },
    ]);
  });
});

describe("generateMetadata", () => {
  test.each([
    ["es", "La base de Feria, una tienda en línea para pequeños negocios"],
    ["en", "The base of Feria, an online store for small businesses"],
  ])("describes the app in %s", async (locale, description) => {
    const metadata = await generateMetadata({ params: makeParams(locale) });

    expect(metadata).toEqual({
      metadataBase: new URL("http://localhost:3000"),
      title: "Feria",
      description,
      icons: [{ rel: "icon", url: "/favicon.ico" }],
    });
  });

  test("describes an unknown language's 404 in Spanish, the default", async () => {
    const metadata = await generateMetadata({ params: makeParams("fr") });

    expect(metadata.description).toBe(
      "La base de Feria, una tienda en línea para pequeños negocios"
    );
  });

  test.each([undefined, ""])(
    "resolves page URLs against the deployment when the auth URL is %j",
    async (authUrl) => {
      vi.stubEnv("BETTER_AUTH_URL", authUrl);
      vi.stubEnv("VERCEL_URL", "feria-preview.example.com");

      const metadata = await generateMetadata({ params: makeParams("es") });

      expect(metadata.metadataBase).toEqual(
        new URL("https://feria-preview.example.com")
      );
    }
  );
});
