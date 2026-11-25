import { BRAND_NAME } from "@/lib/brand/logo";
import type { Locale } from "@/lib/i18n/config";

/** The share card's size: what WhatsApp and the rest show large. */
export const SHARE_CARD_SIZE = { height: 630, width: 1200 } as const;

/**
 * The default share card (`app/[locale]/opengraph-image.tsx`) as an
 * `openGraph.images` entry, for a store page that has no picture of its
 * own. Next adds the card by itself only to a page that declares no
 * `openGraph`: one that does replaces the layout's whole, image included,
 * so each store page names the card again. The Spanish address keeps its
 * `/es`, which the proxy leaves alone, so a crawler gets the image in one
 * request; it resolves against the layout's `metadataBase`.
 */
export function defaultShareImage(locale: Locale) {
  return {
    alt: BRAND_NAME,
    ...SHARE_CARD_SIZE,
    type: "image/png",
    url: `/${locale}/opengraph-image`,
  };
}
