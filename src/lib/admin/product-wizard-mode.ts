import {
  newProductPath,
  productPath,
  WIZARD_STEPS,
  type WizardStep,
} from "@/lib/admin/products";
import type { Locale } from "@/lib/i18n/config";

/**
 * How the article wizard (FER-017) shows an article, from its address
 * (Lucas, 2026-11-18): loading a new one is a journey in three steps, and
 * editing one is a single screen with everything on it.
 *
 * - `/admin/products/new` is the journey's start, always in steps, and so
 *   is the rest of that visit, while the router catches up with the
 *   draft's own address.
 * - `/admin/products/{id}?step=<step>` is the journey going on: the address
 *   the draft takes once its first photo creates it, so a reload mid-way
 *   lands on the same step.
 * - `/admin/products/{id}` is the single screen: the list's rows lead there,
 *   for a draft and a published article alike, and so does an address with
 *   an unknown step.
 * - A published article is always the single screen: publishing ends the
 *   journey.
 */
export type WizardMode =
  | { kind: "screen" }
  | { kind: "steps"; step: WizardStep };

/** `value` if it is one of the wizard's steps, else `null`. */
function knownStep(value: string | null): WizardStep | null {
  return WIZARD_STEPS.find((step) => step === value) ?? null;
}

/** The mode an address gives, `step` being its `?step=`, unread. */
export function readWizardMode({
  isNew,
  isPublished,
  step,
}: {
  isNew: boolean;
  isPublished: boolean;
  step: string | null;
}): WizardMode {
  const known = knownStep(step);

  if (isPublished) {
    return { kind: "screen" };
  }

  if (isNew) {
    return { kind: "steps", step: known ?? WIZARD_STEPS[0] };
  }

  return known === null ? { kind: "screen" } : { kind: "steps", step: known };
}

/**
 * The journey's address at `step`: a new article's (its first step left out,
 * as `/new` is always in steps), or a draft's, its step always written, so
 * the journey never turns into the single screen on the way.
 */
export function wizardStepPath(
  id: number | null,
  locale: Locale,
  step: WizardStep
): string {
  if (id === null) {
    const path = newProductPath(locale);

    return step === WIZARD_STEPS[0] ? path : `${path}?step=${step}`;
  }

  return `${productPath(id, locale)}?step=${step}`;
}
