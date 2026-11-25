import { expect, type Locator } from "@playwright/test";

/**
 * Waits until `titles` are exactly `expected`, in whatever order, and
 * answers the order they came in. The catalog's default order (FER-019) is
 * the home's "Destacados" first, then the rest dealt anew each business day,
 * so a test of what a page lists, not of its order, asserts the set.
 */
export async function expectTitlesInAnyOrder(
  titles: Locator,
  expected: readonly string[]
): Promise<string[]> {
  // As many as expected and the same set: no title missing, none twice.
  await expect(titles).toHaveCount(expected.length);
  await expect
    .poll(async () => new Set(await titles.allTextContents()))
    .toEqual(new Set(expected));

  return await titles.allTextContents();
}
