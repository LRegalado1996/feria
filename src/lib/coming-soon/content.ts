import type { Dictionary } from "@/content";
import { countdownTarget } from "@/lib/brand/fair";
import { BRAND_NAME } from "@/lib/brand/logo";
import { SOCIAL_LINKS } from "@/lib/brand/social";
import type { Locale } from "@/lib/i18n/config";
import { linesOf } from "@/lib/schemas/coming-soon";

/** The page as it is stored (`findComingSoon`): what an admin wrote. */
export interface StoredComingSoon {
  countdownTo: string | null;
  translations: readonly {
    eyebrow: string | null;
    headline: string | null;
    lead: string | null;
    locale: Locale;
    marquee: string | null;
  }[];
}

/** The store's own links, as its settings hold them (FER-014). */
export interface StoreSocialLinks {
  instagramUrl: string | null;
  tiktokUrl: string | null;
}

/** What the coming-soon page shows, in one language. */
export interface ComingSoonContent {
  /** The line over the headline: the fair and its dates. */
  eyebrow: string;
  /** The headline's display lines; the second is set in the accent color. */
  headline: string[];
  lead: string;
  /** The band's phrases, the brand's name first. */
  marquee: string[];
  /** The instant the countdown counts to. */
  opensAt: Date;
  /** Where "Seguinos" leads: the store's profiles, else the brand's. */
  social: { instagram: string; tiktok: string };
}

/** Each value once, in order: the lists key their items by their text. */
function distinct(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * The page's content in `locale` (FER-034): what the admin wrote in that
 * language, and the dictionary's copy for whatever is empty (`copy`, the
 * page's own language). Never another language's text: an English visitor
 * with only a Spanish headline saved reads the English default. The social
 * links are the store's settings' (`store`, as the footer's), each one the
 * brand's own profile (`SOCIAL_LINKS`) when the store has none or could not
 * be read (`null`), so the page always says where to follow it.
 */
export function resolveComingSoonContent(
  copy: Dictionary["comingSoon"],
  stored: StoredComingSoon,
  locale: Locale,
  store: StoreSocialLinks | null
): ComingSoonContent {
  const texts = stored.translations.find((row) => row.locale === locale);
  const headline = linesOf(texts?.headline ?? "");
  const marquee = linesOf(texts?.marquee ?? "");

  return {
    eyebrow: texts?.eyebrow ?? copy.eyebrow,
    headline: distinct(
      headline.length > 0 ? headline : [copy.title.lineOne, copy.title.lineTwo]
    ),
    lead: texts?.lead ?? copy.lead,
    marquee: distinct([
      BRAND_NAME,
      ...(marquee.length > 0
        ? marquee
        : [copy.marquee.products, copy.marquee.fair, copy.marquee.dates]),
    ]),
    opensAt: countdownTarget(stored.countdownTo),
    social: {
      instagram: store?.instagramUrl ?? SOCIAL_LINKS.instagram,
      tiktok: store?.tiktokUrl ?? SOCIAL_LINKS.tiktok,
    },
  };
}
