import type { Locale } from "@/lib/i18n/config";

/**
 * What publishing an article still needs (FER-010), in the order the wizard
 * lists them and the server names them.
 */
export const PUBLISH_GAPS = [
  "image",
  "category",
  "price",
  "spanishTitle",
  "englishTitle",
] as const;

export type PublishGap = (typeof PUBLISH_GAPS)[number];

/**
 * The one rule for "ready to publish": at least one image, a category, a
 * price, a Spanish title, and a title in every other language the article
 * has texts in. A draft may have a blank title (FER-017); a published article
 * never shows one, since the storefront shows a language's row whole once it
 * exists (`pickTranslation`). The wizard (FER-017) shows the answer as the
 * article is typed; the service re-derives it at commit and that answer wins.
 */
export function resolvePublishGaps(article: {
  categoryId: number | null;
  imageCount: number;
  priceAmount: number | null;
  translations: readonly { locale: Locale; title: string }[];
}): PublishGap[] {
  const gaps: PublishGap[] = [];
  const titled = (locale: Locale) =>
    article.translations.some(
      (row) => row.locale === locale && row.title.trim() !== ""
    );

  if (article.imageCount === 0) {
    gaps.push("image");
  }

  if (article.categoryId === null) {
    gaps.push("category");
  }

  if (article.priceAmount === null) {
    gaps.push("price");
  }

  if (!titled("es")) {
    gaps.push("spanishTitle");
  }

  if (
    article.translations.some((row) => row.locale === "en") &&
    !titled("en")
  ) {
    gaps.push("englishTitle");
  }

  return gaps;
}

const REFUSAL = "The article cannot be published yet. Missing: ";

/**
 * The message of the server's refusal to publish, naming the gaps. It is
 * the one place that writes it, and `readPublishRefusal` the one that
 * reads it, so the wizard can mark each gap at its field.
 */
export function publishRefusalMessage(gaps: readonly PublishGap[]): string {
  return `${REFUSAL}${gaps.join(", ")}`;
}

/**
 * The gaps a refusal to publish names, in the rule's order, or `null` for
 * any other message (or one that names no known gap).
 */
export function readPublishRefusal(message: string): PublishGap[] | null {
  if (!message.startsWith(REFUSAL)) {
    return null;
  }

  const listed = new Set(message.slice(REFUSAL.length).split(", "));
  const gaps = PUBLISH_GAPS.filter((gap) => listed.has(gap));

  return gaps.length > 0 ? gaps : null;
}
