"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { StoreButton } from "@/app/_components/atoms/store-button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  useCarousel,
} from "@/app/_components/molecules/carousel";
import { useDictionary } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import { cn } from "@/lib/utils";

/**
 * A card's share of the row: two thirds of a phone, a quarter and a bit of
 * a computer. Its photo asks for as much (`STORE_CARD_SIZES.row`).
 */
const SLIDE_CLASS =
  "basis-[62%] pl-2.5 sm:basis-[40%] md:pl-3.5 lg:basis-[23.5%]";

export interface StoreArticleRowProps {
  className?: string;
  /** The level its heading takes in the page's outline. */
  headingLevel?: "h2" | "h3";
  /** One card each, keyed by a stable id: rendered by the server. */
  items: readonly { content: ReactNode; id: string }[];
  /** The row's heading, which names its carousel too. */
  title: string;
  /** Where "Ver todo" leads; without it there is no such link. */
  viewAllHref?: string;
}

/**
 * The round lime arrow over the row's last card: the next screenful, or back
 * to the start once the end is reached. Never more than one: rows neither
 * loop nor move on their own (FER-039). Gone when every card fits.
 */
function RowArrow({ title }: { title: string }) {
  const copy = useDictionary().storefront.row;
  const { canScrollNext, scrollNext, scrollTo, snapCount } = useCarousel();

  if (snapCount <= 1) {
    return null;
  }

  return (
    // As tall as a card's square photo, at the row's right edge, so the
    // arrow sits halfway down the photo whatever the screen.
    <div className="pointer-events-none absolute top-0 right-0 flex aspect-square w-[62%] items-center justify-end sm:w-[40%] lg:w-[23.5%]">
      <StoreButton
        aria-label={interpolate(canScrollNext ? copy.next : copy.restart, {
          title,
        })}
        className="pointer-events-auto mr-1 shadow-lg md:mr-3.5"
        data-slot="store-article-row-arrow"
        onClick={() => {
          if (canScrollNext) {
            scrollNext();
          } else {
            scrollTo(0);
          }
        }}
        size="icon-lg"
      >
        {canScrollNext ? (
          <ArrowRight aria-hidden="true" />
        ) : (
          <ArrowLeft aria-hidden="true" />
        )}
      </StoreButton>
    </div>
  );
}

/**
 * A row of articles (FER-039): a heading, "Ver todo" on the right, and the
 * cards in a carousel that a finger or a mouse drags, a trackpad swipes, the
 * keyboard steps through, and the round arrow pages. On the home and under an
 * article, for the articles beside it.
 */
function StoreArticleRow({
  className,
  headingLevel: Heading = "h2",
  items,
  title,
  viewAllHref,
}: StoreArticleRowProps) {
  const copy = useDictionary().storefront.row;

  return (
    <section
      className={cn("px-4 py-9 md:px-7 md:py-13", className)}
      data-slot="store-article-row"
    >
      <div className="mb-4 flex items-baseline justify-between gap-4 md:mb-5.5">
        <Heading className="font-display store-display-section leading-display font-extrabold wrap-anywhere uppercase">
          {title}
        </Heading>
        {viewAllHref ? (
          <Link
            aria-label={interpolate(copy.viewAllOf, { title })}
            className="inline-flex min-h-11 shrink-0 items-center font-display text-xs font-extrabold uppercase underline decoration-2 underline-offset-6 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground"
            href={viewAllHref}
          >
            {copy.viewAll}
          </Link>
        ) : null}
      </div>
      <Carousel
        aria-label={title}
        opts={{
          align: "start",
          containScroll: "trimSnaps",
          slidesToScroll: "auto",
        }}
      >
        <CarouselContent className="-ml-2.5 md:-ml-3.5">
          {items.map((item, index) => (
            <CarouselItem
              className={SLIDE_CLASS}
              index={index}
              key={item.id}
              total={items.length}
            >
              {item.content}
            </CarouselItem>
          ))}
        </CarouselContent>
        <RowArrow title={title} />
      </Carousel>
    </section>
  );
}

export { StoreArticleRow };
