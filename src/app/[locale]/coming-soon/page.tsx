import type { Metadata, ResolvedMetadata } from "next";
import { connection } from "next/server";

import { StoreComingSoon } from "@/app/_components/organisms/store-coming-soon";
import { getDictionary } from "@/content";
import { BRAND_NAME } from "@/lib/brand/logo";
import {
  resolveComingSoonContent,
  type StoredComingSoon,
  type StoreSocialLinks,
} from "@/lib/coming-soon/content";
import { COMING_SOON_PATH } from "@/lib/coming-soon/paths";
import { buildAlternates } from "@/lib/i18n/metadata";
import { readLocale } from "@/lib/i18n/read-locale";
import { captureExceptionWithScope } from "@/lib/sentry";
import { within } from "@/lib/utils/within";
import { readComingSoon } from "@/server/cache/coming-soon";
import { readStore } from "@/server/cache/store";
import { SWITCH_TIMEOUT_MS } from "@/server/cache/storefront-switch";

// The page waits for its texts before anything is sent: they are the whole
// first screen, and a cached read is quick. This tells Next's
// instant-navigation check that the wait is intended.
export const instant = false;

interface ComingSoonPageProps {
  params: Promise<{ locale: string }>;
}

/** Nothing saved, or nothing readable: the dictionary's page. */
const DEFAULT_PAGE: StoredComingSoon = { countdownTo: null, translations: [] };

/**
 * What an admin saved, or the dictionary's page when the database cannot
 * say. The proxy sends the public here when it cannot read the switch
 * either, so this page must stand on its own through an outage, a stalled
 * database too: each read gets the switch's own time limit, and one that
 * outlasts it is reported and falls back like a failed one.
 */
async function readSavedPage(): Promise<StoredComingSoon> {
  try {
    return await within(
      readComingSoon(),
      SWITCH_TIMEOUT_MS,
      "The coming-soon page's read"
    );
  } catch (error) {
    captureExceptionWithScope(error, { action: "ComingSoon.read_page" });

    return DEFAULT_PAGE;
  }
}

/**
 * The store's social links (its settings, as the footer reads them), or
 * `null` when the store cannot be read: the page then links the brand's
 * own profiles, through an outage too.
 */
async function readSocialLinks(): Promise<StoreSocialLinks | null> {
  try {
    return await within(
      readStore(),
      SWITCH_TIMEOUT_MS,
      "The coming-soon page's store read"
    );
  } catch (error) {
    captureExceptionWithScope(error, { action: "ComingSoon.read_store" });

    return null;
  }
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
 * What every storefront address leads to while the coming-soon page is
 * published (FER-034: the proxy redirects there, `src/proxy.ts`), and what
 * an admin previews from the admin. Its eyebrow, headline, text, band and
 * countdown's day are the admin's (`readComingSoon`), the dictionary's where
 * empty; its social links the store's settings' (`readStore`), the brand's
 * where it has none. The screen itself is `organisms/store-coming-soon`:
 * storefront styles live in `store-*` components, and a route only places
 * them.
 */
export default async function ComingSoonPage({ params }: ComingSoonPageProps) {
  const locale = await readLocale(params);
  const { comingSoon } = getDictionary(locale);
  // The build has no database: the texts are read once a request is there.
  await connection();
  const [saved, store] = await Promise.all([
    readSavedPage(),
    readSocialLinks(),
  ]);

  return (
    <StoreComingSoon
      content={resolveComingSoonContent(comingSoon, saved, locale, store)}
      copy={comingSoon}
    />
  );
}
