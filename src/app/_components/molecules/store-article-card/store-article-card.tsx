import { ImageOff } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

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
  /**
   * A control under the price (add to cart): drawn above the card's
   * stretched link, so it is its own tab stop and its own click.
   */
  action?: ReactNode;
  className?: string;
  /** The heading level the card's name takes in the page's outline. */
  headingLevel?: "h2" | "h3";
  /** Built by the caller with `localizePath()`. */
  href: string;
  /** `null` while the article has no photo. */
  image: { alt: string; src: string } | null;
  /** Marks a recent article. A reduced price outranks it: one badge a card. */
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
  /** Marks an article that cannot be bought now; it outranks every badge. */
  unavailable?: boolean;
};

/**
 * An article in a grid or a slider: its photo, its name and its price. The
 * whole card is one link, named after the article: the name is the anchor and
 * its hit area is stretched over the card, so there is one tab stop and no
 * interactive element inside another.
 */
function StoreArticleCard({
  action,
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
  unavailable = false,
}: StoreArticleCardProps) {
  const articleCard = labels.card;
  const sale = previousAmount !== null && previousAmount > amount;

  return (
    <article
      className={cn(
        "group relative flex flex-col gap-3 text-store-foreground has-[a:focus-visible]:outline-3 has-[a:focus-visible]:outline-offset-4 has-[a:focus-visible]:outline-store-foreground",
        className
      )}
      data-slot="store-article-card"
    >
      <div className="relative aspect-4/5 overflow-hidden bg-store-line">
        {image ? (
          <Image
            alt={image.alt}
            className="object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none"
            fill
            // A card is 280px in a desktop row and about two thirds of a
            // phone's width in a slider.
            sizes="(min-width: 768px) 280px, 65vw"
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
        {unavailable ? (
          <StoreBadge className="absolute top-3 left-3" tone="contrast">
            {articleCard.unavailable}
          </StoreBadge>
        ) : null}
        {sale && !unavailable ? (
          <StoreBadge className="absolute top-3 left-3" tone="contrast">
            {articleCard.badgeSale}
          </StoreBadge>
        ) : null}
        {isNew && !sale && !unavailable ? (
          <StoreBadge className="absolute top-3 left-3" tone="accent">
            {articleCard.badgeNew}
          </StoreBadge>
        ) : null}
      </div>
      <Heading className="font-display store-display-title leading-none font-normal tracking-display uppercase">
        <Link
          // The focus ring is drawn on the card, which is what the link covers.
          className="outline-none after:absolute after:inset-0"
          href={href}
          lang={nameLang}
        >
          {name}
        </Link>
      </Heading>
      <StorePriceTag
        amount={amount}
        currency={currency}
        labels={labels.price}
        locale={locale}
        previousAmount={previousAmount}
      />
      {action ? <div className="relative z-10">{action}</div> : null}
    </article>
  );
}

export { StoreArticleCard };
