import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import { StoreButton } from "@/app/_components/atoms/store-button";
import type { Dictionary } from "@/content";
import { cn } from "@/lib/utils";

export interface StoreHowToBuyProps {
  className?: string;
  /**
   * Its words, from `getDictionary` on the server or `useDictionary` in the
   * browser, so the block renders in either.
   */
  copy: Pick<Dictionary["storefront"], "howToBuy" | "payments">;
  /** The level its title takes in the page's outline. */
  headingLevel?: "h2" | "h3";
  /** The catalog, built by the caller with `localizePath()`. */
  href: string;
}

/** The steps in the order they happen: the list's own order says it. */
const STEPS = ["choose", "cart", "delivery"] as const;

/** The ways to pay, in the order Lucas gave them. */
const PAYMENTS = ["cash", "cards", "mercadoPago", "transfer"] as const;

/**
 * How to buy, as a block of a page (FER-076): what used to be a picture in
 * the cover's carousel, now words a crawler and a screen reader read. A
 * block the window's width on the moss, like the article spotlight: its
 * title in lime, the three steps as an ordered list (each a large lime
 * figure, its name in the display face and one line under it), then how to
 * pay as a list of quiet pills and the way into the catalog, the lime pill.
 *
 * The steps stack on a phone, the figure beside its words, and sit side by
 * side once the block itself is wide enough: it follows its own width, not
 * the window's, since the admin's preview is a narrow column on a computer
 * (as `molecules/store-spotlight`). The figures are decoration: the list
 * already says which step is which, so a screen reader hears "1 of 3",
 * never "zero one". Nothing here moves on its own; the page's sections
 * rise into view like every other one (`atoms/store-reveal`).
 */
function StoreHowToBuy({
  className,
  copy,
  headingLevel: Heading = "h2",
  href,
}: StoreHowToBuyProps) {
  const headingId = useId();
  const paymentsId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "@container bg-store-contrast text-store-background",
        className
      )}
      data-slot="store-how-to-buy"
      data-testid="store-how-to-buy"
    >
      <div className="mx-auto max-w-7xl px-4 py-10 @3xl:px-12 @3xl:py-14">
        <Heading
          className="font-display store-display-page leading-display font-extrabold text-balance text-store-accent uppercase"
          id={headingId}
        >
          {copy.howToBuy.title}
        </Heading>
        <ol
          className="mt-6 grid @3xl:mt-9 @3xl:grid-cols-3 @3xl:gap-x-10"
          data-slot="store-how-to-buy-steps"
        >
          {STEPS.map((step, index) => (
            <li
              className="flex min-w-0 items-start gap-4 border-t border-store-background/15 py-5 @3xl:flex-col @3xl:gap-5 @3xl:py-7"
              data-slot="store-how-to-buy-step"
              key={step}
            >
              <span
                aria-hidden="true"
                className="shrink-0 font-display store-display-figure leading-none font-extrabold text-store-accent tabular-nums"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 pt-1.5 @3xl:pt-0">
                <p className="font-display store-display-section leading-display font-extrabold wrap-break-word uppercase">
                  {copy.howToBuy.steps[step].title}
                </p>
                <p className="mt-2 text-base text-store-contrast-muted">
                  {copy.howToBuy.steps[step].text}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-6 border-t border-store-background/15 pt-6 @3xl:flex-row @3xl:items-end @3xl:justify-between @3xl:pt-7">
          <div className="min-w-0">
            <p
              className="font-display text-xs leading-none font-extrabold text-store-accent uppercase"
              id={paymentsId}
            >
              {copy.payments.title}
            </p>
            <ul
              aria-labelledby={paymentsId}
              className="mt-3.5 flex flex-wrap gap-2"
              data-slot="store-how-to-buy-payments"
            >
              {PAYMENTS.map((payment) => (
                <li
                  className="rounded-full border border-store-background/15 px-3.5 py-2 text-sm leading-none"
                  key={payment}
                >
                  {copy.payments[payment]}
                </li>
              ))}
            </ul>
          </div>
          <StoreButton
            asChild
            className="self-start focus-visible:outline-store-accent @3xl:self-auto"
            size="lg"
            variant="accent"
          >
            <Link href={href}>
              {copy.howToBuy.browse}
              <ArrowRight aria-hidden="true" />
            </Link>
          </StoreButton>
        </div>
      </div>
    </section>
  );
}

export { StoreHowToBuy };
