import { ImageOff } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { StorePriceTag } from "@/app/_components/atoms/store-price-tag";
import { StoreSpotlightButton } from "@/app/_components/molecules/store-spotlight-button";
import type { Dictionary } from "@/content";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";
import type { Currency } from "@/lib/utils/format";

/** Words of the block in the language they are in. */
interface SpotlightWords {
  lang: string;
  text: string;
}

export interface StoreSpotlightProps {
  /** The article it features: its photo, name and price are the block's. */
  article: {
    cover: { alt: string; url: string } | null;
    currencyCode: Currency;
    id: number;
    /** The language of its name, which may differ from the page's. */
    lang: string;
    priceAmount: number;
    title: string;
  };
  className?: string;
  /**
   * Its words, from `getDictionary` on the server or `useDictionary` in the
   * browser, so the block renders in either.
   */
  copy: Dictionary["storefront"];
  /** The level the article's name takes in the page's outline. */
  headingLevel?: "h2" | "h3";
  /** Built by the caller with `localizePath()`. */
  href: string;
  /** Unique on the page: names the block by its heading. */
  id: number;
  /** The optional pill above the name ("Nuevo"). */
  label: SpotlightWords | null;
  locale: Locale;
  /** The optional short phrase under the price. */
  phrase: SpotlightWords | null;
}

/**
 * One article, large, between a page's rows (FER-059), after the dark
 * option of Lucas's mock: a block the width of the window on the moss, so
 * it breaks the white page where scrolling meets it. On a computer the
 * words on the left (an optional lime pill, the name huge in lime in the
 * display face, the price in white, an optional phrase in the moss's soft
 * tone, the lime "Agregar al carrito") and the photo on the right on the
 * grey tile; on a phone the photo first.
 *
 * Both follow the block's own width, never the window's: the admin's
 * preview is a narrow column on a computer, where the window's breakpoints
 * squeezed the name into half of it and broke "CORAZONES" mid-word. So the
 * block is a container that turns to two columns at the width `md` means
 * for a block the window's width, and the name is sized to its own column
 * (`store-display-spotlight`), so a word of ten letters fits on a line.
 *
 * The block is one link to the article and one button, never one inside
 * the other: the name is the anchor and its hit area is stretched over the
 * block (the photo, the label and the phrase lead there too), so it has a
 * single tab stop named after the article, and the button sits above that
 * area. The focus ring is drawn inside the block, lime on the moss. The
 * photo loads lazily in a square whose space is held before it arrives.
 */
function StoreSpotlight({
  article,
  className,
  copy,
  headingLevel: Heading = "h2",
  href,
  id,
  label,
  locale,
  phrase,
}: StoreSpotlightProps) {
  const headingId = `store-spotlight-${String(id)}`;

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "group @container relative bg-store-contrast text-store-background has-[a:focus-visible]:outline-3 has-[a:focus-visible]:-outline-offset-3 has-[a:focus-visible]:outline-store-accent",
        className
      )}
      data-slot="store-spotlight"
    >
      <div className="mx-auto grid max-w-7xl gap-5 px-4 pt-4 pb-8 @3xl:grid-cols-2 @3xl:items-center @3xl:gap-12 @3xl:p-12">
        <div
          className="relative aspect-square overflow-hidden bg-store-surface @3xl:order-last"
          data-slot="store-spotlight-tile"
        >
          {article.cover ? (
            <Image
              alt={article.cover.alt}
              className="object-cover motion-safe:transition-transform motion-safe:duration-700 motion-safe:ease-out motion-safe:group-hover:scale-102"
              fill
              sizes="(min-width: 1280px) 37rem, (min-width: 768px) 45vw, 100vw"
              src={article.cover.url}
            />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-2 text-sm text-store-muted">
              <ImageOff aria-hidden="true" className="size-12" />
              {copy.articleCard.noImage}
            </div>
          )}
        </div>
        <div
          className="@container flex min-w-0 flex-col items-start gap-4 @3xl:gap-5"
          data-slot="store-spotlight-words"
        >
          {label ? (
            <span
              className="rounded-full bg-store-accent px-3 py-1.5 font-display text-xs leading-none font-extrabold text-store-foreground uppercase"
              data-slot="store-spotlight-label"
              lang={label.lang}
            >
              {label.text}
            </span>
          ) : null}
          <Heading
            className="max-w-full font-display store-display-spotlight leading-display font-extrabold text-balance wrap-break-word text-store-accent uppercase"
            id={headingId}
          >
            <Link
              // The ring is drawn on the block, which the link covers.
              className="outline-none group-hover:underline group-hover:decoration-2 group-hover:underline-offset-8 after:absolute after:inset-0"
              href={href}
              lang={article.lang}
            >
              {article.title}
            </Link>
          </Heading>
          <StorePriceTag
            amount={article.priceAmount}
            className="text-store-background"
            currency={article.currencyCode}
            labels={copy.price}
            locale={locale}
            size="lg"
          />
          {phrase ? (
            <p
              className="max-w-[34ch] text-base text-store-contrast-muted @3xl:text-lg"
              data-slot="store-spotlight-phrase"
              lang={phrase.lang}
            >
              {phrase.text}
            </p>
          ) : null}
          <StoreSpotlightButton
            className="relative z-10 mt-1"
            priceAmount={article.priceAmount}
            productId={article.id}
            title={article.title}
          />
        </div>
      </div>
    </section>
  );
}

export { StoreSpotlight };
