import {
  type LucideIcon,
  Search,
  ShoppingBag,
  Truck,
  Wallet,
} from "lucide-react";
import { useId } from "react";

import type { Dictionary } from "@/content";
import { cn } from "@/lib/utils";

export interface StoreHowToBuyProps {
  className?: string;
  /**
   * Its words, from `getDictionary` on the server or `useDictionary` in the
   * browser, so the block renders in either.
   */
  copy: Pick<Dictionary["storefront"], "howToBuy">;
  /** The level its title takes in the page's outline. */
  headingLevel?: "h2" | "h3";
}

/**
 * What to know, in the order it happens, each with its icon: choosing,
 * the cart, the delivery, and how to pay.
 */
const STEPS = [
  ["choose", Search],
  ["cart", ShoppingBag],
  ["delivery", Truck],
  ["pay", Wallet],
] as const satisfies readonly (readonly [string, LucideIcon])[];

/**
 * How to buy, as a block of a page (FER-076, made lighter in FER-086): on
 * the store's light grey (the photos' tile, apart from the page's own
 * background), four small moss circles
 * with a lime icon (as the order's stepper draws a step), each with its
 * name in the display face's small capitals and one short line under it
 * (two lines each on a computer):
 * choosing, the cart, the delivery and the ways to pay. Its title ("Cómo
 * comprar") is for a screen reader and a crawler only: the circles say it
 * to the eye. The icons are decoration.
 *
 * The circles stack on a phone, sit two by two on a narrow block and four
 * in a row once the block itself is wide enough, each column as wide as its
 * words (the longest line is the last) and the row spread across the block,
 * so no line breaks on a computer. It follows its own width,
 * not the window's, since the admin's preview is a narrow column on a
 * computer (as `molecules/store-spotlight`). Nothing here moves on its own;
 * the page's sections rise into view like every other one
 * (`atoms/store-reveal`).
 */
function StoreHowToBuy({
  className,
  copy,
  headingLevel: Heading = "h2",
}: StoreHowToBuyProps) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "@container bg-store-surface text-store-foreground",
        className
      )}
      data-slot="store-how-to-buy"
      data-testid="store-how-to-buy"
    >
      <div className="mx-auto max-w-7xl px-4 py-8 @3xl:px-12 @3xl:py-10">
        <Heading className="sr-only" id={headingId}>
          {copy.howToBuy.label}
        </Heading>
        <ol
          className="grid gap-5 @3xl:grid-cols-2 @3xl:gap-x-8 @6xl:grid-cols-[repeat(4,auto)] @6xl:justify-between"
          data-slot="store-how-to-buy-steps"
        >
          {STEPS.map(([step, Icon]) => (
            <li
              className="flex min-w-0 items-start gap-3"
              data-slot="store-how-to-buy-step"
              key={step}
            >
              <span
                aria-hidden="true"
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-store-contrast text-store-accent [&_svg]:size-5"
              >
                <Icon />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="font-display text-sm leading-tight font-extrabold wrap-break-word uppercase">
                  {copy.howToBuy.steps[step].title}
                </p>
                <p className="mt-1 text-sm text-store-muted">
                  {copy.howToBuy.steps[step].text}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export { StoreHowToBuy };
