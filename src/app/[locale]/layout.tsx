import "@/styles/globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { Anton, Geist } from "next/font/google";
import type { ReactNode } from "react";

import { EnvironmentMarker } from "@/app/_components/molecules/environment-marker";
import { AppProviders } from "@/app/_components/organisms/app-providers";
import { getDictionary } from "@/content";
import { BRAND_NAME } from "@/lib/brand/logo";
import { DEFAULT_LOCALE, isLocale, LOCALES } from "@/lib/i18n/config";
import { readLocale } from "@/lib/i18n/read-locale";
import { getBaseUrl } from "@/lib/orpc/get-base-url";

interface LocaleParams {
  params: Promise<{ locale: string }>;
}

/**
 * Both languages are known at build time, so the shell of every page is
 * prerendered once per language and `params` resolves without a request.
 */
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LocaleParams): Promise<Metadata> {
  const { locale } = await params;
  const { metadata } = getDictionary(
    isLocale(locale) ? locale : DEFAULT_LOCALE
  );
  // An empty variable is an unset one: `new URL("")` throws.
  const appUrl = process.env.BETTER_AUTH_URL;

  return {
    // What the canonical and `hreflang` URLs each page declares resolve
    // against: the same origin the auth server answers on. Read while the
    // shell is prerendered, so it is the origin the build was made for.
    metadataBase: new URL(
      appUrl === undefined || appUrl === "" ? getBaseUrl() : appUrl
    ),
    title: metadata.title,
    description: metadata.description,
    // The share card's text. Next adds its image by itself from
    // `opengraph-image.tsx` beside this file, as it adds the tab and
    // home-screen icons from `app/icon.tsx` and `app/apple-icon.tsx`.
    openGraph: {
      description: metadata.description,
      siteName: BRAND_NAME,
      title: metadata.title,
      type: "website",
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Zoom stays available (no `maximumScale`, no `userScalable: false`):
  // locking it shuts low-vision users out of the page on mobile.
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

// The storefront's display face (design.md § Storefront). It has one weight.
const anton = Anton({
  subsets: ["latin"],
  variable: "--font-anton",
  weight: "400",
});

export default async function RootLayout({
  children,
  params,
}: Readonly<LocaleParams & { children: ReactNode }>) {
  // The proxy only ever routes a known language here; anything else is a
  // request that went around it, and gets a 404.
  const locale = await readLocale(params);

  return (
    // next-themes sets the theme class on <html> before React hydrates, so
    // the server's markup cannot know it.
    <html
      className={`${geist.variable} ${anton.variable}`}
      lang={locale}
      suppressHydrationWarning
    >
      <body>
        {/* First in <body>: chrome rendered later at the same z-index paints
            over the line, never the other way round. */}
        <EnvironmentMarker locale={locale} />
        <AppProviders dictionary={getDictionary(locale)} locale={locale}>
          {children}
        </AppProviders>
        {/* Vercel serves their scripts once Analytics and Speed Insights are
            enabled in the project; anywhere else the scripts 404. */}
        {process.env.VERCEL === "1" ? (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        ) : null}
      </body>
    </html>
  );
}
