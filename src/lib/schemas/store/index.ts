import { z } from "zod";

import { LOCALES } from "@/lib/i18n/config";
import type { Currency } from "@/lib/utils/format";

/** The currencies a store can sell in, pesos first. */
export const STORE_CURRENCIES = [
  "UYU",
  "USD",
] as const satisfies readonly Currency[];

export const STORE_NAME_MAX_LENGTH = 80;
export const STORE_TAGLINE_MAX_LENGTH = 120;
export const STORE_DESCRIPTION_MAX_LENGTH = 600;

const URL_MAX_LENGTH = 2048;

// A browser drops tabs and line breaks from a URL and reads a backslash as a
// slash, so a link holding one is not the link a person sees.
const URL_REWRITTEN_BY_BROWSERS = /[\s\\]/;

/**
 * A link the storefront renders as an `href` or a `src`: `https` only, so a
 * stored value can never be a `javascript:` URL, and with no user name in
 * front of the host (`https://instagram.com@evil.example` reads as Instagram
 * and goes somewhere else). `hosts` holds a social link to its own site.
 *
 * Three stages, and a later one only runs on what the earlier accepted, so a
 * refused link gets one message and `new URL()` only ever parses a valid one.
 */
function storeLink({
  example,
  hosts,
}: {
  example: string;
  hosts?: readonly string[];
}) {
  const message = `Enter a full link, such as ${example}`;

  return z
    .string()
    .trim()
    .max(URL_MAX_LENGTH, `Keep the link to ${URL_MAX_LENGTH} characters`)
    .refine((link) => !URL_REWRITTEN_BY_BROWSERS.test(link), { error: message })
    .pipe(z.url({ error: message, protocol: /^https$/ }))
    .pipe(
      z.string().refine(
        (link) => {
          const { hostname, password, port, username } = new URL(link);

          return (
            username === "" &&
            password === "" &&
            (hosts === undefined || (hosts.includes(hostname) && port === ""))
          );
        },
        { error: message }
      )
    )
    .nullable();
}

const storeTranslationSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, "A description is required")
    .max(
      STORE_DESCRIPTION_MAX_LENGTH,
      `Keep the description to ${STORE_DESCRIPTION_MAX_LENGTH} characters`
    ),
  locale: z.enum(LOCALES),
  tagline: z
    .string()
    .trim()
    .min(1, "A tagline is required")
    .max(
      STORE_TAGLINE_MAX_LENGTH,
      `Keep the tagline to ${STORE_TAGLINE_MAX_LENGTH} characters`
    ),
});

/**
 * Everything a person can set on the store (FER-038): its name, contacts,
 * socials, currency and texts. Its colors and its logo are code (the theme
 * file and the brand files), not data. Writing it always sends all of it, so
 * an update never has to merge with a row read earlier.
 */
export const updateStoreSchema = z.object({
  currencyCode: z.enum(STORE_CURRENCIES),
  instagramUrl: storeLink({
    example: "https://instagram.com/my-store",
    hosts: ["instagram.com", "www.instagram.com"],
  }),
  // Trimmed first: `min(1)` alone accepts "   ".
  name: z
    .string()
    .trim()
    .min(1, "A name is required")
    .max(
      STORE_NAME_MAX_LENGTH,
      `Keep the name to ${STORE_NAME_MAX_LENGTH} characters`
    ),
  tiktokUrl: storeLink({
    example: "https://tiktok.com/@my-store",
    hosts: ["tiktok.com", "www.tiktok.com"],
  }),
  // At most one text per language; a store may have none yet.
  translations: z
    .array(storeTranslationSchema)
    .max(LOCALES.length, "Send each language at most once")
    .refine(
      (translations) =>
        new Set(translations.map(({ locale }) => locale)).size ===
        translations.length,
      { error: "Send each language at most once" }
    ),
  // E.164, the format WhatsApp links take: a plus, the country code, digits.
  whatsappNumber: z
    .string()
    .trim()
    .regex(
      /^\+[1-9]\d{7,14}$/,
      "Write the number in international format, such as +59899123456"
    )
    .nullable(),
});

export type UpdateStoreValues = z.infer<typeof updateStoreSchema>;
