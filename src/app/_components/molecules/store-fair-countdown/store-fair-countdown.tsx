import { connection } from "next/server";

import { StoreCountUp } from "@/app/_components/atoms/store-count-up";
import type { Dictionary } from "@/content";
import { daysUntilFair } from "@/lib/brand/fair";
import { cn } from "@/lib/utils";

export interface StoreFairCountdownProps {
  className?: string;
  /** The label after the figure, for one day and for more. */
  copy: Dictionary["comingSoon"]["countdown"];
}

/** Reading the clock is request-time IO, hence `connection()`. */
async function readRequestInstant() {
  await connection();
  return Date.now();
}

/**
 * The days left until the fair, as a figure that counts up. A server
 * component that reads the request's clock, so it goes inside a `<Suspense>`
 * and the page around it stays prerendered. From the opening day on there is
 * nothing to count, and it renders nothing.
 */
async function StoreFairCountdown({
  className,
  copy,
}: StoreFairCountdownProps) {
  const days = daysUntilFair(await readRequestInstant());

  if (days === 0) {
    return null;
  }

  return (
    <p
      className={cn("flex flex-wrap items-end gap-x-4 gap-y-1", className)}
      data-slot="store-fair-countdown"
      data-testid="fair-countdown"
    >
      <StoreCountUp
        className="font-display store-display-figure leading-display font-normal tracking-display text-store-accent"
        value={days}
      />
      <span className="pb-2 text-base font-medium">
        {days === 1 ? copy.one : copy.many}
      </span>
    </p>
  );
}

export { StoreFairCountdown };
