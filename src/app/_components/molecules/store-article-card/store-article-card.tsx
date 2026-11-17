import { ImageOff } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { StoreBadge } from "@/app/_components/atoms/store-badge";
import {
  StorePriceTag,
  type StorePriceTagProps,
} from "@/app/_components/atoms/store-price-tag";
import type { Dictionary } from "@/content";
import { cn } from "@/lib/utils";

export type StoreArticleCardProps = Pick<
  StorePriceTagProps,
  "amount" | "currency" | "locale" | "previousAmount"
> & {
  className?: string;
  /** The heading level the card's name takes in the page's outline. */
  headingLevel?: "h2" | "h3";
  /** Built by the caller with `localizePath()`. */
  href: string;
  /** `null` while the article has no photo. */
  image: { alt: string; src: string } | null;
  /** Marks a recent article with a label on its tile, unless it is sold out. */
  isNew?: boolean;
  /**
   * Its words, from `getDictionary` on the server or `useDictionary` in the
   * browser, so the card renders in either.
   */
  labels: {
    card: Dictionary["storefront"]["articleCard"];
    price: Dictionary["storefront"]["price"];
  };
  name: string;
  /**
   * The language the name is in, when it may differ from the page's (an
   * article with no English title on an English page): set on the name
   * only, never on the card's interface text.
   */
  nameLang?: string;
  /**
   * The photo's widths for the browser to pick from, as the caller lays
   * cards out: one of `STORE_CARD_SIZES`.
   */
  sizes?: string;
  /** Marks an article that cannot be bought now: its price says "Agotado". */
  unavailable?: boolean;
};

/**
 * How wide a card's photo is shown, for the browser to pick a file: in a
 * grid of four columns on a computer and two on a phone, or as a slide of
 * `molecules/store-article-row` (a quarter of a computer, two thirds of a
 * phone). In this module, which the server can read, not in the row's.
 */
export const STORE_CARD_SIZES = {
  grid: "(min-width: 768px) 25vw, 50vw",
  row: "(min-width: 1024px) 24vw, (min-width: 640px) 40vw, 62vw",
} as const;

/**
 * An article in a grid or a row (FER-039): its photo on a grey tile, cropped
 * square, an optional "Nuevo" label on the tile's corner, the name in the
 * display face and the price in regular type. Sold out, the name dims and
 * the price line says so. The whole card is one link, named after the
 * article: the name is the anchor and its hit area is stretched over the
 * card, so there is one tab stop and no interactive element inside another.
 */
function StoreArticleCard({
  amount,
  className,
  currency,
  headingLevel: Heading = "h3",
  href,
  image,
  isNew = false,
  labels,
  locale,
  name,
  nameLang,
  previousAmount = null,
  sizes = STORE_CARD_SIZES.grid,
  unavailable = false,
}: StoreArticleCardProps) {
  const articleCard = labels.card;

  return (
    <article
      className={cn(
        // The ring is drawn inside the card: a row clips what sticks out.
        "group relative flex min-w-0 flex-col text-store-foreground has-[a:focus-visible]:outline-3 has-[a:focus-visible]:-outline-offset-3 has-[a:focus-visible]:outline-store-foreground",
        className
      )}
      data-slot="store-article-card"
      data-unavailable={unavailable}
    >
      <div
        className="relative aspect-square overflow-hidden bg-store-surface"
        data-slot="store-article-card-tile"
      >
        {image ? (
          <Image
            alt={image.alt}
            className={cn(
              "object-cover motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-103",
              unavailable && "opacity-60"
            )}
            fill
            sizes={sizes}
            src={image.src}
          />
        ) : (
          <div
            className="flex size-full flex-col items-center justify-center gap-2 text-sm text-store-muted"
            data-slot="store-article-card-no-image"
          >
            <ImageOff aria-hidden="true" className="size-12" />
            {articleCard.noImage}
          </div>
        )}
        {isNew && !unavailable ? (
          <StoreBadge className="absolute top-2.5 left-2.5">
            {articleCard.badgeNew}
          </StoreBadge>
        ) : null}
      </div>
      <Heading
        className={cn(
          "mt-3 mb-1 font-display text-xs leading-tight font-extrabold wrap-anywhere uppercase group-hover:underline group-hover:underline-offset-4",
          unavailable && "text-store-muted"
        )}
      >
        <Link
          // The focus ring is drawn on the card, which is what the link covers.
          className="outline-none after:absolute after:inset-0"
          href={href}
          lang={nameLang}
        >
          {name}
        </Link>
      </Heading>
      {unavailable ? (
        <p
          className="text-sm text-store-muted"
          data-slot="store-article-card-sold-out"
        >
          {articleCard.unavailable}
        </p>
      ) : (
        <StorePriceTag
          amount={amount}
          currency={currency}
          labels={labels.price}
          locale={locale}
          previousAmount={previousAmount}
        />
      )}
    </article>
  );
}

export { StoreArticleCard };
