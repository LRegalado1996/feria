import { z } from "zod";

import { LOCALES } from "@/lib/i18n/config";
import type { Currency } from "@/lib/utils/format";
import { normalizePhone } from "@/lib/utils/phone";

/** The currencies a store can sell in, pesos first. */
export const STORE_CURRENCIES = [
  "UYU",
  "USD",
] as const satisfies readonly Currency[];

export const STORE_NAME_MAX_LENGTH = 80;
export const STORE_TAGLINE_MAX_LENGTH = 120;
export const STORE_DESCRIPTION_MAX_LENGTH = 600;

const URL_MAX_LENGTH = 2048;

// E.164: a plus, a country code that never starts with 0, 8 to 15 digits.
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

// A browser drops tabs and line breaks from a URL and reads a backslash as a
// slash, so a link holding one is not the link a person sees.
const URL_REWRITTEN_BY_BROWSERS = /[\s\\]/;

/** The sites a social link may point at. */
const INSTAGRAM_HOSTS = ["instagram.com", "www.instagram.com"] as const;
const TIKTOK_HOSTS = ["tiktok.com", "www.tiktok.com"] as const;

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
  hosts,
  message,
  tooLong,
}: {
  hosts?: readonly string[];
  /** Said for any link it refuses but a long one. */
  message: string;
  tooLong: string;
}) {
  return z
    .string()
    .trim()
    .max(URL_MAX_LENGTH, tooLong)
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
    );
}

/** The API's own words for a refused link: the form says it in the page's. */
function apiStoreLink(example: string, hosts: readonly string[]) {
  return storeLink({
    hosts,
    message: `Enter a full link, such as ${example}`,
    tooLong: `Keep the link to ${URL_MAX_LENGTH} characters`,
  }).nullable();
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
 * socials and texts. Its colors and its logo are code (the theme file and
 * the brand files), not data. Its currency is not here either (FER-014,
 * decided 2026-11-18): it is fixed per store and changed only by hand in the
 * database, so a currency sent with an edit is dropped. Writing it always
 * sends all of it, so an update never has to merge with a row read earlier.
 */
export const updateStoreSchema = z.object({
  instagramUrl: apiStoreLink("https://instagram.com/my-store", INSTAGRAM_HOSTS),
  // Trimmed first: `min(1)` alone accepts "   ".
  name: z
    .string()
    .trim()
    .min(1, "A name is required")
    .max(
      STORE_NAME_MAX_LENGTH,
      `Keep the name to ${STORE_NAME_MAX_LENGTH} characters`
    ),
  tiktokUrl: apiStoreLink("https://tiktok.com/@my-store", TIKTOK_HOSTS),
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
  // Only the settings form reads a number typed any other way (below), so
  // what the API stores is always what it was sent.
  whatsappNumber: z
    .string()
    .trim()
    .regex(
      E164_PATTERN,
      "Write the number in international format, such as +59899123456"
    )
    .nullable(),
});

export type UpdateStoreValues = z.infer<typeof updateStoreSchema>;

/**
 * The longest WhatsApp number the settings form reads, as typed: room for
 * spaces, dashes and parentheses around the 15 digits E.164 allows.
 */
export const WHATSAPP_INPUT_MAX_LENGTH = 30;

/** What the settings form says under a field it refuses, in the page's words. */
export interface StoreSettingsFormMessages {
  descriptionRequired: string;
  descriptionTooLong: string;
  instagramInvalid: string;
  linkTooLong: string;
  nameRequired: string;
  nameTooLong: string;
  taglineRequired: string;
  taglineTooLong: string;
  tiktokInvalid: string;
  whatsappInvalid: string;
}

/** A link left blank is `null`: the store then has none. */
function blankAsNull<Output extends string>(schema: z.ZodType<Output, string>) {
  return z
    .string()
    .trim()
    .transform((typed) => (typed === "" ? null : typed))
    .pipe(schema.nullable());
}

/**
 * The settings form's fields (FER-014), as the form holds them: every one a
 * string, `""` included. Parsed, they are what `store.update` takes: the
 * store's name, its texts in both languages (both required), its WhatsApp
 * number in E.164 and its links, a blank number or link as `null`.
 *
 * The WhatsApp number is read the way a person types it: spaces, dots,
 * dashes and parentheses are dropped, `00` before the country code becomes
 * `+`, and a Uruguayan mobile in its local form (`099 123 456`) gets `+598`
 * (`normalizePhone`, the checkout's own reading). Blank is checked before
 * anything is read, so it means "no WhatsApp", never a refused number.
 */
export function createStoreSettingsFormSchema(
  messages: StoreSettingsFormMessages
) {
  const tagline = z
    .string()
    .trim()
    .min(1, messages.taglineRequired)
    .max(STORE_TAGLINE_MAX_LENGTH, messages.taglineTooLong);
  const description = z
    .string()
    .trim()
    .min(1, messages.descriptionRequired)
    .max(STORE_DESCRIPTION_MAX_LENGTH, messages.descriptionTooLong);

  return z
    .object({
      descriptionEn: description,
      descriptionEs: description,
      instagramUrl: blankAsNull(
        storeLink({
          hosts: INSTAGRAM_HOSTS,
          message: messages.instagramInvalid,
          tooLong: messages.linkTooLong,
        })
      ),
      name: z
        .string()
        .trim()
        .min(1, messages.nameRequired)
        .max(STORE_NAME_MAX_LENGTH, messages.nameTooLong),
      taglineEn: tagline,
      taglineEs: tagline,
      tiktokUrl: blankAsNull(
        storeLink({
          hosts: TIKTOK_HOSTS,
          message: messages.tiktokInvalid,
          tooLong: messages.linkTooLong,
        })
      ),
      whatsappNumber: z
        .string()
        .trim()
        .max(WHATSAPP_INPUT_MAX_LENGTH, messages.whatsappInvalid)
        .transform((typed, context) => {
          if (typed === "") {
            return null;
          }

          const number = normalizePhone(typed);

          if (number === null) {
            context.addIssue({
              code: "custom",
              message: messages.whatsappInvalid,
            });

            return z.NEVER;
          }

          return number;
        }),
    })
    .transform(
      ({
        descriptionEn,
        descriptionEs,
        taglineEn,
        taglineEs,
        ...columns
      }): UpdateStoreValues => ({
        ...columns,
        translations: [
          { description: descriptionEs, locale: "es", tagline: taglineEs },
          { description: descriptionEn, locale: "en", tagline: taglineEn },
        ],
      })
    );
}

/** The settings form's fields as typed. */
export type StoreSettingsFormFields = z.input<
  ReturnType<typeof createStoreSettingsFormSchema>
>;

/** What the settings form sends: `store.update`'s input. */
export type StoreSettingsFormValues = z.output<
  ReturnType<typeof createStoreSettingsFormSchema>
>;
