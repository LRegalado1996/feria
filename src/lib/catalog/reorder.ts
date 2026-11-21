import { RELATED_FILL_BELOW, type RandomSource } from "@/lib/catalog/related";

/**
 * The category whose articles the order's page shows under its band
 * (FER-051), "Hacé todos los pedidos que quieras": one at random among those
 * with a row's worth of articles (`RELATED_FILL_BELOW` or more), else among
 * any with one; `null` when no category has a published article. The page
 * renders per request, so the server draws it per visit and the browser
 * only shows it: nothing to mismatch while hydrating.
 */
export function pickReorderCategory(
  counts: readonly { categoryId: number; count: number }[],
  random: RandomSource
): number | null {
  const full = counts.filter((entry) => entry.count >= RELATED_FILL_BELOW);
  const pool =
    full.length > 0 ? full : counts.filter((entry) => entry.count > 0);

  if (pool.length === 0) {
    return null;
  }

  // `random()` is below 1, so the index stays in the pool.
  return pool[Math.floor(random() * pool.length)]?.categoryId ?? null;
}
