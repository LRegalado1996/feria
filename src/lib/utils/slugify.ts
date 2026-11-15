import { CATALOG_SLUG_MAX_LENGTH } from "@/lib/schemas/catalog";

const COMBINING_MARKS = /\p{Mn}/gu;
const NOT_SLUG = /[^a-z0-9]+/gu;
const EDGE_DASHES = /^-+|-+$/gu;

/**
 * A readable address segment from a name, in the shape `CATALOG_SLUG_PATTERN`
 * accepts: "Collar Dorado Ñandú" is `collar-dorado-nandu`. Accents and the
 * ñ lose their marks, anything else that is not a letter or digit becomes a
 * dash, and the result is cut at the column's limit without a trailing dash.
 * `fallback` names the row when nothing readable is left ("¡¡¡").
 */
export function slugify(text: string, fallback: string): string {
  // Lowercase first: some capitals lowercase into a letter plus a mark
  // ("İ" is "i" and a dot above), which the next step removes.
  const slug = text
    .toLowerCase()
    .normalize("NFD")
    .replaceAll(COMBINING_MARKS, "")
    .replaceAll(NOT_SLUG, "-")
    .replaceAll(EDGE_DASHES, "")
    .slice(0, CATALOG_SLUG_MAX_LENGTH)
    .replaceAll(EDGE_DASHES, "");

  return slug === "" ? fallback : slug;
}

/**
 * `base`, or `base-2`, `base-3`… : the first that is not in `taken`. The
 * suffix fits inside the column's limit by cutting `base`, never the number.
 */
export function firstFreeSlug(
  base: string,
  taken: ReadonlySet<string>
): string {
  if (!taken.has(base)) {
    return base;
  }

  for (let suffix = 2; ; suffix += 1) {
    const ending = `-${suffix}`;
    const candidate = `${base.slice(0, CATALOG_SLUG_MAX_LENGTH - ending.length).replaceAll(EDGE_DASHES, "")}${ending}`;

    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}
