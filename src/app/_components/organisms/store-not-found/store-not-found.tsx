import { ArrowRight, SearchX } from "lucide-react";
import Link from "next/link";

import { StoreArrowLink } from "@/app/_components/atoms/store-arrow-link";
import { StoreButton } from "@/app/_components/atoms/store-button";
import { StoreEyebrow } from "@/app/_components/atoms/store-eyebrow";
import type { Dictionary } from "@/content";
import { cn } from "@/lib/utils";

export interface StoreNotFoundProps {
  /** Where the main action leads: the catalog, in the page's language. */
  catalogHref: string;
  className?: string;
  copy: Dictionary["storefront"]["shell"]["notFound"];
  /** The way back home, in the page's language. */
  homeHref: string;
}

/**
 * An address the site does not answer (FER-069), as one lime block under
 * the store's moss header (the lime logo cannot sit on lime): a large ink
 * "404" says what went wrong without a color, the "Error 404" label and a
 * plain heading say it in words, and the catalog is the one main action,
 * the ink pill with lime words, the home beside it. Ink on the lime is
 * 14.1:1. It reads nothing of the store, so it shows the same for every
 * address, in the page's language.
 */
function StoreNotFound({
  catalogHref,
  className,
  copy,
  homeHref,
}: StoreNotFoundProps) {
  return (
    <main
      className={cn("flex w-full flex-1 flex-col", className)}
      data-slot="store-not-found"
      data-testid="store-not-found"
    >
      <section className="flex flex-1 flex-col gap-5 bg-store-accent px-4 py-10 text-store-foreground lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-10 lg:px-12 lg:py-20">
        {/* A figure, not a word: the label and the heading say it to a
            screen reader. First on a phone, beside the words from lg up. */}
        <p
          aria-hidden="true"
          className="font-display store-display-not-found leading-[0.8] font-extrabold tracking-[-0.01em] whitespace-nowrap lg:order-last"
          data-testid="store-not-found-figure"
        >
          404
        </p>
        <div className="flex min-w-0 flex-col items-start gap-4">
          <StoreEyebrow
            className="inline-flex items-center gap-2 rounded-full bg-store-foreground py-2 pr-3.5 pl-2.5 leading-none text-store-accent"
            data-testid="store-not-found-label"
          >
            <SearchX aria-hidden="true" className="size-4" />
            {copy.eyebrow}
          </StoreEyebrow>
          <h1 className="max-w-4xl font-display store-display-banner leading-display font-extrabold wrap-anywhere uppercase">
            {copy.title}
          </h1>
          <p className="max-w-prose text-base md:text-lg">{copy.body}</p>
          <div className="mt-2 flex flex-col items-stretch gap-1.5 self-stretch sm:mt-4 sm:flex-row sm:items-center sm:gap-6 sm:self-auto">
            <StoreButton asChild size="lg">
              <Link data-testid="store-not-found-catalog" href={catalogHref}>
                {copy.catalog}
                <ArrowRight aria-hidden="true" />
              </Link>
            </StoreButton>
            <StoreArrowLink
              className="justify-center sm:justify-start"
              data-testid="store-not-found-home"
              href={homeHref}
            >
              {copy.back}
            </StoreArrowLink>
          </div>
        </div>
      </section>
    </main>
  );
}

export { StoreNotFound };
