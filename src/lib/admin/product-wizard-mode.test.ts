import { describe, expect, test } from "vitest";

import { readWizardMode, wizardStepPath } from "./product-wizard-mode";

describe("readWizardMode", () => {
  test.each([
    ["a new article with no step", true, false, null, "steps", "photos"],
    ["a new article on a step", true, false, "review", "steps", "review"],
    ["a new article on an unknown step", true, false, "x", "steps", "photos"],
    ["a new article once published", true, true, "review", "screen", undefined],
    ["a draft on its first step", false, false, "photos", "steps", "photos"],
    ["a draft on a step", false, false, "details", "steps", "details"],
    ["a draft with no step", false, false, null, "screen", undefined],
    ["a draft on an unknown step", false, false, "pasos", "screen", undefined],
    [
      "a published article with no step",
      false,
      true,
      null,
      "screen",
      undefined,
    ],
    [
      "a published article on a step",
      false,
      true,
      "review",
      "screen",
      undefined,
    ],
  ] as const)(
    "shows %s as %s",
    (_case, isNew, isPublished, step, kind, shownStep) => {
      expect(readWizardMode({ isNew, isPublished, step })).toEqual(
        shownStep === undefined ? { kind } : { kind, step: shownStep }
      );
    }
  );
});

describe("wizardStepPath", () => {
  test.each([
    [null, "es", "photos", "/admin/products/new"],
    [null, "en", "details", "/en/admin/products/new?step=details"],
    [12, "es", "photos", "/admin/products/12?step=photos"],
    [12, "en", "review", "/en/admin/products/12?step=review"],
  ] as const)("writes %s in %s at %s as %s", (id, locale, step, path) => {
    expect(wizardStepPath(id, locale, step)).toBe(path);
  });
});
