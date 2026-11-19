import { z } from "zod";

import { LOCALES } from "@/lib/i18n/config";

/**
 * The coming-soon page's editable texts (FER-034, decided by Lucas on
 * 2026-11-18): the eyebrow over the headline, the headline, the text under
 * it and the marquee band, in each language, and the day the countdown
 * counts to. Empty means "say what the dictionary says": a text is never
 * required. The eyebrow names the fair's dates, so it is editable with the
 * day the countdown counts to and never has to contradict it.
 *
 * The headline and the band are written one line per line: the headline's
 * lines are its display lines (the second one in the accent color), the
 * band's are its phrases. The limits keep the hero headline inside a phone's
 * width and the band readable; the eyebrow is one short line.
 */
export const COMING_SOON_EYEBROW_MAX_LENGTH = 80;
export const COMING_SOON_HEADLINE_MAX_LENGTH = 50;
export const COMING_SOON_HEADLINE_MAX_LINES = 2;
export const COMING_SOON_LEAD_MAX_LENGTH = 240;
export const COMING_SOON_MARQUEE_MAX_LENGTH = 120;
export const COMING_SOON_MARQUEE_MAX_LINES = 4;

/** The years a countdown date may fall in: a typo like 0226 is refused. */
const COUNTDOWN_FIRST_YEAR = 2026;
const COUNTDOWN_LAST_YEAR = 2100;

const DATE_PATTERN = /^(\d{4})-\d{2}-\d{2}$/u;

/** The text's lines, each trimmed, the empty ones dropped. */
export function linesOf(text: string): string[] {
  return text
    .split(/\r\n|\r|\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** A text kept as lines: one per line, trimmed, no blank ones. */
function normalizeLines(text: string): string {
  return linesOf(text).join("\n");
}

/** A paragraph: every run of spaces and line breaks becomes one space. */
function normalizeParagraph(text: string): string {
  return text.replaceAll(/\s+/gu, " ").trim();
}

/**
 * Whether `value` is a real day (`2026-02-31` is not) within the years a
 * countdown may name. Date-only, never an instant (docs/agents/database.md
 * § Time): it is read at midnight in Montevideo where it is used.
 */
export function isCountdownDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const day = new Date(`${value}T00:00:00Z`);

  return (
    year >= COUNTDOWN_FIRST_YEAR &&
    year <= COUNTDOWN_LAST_YEAR &&
    !Number.isNaN(day.getTime()) &&
    day.toISOString().slice(0, 10) === value
  );
}

interface TextRules {
  max: number;
  /** Lines it may have; a paragraph has none to count. */
  maxLines?: number;
  normalize: (text: string) => string;
  tooLong: string;
  tooManyLines: string;
}

/** An optional text: normalized, checked, and `null` when nothing is left. */
function optionalText({
  max,
  maxLines,
  normalize,
  tooLong,
  tooManyLines,
}: TextRules) {
  return z
    .string()
    .transform(normalize)
    .pipe(
      z
        .string()
        .max(max, tooLong)
        .refine(
          (text) => maxLines === undefined || linesOf(text).length <= maxLines,
          { error: tooManyLines }
        )
    )
    .transform((text) => (text === "" ? null : text));
}

/** What a refused field says. */
export interface ComingSoonTextMessages {
  dateInvalid: string;
  eyebrowTooLong: string;
  headlineTooLong: string;
  headlineTooManyLines: string;
  leadTooLong: string;
  marqueeTooLong: string;
  marqueeTooManyLines: string;
}

/** The API's own words: the form says them in the page's language. */
const API_MESSAGES: ComingSoonTextMessages = {
  dateInvalid: `Enter a real day between ${COUNTDOWN_FIRST_YEAR} and ${COUNTDOWN_LAST_YEAR}, as YYYY-MM-DD`,
  eyebrowTooLong: `Keep the line over the headline to ${COMING_SOON_EYEBROW_MAX_LENGTH} characters`,
  headlineTooLong: `Keep the headline to ${COMING_SOON_HEADLINE_MAX_LENGTH} characters`,
  headlineTooManyLines: `Keep the headline to ${COMING_SOON_HEADLINE_MAX_LINES} lines`,
  leadTooLong: `Keep the text to ${COMING_SOON_LEAD_MAX_LENGTH} characters`,
  marqueeTooLong: `Keep the band to ${COMING_SOON_MARQUEE_MAX_LENGTH} characters`,
  marqueeTooManyLines: `Keep the band to ${COMING_SOON_MARQUEE_MAX_LINES} phrases`,
};

function textsOf(messages: ComingSoonTextMessages) {
  return {
    eyebrow: optionalText({
      max: COMING_SOON_EYEBROW_MAX_LENGTH,
      normalize: normalizeParagraph,
      tooLong: messages.eyebrowTooLong,
      tooManyLines: messages.eyebrowTooLong,
    }),
    headline: optionalText({
      max: COMING_SOON_HEADLINE_MAX_LENGTH,
      maxLines: COMING_SOON_HEADLINE_MAX_LINES,
      normalize: normalizeLines,
      tooLong: messages.headlineTooLong,
      tooManyLines: messages.headlineTooManyLines,
    }),
    lead: optionalText({
      max: COMING_SOON_LEAD_MAX_LENGTH,
      normalize: normalizeParagraph,
      tooLong: messages.leadTooLong,
      tooManyLines: messages.leadTooLong,
    }),
    marquee: optionalText({
      max: COMING_SOON_MARQUEE_MAX_LENGTH,
      maxLines: COMING_SOON_MARQUEE_MAX_LINES,
      normalize: normalizeLines,
      tooLong: messages.marqueeTooLong,
      tooManyLines: messages.marqueeTooManyLines,
    }),
  };
}

function countdownDate(message: string) {
  return z.string().trim().refine(isCountdownDate, { error: message });
}

const apiTexts = textsOf(API_MESSAGES);

const comingSoonTranslationSchema = z.object({
  eyebrow: apiTexts.eyebrow.nullable(),
  headline: apiTexts.headline.nullable(),
  lead: apiTexts.lead.nullable(),
  locale: z.enum(LOCALES),
  marquee: apiTexts.marquee.nullable(),
});

/**
 * What `comingSoon.update` takes: the texts in every language it sends and
 * the countdown's day (`null`: the fair's opening). Never the switch: it
 * has its own procedure, so saving texts can never publish or hide the page.
 * A language left out loses its texts, which then fall back.
 */
export const updateComingSoonSchema = z.object({
  countdownTo: countdownDate(API_MESSAGES.dateInvalid).nullable(),
  translations: z
    .array(comingSoonTranslationSchema)
    .max(LOCALES.length, "Send each language at most once")
    .refine(
      (translations) =>
        new Set(translations.map(({ locale }) => locale)).size ===
        translations.length,
      { error: "Send each language at most once" }
    ),
});

export type UpdateComingSoonValues = z.infer<typeof updateComingSoonSchema>;

/**
 * The switch (`comingSoon.setPublished`): published, the public sees only the
 * coming-soon page; unpublished, the whole store.
 */
export const setComingSoonPublishedSchema = z.object({
  published: z.boolean(),
});

/**
 * The admin's form (FER-034), every field a string as the form holds it.
 * Parsed, it is what `comingSoon.update` takes, both languages always sent:
 * a blank text or date is `null`, so the page says the dictionary's.
 */
export function createComingSoonFormSchema(messages: ComingSoonTextMessages) {
  const texts = textsOf(messages);

  return z
    .object({
      countdownTo: z
        .string()
        .trim()
        .transform((typed) => (typed === "" ? null : typed))
        .pipe(countdownDate(messages.dateInvalid).nullable()),
      eyebrowEn: texts.eyebrow,
      eyebrowEs: texts.eyebrow,
      headlineEn: texts.headline,
      headlineEs: texts.headline,
      leadEn: texts.lead,
      leadEs: texts.lead,
      marqueeEn: texts.marquee,
      marqueeEs: texts.marquee,
    })
    .transform((fields): UpdateComingSoonValues => ({
      countdownTo: fields.countdownTo,
      translations: [
        {
          eyebrow: fields.eyebrowEs,
          headline: fields.headlineEs,
          lead: fields.leadEs,
          locale: "es",
          marquee: fields.marqueeEs,
        },
        {
          eyebrow: fields.eyebrowEn,
          headline: fields.headlineEn,
          lead: fields.leadEn,
          locale: "en",
          marquee: fields.marqueeEn,
        },
      ],
    }));
}

/** The form's fields as typed. */
export type ComingSoonFormFields = z.input<
  ReturnType<typeof createComingSoonFormSchema>
>;
