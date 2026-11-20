"use client";

import { Check } from "lucide-react";

import { WIZARD_STEPS, type WizardStep } from "@/lib/admin/products";
import { useDictionary } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import { cn } from "@/lib/utils";

export interface ProductWizardStepsProps {
  className?: string;
  current: WizardStep;
  /** Whether a step can be opened now (the details wait for a photo). */
  isReachable: (step: WizardStep) => boolean;
  onSelect: (step: WizardStep) => void;
}

/**
 * The article wizard's three steps (FER-017): photos, details, review, as
 * numbered circles joined by a line, each a button that opens it. The
 * current one is filled and `aria-current="step"`; the ones before it show
 * a check; one that cannot be opened yet is disabled. Its name says where
 * it stands, so the eye and the ear read the same.
 */
function ProductWizardSteps({
  className,
  current,
  isReachable,
  onSelect,
}: ProductWizardStepsProps) {
  const copy = useDictionary().articles.wizard.steps;
  const at = WIZARD_STEPS.indexOf(current);

  return (
    <nav
      aria-label={copy.label}
      className={cn("min-w-0", className)}
      data-slot="product-wizard-steps"
    >
      <ol className="isolate grid grid-cols-3 gap-1">
        {WIZARD_STEPS.map((step, index) => {
          const done = index < at;
          const isCurrent = step === current;

          return (
            <li className="relative min-w-0" key={step}>
              {/* The line into this step, behind the circles. */}
              {index > 0 ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-5.5 right-1/2 left-[-50%] -z-10 h-px md:top-4.5",
                    index <= at ? "bg-foreground" : "bg-border"
                  )}
                />
              ) : null}
              <button
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`${interpolate(copy.position, {
                  current: index + 1,
                  total: WIZARD_STEPS.length,
                })}: ${copy[step]}`}
                className="relative flex min-h-11 w-full flex-col items-center gap-1 rounded-md px-1 py-1 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-9"
                data-testid={`wizard-step-${step}`}
                disabled={!isReachable(step)}
                onClick={() => {
                  onSelect(step);
                }}
                type="button"
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full border text-xs font-semibold tabular-nums transition-colors",
                    isCurrent &&
                      "border-foreground bg-foreground text-background",
                    done && "border-foreground bg-background text-foreground",
                    !(isCurrent || done) &&
                      "border-dashed border-muted-foreground/60 bg-background text-muted-foreground"
                  )}
                >
                  {done ? <Check className="size-3.5" /> : index + 1}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "truncate",
                    isCurrent
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {copy[step]}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export { ProductWizardSteps };
