import { connection } from "next/server";

import { StoreCountUp } from "@/app/_components/atoms/store-count-up";
import type { Dictionary } from "@/content";
import { daysUntil } from "@/lib/brand/fair";
import { cn } from "@/lib/utils";

export interface StoreFairCountdownProps {
  className?: string;
  /** The label after the figure, for one day and for more. */
  copy: Dictionary["comingSoon"]["countdown"];
  /** The instant it counts to: the fair's opening, or the admin's day. */
  opensAt: Date;
}

/** Reading the clock is request-time IO, hence `connection()`. */
async function readRequestInstant() {
  await connection();
  return Date.now();
}

/**
 * The days left until `opensAt` (the fair's opening unless an admin chose
 * another day, FER-034), as a figure that counts up. A server component that
 * reads the request's clock, so it goes inside a `<Suspense>`. From that
 * instant on there is nothing to count, and it renders nothing.
 */
async function StoreFairCountdown({
  className,
  copy,
  opensAt,
}: StoreFairCountdownProps) {
  const days = daysUntil(opensAt, await readRequestInstant());

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
        className="font-display store-display-figure leading-display font-extrabold text-store-accent"
        value={days}
      />
      <span className="pb-2 text-base font-medium">
        {days === 1 ? copy.one : copy.many}
      </span>
    </p>
  );
}

export { StoreFairCountdown };
