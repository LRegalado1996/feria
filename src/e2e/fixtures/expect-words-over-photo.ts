import { expect, type Locator } from "@playwright/test";

/**
 * White words over a photo read by their own shadow, never by a shade drawn
 * over the photo (FER-077): nothing in `box` paints a gradient, and `words`
 * computes the three layers of `store-display-shadow` (a 1 px edge, a 3 px
 * drop and an 18 px halo).
 */
export async function expectWordsOverPhoto(
  box: Locator,
  words: Locator
): Promise<void> {
  const gradients = await box.evaluate(
    (element) =>
      [element, ...element.querySelectorAll("*")].filter((node) =>
        getComputedStyle(node).backgroundImage.includes("gradient")
      ).length
  );

  expect(gradients).toBe(0);
  await expect(words).toHaveCSS(
    "text-shadow",
    /0px 0px 1px.*0px 1px 3px.*0px 2px 18px/u
  );
}
