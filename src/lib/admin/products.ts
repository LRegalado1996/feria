import { readRowId } from "@/lib/admin/paths";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";

/** The article wizard's steps (FER-017), in their order. */
export const WIZARD_STEPS = ["photos", "details", "review"] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

/** The step a wizard address without one, or with an unknown one, opens on. */
export const FIRST_WIZARD_STEP: WizardStep = "photos";

/**
 * The wizard's step from its address (`?step=details`), which anyone can
 * edit: anything but a known step is the first.
 */
export function readWizardStep(value: string | null | undefined): WizardStep {
  return WIZARD_STEPS.find((step) => step === value) ?? FIRST_WIZARD_STEP;
}

/** The admin's list of articles. */
export function productsPath(locale: Locale): string {
  return localizePath("/admin/products", locale);
}

/** The wizard on a new article, nothing stored yet. */
export function newProductPath(locale: Locale): string {
  return localizePath("/admin/products/new", locale);
}

/**
 * The wizard on one of the store's articles, at `step` (the first one when
 * left out, which the address then leaves out too).
 */
export function productPath(
  id: number,
  locale: Locale,
  step: WizardStep = FIRST_WIZARD_STEP
): string {
  const path = localizePath(`/admin/products/${id}`, locale);

  return step === FIRST_WIZARD_STEP ? path : `${path}?step=${step}`;
}

/** An article's id from its wizard's address, or `null` (`readRowId`). */
export function readProductId(segment: string): number | null {
  return readRowId(segment);
}
