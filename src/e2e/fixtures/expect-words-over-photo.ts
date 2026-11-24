import { expect, type Locator } from "@playwright/test";

/** The shadow's three layers: where each falls, and how much ink it is. */
const LAYERS = [
  { geometry: "0px 0px 1px", ink: 90 },
  { geometry: "0px 1px 3px", ink: 75 },
  { geometry: "0px 2px 18px", ink: 60 },
] as const;

/**
 * White words over a photo read by their own shadow, never by a shade drawn
 * over the photo (FER-077): nothing in `box` paints a gradient, and `words`
 * computes the three layers of `store-display-shadow`: a 1 px edge, a 3 px
 * drop and an 18 px halo, of the store's ink at 90%, 75% and 60%. The ink
 * is the theme's, so each layer's color is read off the page as the
 * browser computes that mix: a shadow of the right shape in a transparent
 * or another color is not the shadow.
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
  const expected = await words.evaluate((element, layers) => {
    const probe = document.createElement("span");
    element.append(probe);
    const shadow = layers
      .map(({ geometry, ink }) => {
        probe.style.color = `color-mix(in srgb, var(--store-foreground) ${ink}%, transparent)`;

        return `${getComputedStyle(probe).color} ${geometry}`;
      })
      .join(", ");
    probe.remove();

    return shadow;
  }, LAYERS);

  // The ink resolved: a missing variable would make every layer the same
  // inherited color, and the three alphas tell them apart.
  expect(expected).toMatch(/\/ 0\.9\).*\/ 0\.75\).*\/ 0\.6\)/u);
  await expect(words).toHaveCSS("text-shadow", expected);
}
