import type { Metadata, ResolvedMetadata } from "next";

import { StoreComingSoon } from "@/app/_components/organisms/store-coming-soon";
import { getDictionary } from "@/content";
import { BRAND_NAME } from "@/lib/brand/logo";
import { COMING_SOON_PATH } from "@/lib/env/launch";
import { buildAlternates } from "@/lib/i18n/metadata";
import { readLocale } from "@/lib/i18n/read-locale";

interface ComingSoonPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata(
  { params }: ComingSoonPageProps,
  // What Next resolved above this page; only its share card is read.
  parent: Promise<Pick<ResolvedMetadata, "openGraph">>
): Promise<Metadata> {
  const locale = await readLocale(params);
  const { comingSoon } = getDictionary(locale);
  const inherited = await parent;

  return {
    alternates: buildAlternates(COMING_SOON_PATH, locale),
    description: comingSoon.metaDescription,
    openGraph: {
      description: comingSoon.metaDescription,
      // A page's `openGraph` replaces the layout's whole: without this the
      // share card would lose the brand's image.
      images: inherited.openGraph?.images ?? [],
      siteName: BRAND_NAME,
      title: comingSoon.metaTitle,
      type: "website",
    },
    // The page stands in for a store that is not there yet: a search engine
    // should come back, not keep it.
    robots: { follow: false, index: false },
    title: comingSoon.metaTitle,
  };
}

/**
 * What every storefront address leads to until the store opens (the proxy
 * redirects there while the launch switch is off, `src/lib/env/launch.ts`).
 * The screen itself is `organisms/store-coming-soon`: storefront styles live
 * in `store-*` components, and a route only places them.
 */
export default async function ComingSoonPage({ params }: ComingSoonPageProps) {
  const locale = await readLocale(params);
  const { comingSoon } = getDictionary(locale);

  return <StoreComingSoon copy={comingSoon} />;
}
