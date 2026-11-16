import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { StoreFooter } from "@/app/_components/organisms/store-footer";
import {
  STORE_MAIN_ID,
  StoreHeader,
} from "@/app/_components/organisms/store-header";
import { StoreTheme } from "@/app/_components/organisms/store-theme";
import { getDictionary } from "@/content";
import { pickTranslation } from "@/lib/i18n/pick-translation";
import { readLocale } from "@/lib/i18n/read-locale";
import { getStoreForPath } from "@/server/cache/store";

interface StoreLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string; store: string }>;
}

/**
 * A segment that can never be a store (the slug pattern has no underscore),
 * so it is prerendered as a 404 without a query.
 */
const SAMPLE_SEGMENT = "__sample__";

/**
 * Stores are not known at build time, and this still returns a sample: with
 * one, Next renders each address in full on its first visit and keeps the
 * result, so the lookup below runs before anything is sent and an address
 * that is not a store answers a real 404. Without it the route would be a
 * shell that streams, which is committed to a 200 before the lookup ends.
 */
export function generateStaticParams() {
  return [{ store: SAMPLE_SEGMENT }];
}

/**
 * A store's defaults for every page below: titles end in the store's name,
 * the description is its tagline, and the share card names it.
 */
export async function generateMetadata({
  params,
}: Omit<StoreLayoutProps, "children">): Promise<Metadata> {
  const locale = await readLocale(params);
  const { store: segment } = await params;
  const store = await getStoreForPath(segment);

  if (!store) {
    return {};
  }

  const tagline = pickTranslation(store.translations, locale)?.tagline;

  return {
    description: tagline,
    // The whole object replaces the root layout's: its type comes along.
    openGraph: { description: tagline, siteName: store.name, type: "website" },
    title: { default: store.name, template: `%s · ${store.name}` },
  };
}

/** The browser's bar takes the store's background, as on its pages. */
export async function generateViewport({
  params,
}: Omit<StoreLayoutProps, "children">): Promise<Viewport> {
  const { store: segment } = await params;
  const store = await getStoreForPath(segment);

  return store ? { themeColor: store.colorBackground } : {};
}

/**
 * Every public page of a store, wearing that store's colors, between its
 * header and its footer (FER-021). Chrome only: it
 * decides nothing about who may see what (the storefront has no session). An
 * address that is not an active store answers 404 here, for every page below.
 */
export default async function StoreLayout({
  children,
  params,
}: StoreLayoutProps) {
  const locale = await readLocale(params);
  const { store: segment } = await params;
  const store = await getStoreForPath(segment);

  if (!store) {
    notFound();
  }

  const copy = getDictionary(locale).storefront.shell;
  const text = pickTranslation(store.translations, locale);

  return (
    <StoreTheme
      data-testid="store-theme"
      palette={{
        accent: store.colorAccent,
        background: store.colorBackground,
        contrast: store.colorContrast,
        foreground: store.colorForeground,
        surface: store.colorSurface,
      }}
      className="flex min-h-dvh flex-col"
    >
      <StoreHeader copy={copy} locale={locale} store={store} />
      {/* Its top clears the sticky header when the skip link scrolls to it. */}
      <div
        className="flex-1 scroll-mt-16"
        data-testid="store-main"
        id={STORE_MAIN_ID}
        tabIndex={-1}
      >
        {children}
      </div>
      <StoreFooter
        copy={copy}
        store={store}
        tagline={text ? { lang: text.locale, text: text.tagline } : null}
      />
    </StoreTheme>
  );
}
