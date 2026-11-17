/**
 * "También te puede gustar" under an article (FER-039): up to eight
 * articles chosen at random from its category, never the article itself;
 * only when its category has fewer than four others does the pick go on
 * with articles from the rest of the store.
 *
 * The article's page is prerendered, so the server cannot pick per visit.
 * It hands over a pool instead (`RELATED_POOL_SIZE` of each kind, newest
 * first), renders the first pick in that order, and the browser picks
 * again from the same pool once it owns the page. The pick's size depends
 * only on the pool, never on the draw, so the row keeps its cards.
 */

/** At most this many suggestions under an article. */
export const RELATED_PICK_MAX = 8;

/** Below this many others in its category, the pick is filled from the store. */
export const RELATED_FILL_BELOW = 4;

/** How many of each kind the page hands over to pick from. */
export const RELATED_POOL_SIZE = 16;

/** A number in [0, 1), like `Math.random`. */
export type RandomSource = () => number;

/** The articles to pick from: the article's category, then the rest. */
export interface RelatedPool<Item> {
  others: readonly Item[];
  same: readonly Item[];
}

/** The Park–Miller generator's modulus, the prime 2^31 - 1. */
const MODULUS = 2_147_483_647;

/**
 * A repeatable random source from a seed (the Park–Miller generator, in
 * plain arithmetic: every product stays under 2^53, so it is exact): the
 * same seed gives the same draws, so a pick can be tested and stays the
 * same through a re-render. Any whole number is a seed.
 */
export function seededRandom(seed: number): RandomSource {
  // The generator needs a state in [1, MODULUS - 1].
  let state = (Math.abs(Math.trunc(seed)) % (MODULUS - 1)) + 1;

  return () => {
    state = (state * 48_271) % MODULUS;

    return (state - 1) / (MODULUS - 1);
  };
}

/**
 * A shuffled copy: each place takes one of the items left, drawn at random;
 * without a source, the order given. The pool is small (two of
 * `RELATED_POOL_SIZE`), so drawing out of the list is plenty.
 */
function shuffled<Item>(
  items: readonly Item[],
  random: RandomSource | null
): Item[] {
  if (!random) {
    return [...items];
  }

  const left = [...items];
  const drawn: Item[] = [];

  while (left.length > 0) {
    drawn.push(...left.splice(Math.floor(random() * left.length), 1));
  }

  return drawn;
}

/**
 * The suggestions: up to `RELATED_PICK_MAX` from the category, at random;
 * when the category has fewer than `RELATED_FILL_BELOW`, all of them, then
 * the rest of the store at random up to the same maximum. `random` null
 * keeps the pool's order (the server's render, before the browser draws).
 */
export function pickRelated<Item>(
  pool: RelatedPool<Item>,
  random: RandomSource | null
): Item[] {
  const same = shuffled(pool.same, random).slice(0, RELATED_PICK_MAX);

  if (pool.same.length >= RELATED_FILL_BELOW) {
    return same;
  }

  return [
    ...same,
    ...shuffled(pool.others, random).slice(0, RELATED_PICK_MAX - same.length),
  ];
}
