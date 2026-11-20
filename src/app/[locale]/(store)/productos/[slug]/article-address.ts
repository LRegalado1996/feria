import { catalogSlugSchema } from "@/lib/schemas/catalog";

/**
 * Whether `slug` could be an article's address at all. The sample the build
 * prerenders (`__sample__`) never is, so the article page and its share card
 * stop here, before the store is read: the build has no database.
 */
export function couldBeArticle(slug: string): boolean {
  const parsed = catalogSlugSchema.safeParse(slug);

  // The schema trims, an address does not: " cadena " is not "cadena".
  return parsed.success && parsed.data === slug;
}
