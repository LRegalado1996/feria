"use client";

import { ArrowRight, CircleAlert, CircleCheck } from "lucide-react";
import { useId } from "react";

import { Button } from "@/app/_components/atoms/button";
import type { PublishGap } from "@/lib/catalog/publish-gaps";
import { useDictionary } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import { cn } from "@/lib/utils";

export interface ProductPublishGapsProps {
  className?: string;
  /** What publishing still needs, in the rule's order. */
  gaps: readonly PublishGap[];
  /** Its heading's level where it sits: under a step's, or the page's. */
  headingLevel?: "h2" | "h3";
  /** Takes the person to the field that fills `gap`. */
  onJump: (gap: PublishGap) => void;
}

/**
 * What publishing an article still needs (FER-010's rule, FER-017's
 * review): each missing thing a button that leads to its field, in an
 * amber panel; nothing missing, an emerald line that says it is ready.
 * Never color alone: an icon and the words say it too.
 */
function ProductPublishGaps({
  className,
  gaps,
  headingLevel: Heading = "h3",
  onJump,
}: ProductPublishGapsProps) {
  const copy = useDictionary().articles.wizard.gaps;
  const titleId = useId();

  if (gaps.length === 0) {
    return (
      <p
        className={cn(
          // emerald-900 on emerald-50: 9.7:1; emerald-100 on emerald-950: 11:1.
          "flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100",
          className
        )}
        data-slot="product-publish-gaps"
        data-testid="product-publish-ready"
      >
        <CircleCheck aria-hidden className="size-4 shrink-0" />
        {copy.ready}
      </p>
    );
  }

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        // amber-900 on amber-50: 8.9:1; amber-100 on amber-950: 12:1.
        "grid gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
        className
      )}
      data-slot="product-publish-gaps"
      data-testid="product-publish-gaps"
    >
      <Heading
        className="flex items-center gap-2 text-sm font-semibold"
        id={titleId}
      >
        <CircleAlert aria-hidden className="size-4 shrink-0" />
        {copy.heading}
      </Heading>
      <ul className="grid gap-1">
        {gaps.map((gap) => (
          <li key={gap}>
            <Button
              aria-label={interpolate(copy.go, { gap: copy[gap] })}
              className="w-full justify-between text-inherit hover:bg-amber-100 dark:hover:bg-amber-900/40"
              onClick={() => {
                onJump(gap);
              }}
              type="button"
              variant="ghost"
            >
              {copy[gap]}
              <ArrowRight aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export { ProductPublishGaps };
