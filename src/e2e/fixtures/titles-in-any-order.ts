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
  /** How often each title shows: a title twice is not the same list. */
  const tally = (list: readonly string[]) => {
    const counts = new Map<string, number>();

    for (const title of list) {
      counts.set(title, (counts.get(title) ?? 0) + 1);
    }

    return counts;
  };
  let seen: string[] = [];

  // One read per try, checked whole and handed back as it was checked.
  await expect
    .poll(async () => {
      seen = await titles.allTextContents();
      return tally(seen);
    })
    .toEqual(tally(expected));

  return seen;
}
