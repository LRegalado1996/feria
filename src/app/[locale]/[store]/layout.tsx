import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { StoreTheme } from "@/app/_components/organisms/store-theme";
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
 * Every public page of a store, wearing that store's colors. Chrome only: it
 * decides nothing about who may see what (the storefront has no session). An
 * address that is not an active store answers 404 here, for every page below.
 */
export default async function StoreLayout({
  children,
  params,
}: StoreLayoutProps) {
  const { store: segment } = await params;
  const store = await getStoreForPath(segment);

  if (!store) {
    notFound();
  }

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
    >
      {children}
    </StoreTheme>
  );
}
