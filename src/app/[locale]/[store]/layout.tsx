import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

import { getStoreForPath } from "@/server/cache/store";
import type { PublicStore } from "@/server/services/store";

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

type StorePaletteStyle = CSSProperties &
  Record<`--store-${string}`, string | undefined>;

/**
 * The store's five colors over the storefront tokens. They are data, not
 * design: each was validated as a hex color when it was stored, by the schema
 * and again by a database check, so nothing else can reach this `style`.
 */
function toPaletteStyle(store: PublicStore): StorePaletteStyle {
  return {
    "--store-accent": store.colorAccent,
    "--store-background": store.colorBackground,
    "--store-contrast": store.colorContrast,
    "--store-foreground": store.colorForeground,
    "--store-surface": store.colorSurface,
  };
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
    <div
      className="min-h-screen bg-store-background text-store-foreground"
      // The muted colors are derived from the five; this attribute makes CSS
      // compute them again from this store's values (design.md § Storefront).
      data-store-palette=""
      data-slot="store-theme"
      data-testid="store-theme"
      style={toPaletteStyle(store)}
    >
      {children}
    </div>
  );
}
