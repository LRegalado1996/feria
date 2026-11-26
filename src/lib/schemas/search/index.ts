import { z } from "zod";

/**
 * U+0000. Postgres refuses it in a text value, so a search holding it could
 * never run: the API refuses it as bad input, and an address that carries it
 * is read without it, rather than either ending in a 500.
 */
const NUL = "\u0000";

/**
 * A search box's text as an API takes it (the storefront's search, the
 * admin's articles and orders): trimmed and at most `maxLength` long, blank
 * being no search (`undefined`) rather than a search for nothing, and one
 * holding U+0000 refused.
 */
export function searchTextSchema(maxLength: number) {
  return z
    .string()
    .refine((value) => !value.includes(NUL), {
      message: "A search cannot hold U+0000",
    })
    .trim()
    .max(maxLength)
    .transform((value) => (value === "" ? undefined : value))
    .optional();
}

/**
 * A search as an address gives it, which anyone can edit, read the way
 * `searchTextSchema` takes it: without U+0000, trimmed, cut to `maxLength`,
 * and `null` when nothing is left.
 */
export function readSearchText(
  value: string | null,
  maxLength: number
): string | null {
  const text = (value ?? "").replaceAll(NUL, "").trim().slice(0, maxLength);

  return text === "" ? null : text;
}
