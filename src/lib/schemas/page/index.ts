import { z } from "zod";

import { INT4_MAX } from "@/lib/schemas/catalog";
import { uploadedImageSchema } from "@/lib/schemas/upload";

/** The curated "best sellers" row holds at most this many articles. */
export const RANKING_MAX = 10;
/** The "featured" row holds none, or two to four articles (FER-020). */
export const FEATURED_MIN = 2;
export const FEATURED_MAX = 4;
/** The bar's line on a computer, and its shorter twin for a phone. */
export const ANNOUNCEMENT_TEXT_MAX_LENGTH = 120;
export const ANNOUNCEMENT_SHORT_TEXT_MAX_LENGTH = 40;
export const BANNER_TITLE_MAX_LENGTH = 60;
export const BANNER_CTA_MAX_LENGTH = 24;
export const HOME_LINK_MAX_LENGTH = 500;
/** Far above what a home holds; a bound, so a body cannot be unbounded. */
const SECTIONS_MAX = 200;
/**
 * The cover's carousel holds at most six banners (FER-020): its controls, a
 * pause button and one 44 px dot per banner, must fit a 360 px phone.
 */
export const COVER_BANNERS_MAX = 6;

/**
 * Where a banner shows on a page (FER-020, page-scoped since FER-058): in
 * its cover, the carousel at its top, or between two of its rows.
 */
export const BANNER_PLACEMENTS = ["cover", "rows"] as const;

export type BannerPlacement = (typeof BANNER_PLACEMENTS)[number];

/**
 * The blocks a page is built from (FER-058): what one place of its sequence
 * under the cover holds. A category's row, one of the two curated rows, or
 * a banner between rows. A new block is one kind here, its content table,
 * its target column on `page_section` and one renderer
 * (`docs/project/data-model.md` § Pages and sections).
 */
export const PAGE_SECTION_KINDS = [
  "category",
  "best_sellers",
  "featured",
  "banner",
] as const;

export type PageSectionKind = (typeof PAGE_SECTION_KINDS)[number];

/** What a banner's link points at: nothing, an article, a category, a URL. */
export const BANNER_LINK_KINDS = [
  "none",
  "product",
  "category",
  "url",
] as const;

export type BannerLinkKind = (typeof BANNER_LINK_KINDS)[number];

const bodyIdSchema = z.number().int().positive().max(INT4_MAX);
const pathIdSchema = z.coerce.number().int().positive().max(INT4_MAX);

/** Which of the store's pages a read or a write is about (FER-058). */
export const pageRefSchema = z.object({ pageId: pathIdSchema });

// A browser drops tabs and line breaks from a URL and reads a backslash as a
// slash, so a link holding one is not the link a person sees.
const REWRITTEN_BY_BROWSERS = /[\s\\]/;

/**
 * Whether `link` may become an `href` on the storefront (docs/agents/
 * security.md § Encode for every sink): a path of this site (`/productos`,
 * never `//host`, which a browser reads as another site) or a full `https`
 * address with no user name in front of its host
 * (`https://instagram.com@evil.example` reads as Instagram and goes
 * elsewhere). Never `javascript:`, `data:` or plain `http`.
 */
export function isSafeHomeLink(link: string): boolean {
  if (link.length === 0 || REWRITTEN_BY_BROWSERS.test(link)) {
    return false;
  }

  if (link.startsWith("/")) {
    return !link.startsWith("//");
  }

  if (!URL.canParse(link)) {
    return false;
  }

  const { password, protocol, username } = new URL(link);

  return protocol === "https:" && username === "" && password === "";
}

/** Whether a stored link is a path of this site, which the page localizes. */
export function isSitePath(link: string): boolean {
  return link.startsWith("/");
}

/** A link a person typed: trimmed, bounded, and safe as an `href`. */
function homeLink({ invalid, tooLong }: { invalid: string; tooLong: string }) {
  return z
    .string()
    .trim()
    .max(HOME_LINK_MAX_LENGTH, tooLong)
    .refine(isSafeHomeLink, { error: invalid });
}

const apiHomeLink = homeLink({
  invalid: "Enter a path of this site, such as /productos, or an https link",
  tooLong: `Keep the link to ${HOME_LINK_MAX_LENGTH} characters`,
});

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_YEAR_MIN = 2000;
const DATE_YEAR_MAX = 2100;

/**
 * Whether `value` is a real calendar day written `YYYY-MM-DD`, in a sane
 * year: `2026-02-31` is not one (`new Date` would read it as March 3).
 * Date-only values are days, never instants (docs/agents/database.md §
 * Time): a start or end date is a day in the store's time zone.
 */
export function isCalendarDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    year >= DATE_YEAR_MIN &&
    year <= DATE_YEAR_MAX &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const calendarDateSchema = z
  .string()
  .refine(isCalendarDate, { error: "Enter a date as YYYY-MM-DD" });

/** The end comes on or after the start: both days count. */
function datesInOrder(value: {
  endsOn: string | null;
  startsOn: string | null;
}): boolean {
  return (
    value.endsOn === null ||
    value.startsOn === null ||
    value.endsOn >= value.startsOn
  );
}

/** A text that may be left out: trimmed, `""` read as none. */
function optionalText(max: number, tooLong: string) {
  return z
    .string()
    .trim()
    .max(max, tooLong)
    .nullable()
    .transform((text) => (text === "" ? null : text));
}

/** A form's text field that may be left blank: `""` read as none. */
function blankText(max: number, tooLong: string) {
  return z
    .string()
    .trim()
    .max(max, tooLong)
    .transform((text) => (text === "" ? null : text));
}

/** Required text: trimmed first, since `min(1)` alone accepts "   ". */
function requiredText(max: number, required: string, tooLong: string) {
  return z.string().trim().min(1, required).max(max, tooLong);
}

/**
 * The announcement bar (FER-020): one line in Spanish and, optionally, in
 * English, each with an optional shorter line for a phone; an optional
 * link; the switch; and optional first and last days, both included, in
 * the store's time zone. The store has one announcement, so saving
 * replaces it whole.
 */
export const saveAnnouncementSchema = z
  .object({
    endsOn: calendarDateSchema.nullable(),
    isActive: z.boolean(),
    linkUrl: apiHomeLink.nullable(),
    shortTextEn: optionalText(
      ANNOUNCEMENT_SHORT_TEXT_MAX_LENGTH,
      `Keep the short text to ${ANNOUNCEMENT_SHORT_TEXT_MAX_LENGTH} characters`
    ),
    shortTextEs: optionalText(
      ANNOUNCEMENT_SHORT_TEXT_MAX_LENGTH,
      `Keep the short text to ${ANNOUNCEMENT_SHORT_TEXT_MAX_LENGTH} characters`
    ),
    startsOn: calendarDateSchema.nullable(),
    textEn: optionalText(
      ANNOUNCEMENT_TEXT_MAX_LENGTH,
      `Keep the text to ${ANNOUNCEMENT_TEXT_MAX_LENGTH} characters`
    ),
    textEs: requiredText(
      ANNOUNCEMENT_TEXT_MAX_LENGTH,
      "A Spanish text is required",
      `Keep the text to ${ANNOUNCEMENT_TEXT_MAX_LENGTH} characters`
    ),
  })
  .refine(datesInOrder, {
    error: "The last day comes on or after the first",
    path: ["endsOn"],
  })
  .refine((value) => value.shortTextEn === null || value.textEn !== null, {
    error: "Write the English text before its short version",
    path: ["shortTextEn"],
  });

export type SaveAnnouncementValues = z.infer<typeof saveAnnouncementSchema>;

/** Where a banner leads; its target is checked to be the store's. */
export const bannerLinkSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("product"), productId: bodyIdSchema }),
  z.object({ kind: z.literal("category"), categoryId: bodyIdSchema }),
  z.object({ kind: z.literal("url"), url: apiHomeLink }),
]);

export type BannerLink = z.infer<typeof bannerLinkSchema>;

const bannerFields = z.object({
  ctaLabelEn: optionalText(
    BANNER_CTA_MAX_LENGTH,
    `Keep the button's label to ${BANNER_CTA_MAX_LENGTH} characters`
  ),
  ctaLabelEs: optionalText(
    BANNER_CTA_MAX_LENGTH,
    `Keep the button's label to ${BANNER_CTA_MAX_LENGTH} characters`
  ),
  endsOn: calendarDateSchema.nullable(),
  isActive: z.boolean(),
  link: bannerLinkSchema,
  placement: z.enum(BANNER_PLACEMENTS),
  /**
   * For a banner between rows: how many places of the page's sequence come
   * before it. Left out, a banner already between rows keeps its place and
   * one that arrives there goes after the first row.
   */
  rowsIndex: z.number().int().min(0).max(SECTIONS_MAX).optional(),
  startsOn: calendarDateSchema.nullable(),
  titleEn: optionalText(
    BANNER_TITLE_MAX_LENGTH,
    `Keep the title to ${BANNER_TITLE_MAX_LENGTH} characters`
  ),
  titleEs: requiredText(
    BANNER_TITLE_MAX_LENGTH,
    "A Spanish title is required",
    `Keep the title to ${BANNER_TITLE_MAX_LENGTH} characters`
  ),
});

type BannerFields = z.infer<typeof bannerFields>;

/** The English button needs the English title, whose row holds it. */
function englishComplete(value: BannerFields): boolean {
  return value.ctaLabelEn === null || value.titleEn !== null;
}

const ENGLISH_INCOMPLETE = {
  error: "Write the English title before the English button",
  path: ["ctaLabelEn"],
};
const DATES_OUT_OF_ORDER = {
  error: "The last day comes on or after the first",
  path: ["endsOn"],
};

/**
 * A new banner: its photo for a computer (required) and for a phone
 * (optional; the computer's is cropped in its place), uploads of this
 * deployment for banners (`isOwnBlobUrl`, checked by the service), and its
 * texts, link, switch, days and place.
 */
export const createBannerSchema = bannerFields
  .extend({
    image: uploadedImageSchema,
    imagePhone: uploadedImageSchema.nullable(),
    /** The page it is placed on, in `placement`. */
    pageId: bodyIdSchema,
  })
  .refine(englishComplete, ENGLISH_INCOMPLETE)
  .refine(datesInOrder, DATES_OUT_OF_ORDER);

export type CreateBannerValues = z.infer<typeof createBannerSchema>;

/**
 * An edit of a banner. A photo left out keeps the stored one (what a form
 * that did not touch it sends, so a seeded `/seed/...` photo is never
 * re-checked); the phone photo is removed with `null`.
 */
export const updateBannerSchema = bannerFields
  .extend({
    id: pathIdSchema,
    image: uploadedImageSchema.optional(),
    imagePhone: uploadedImageSchema.nullable().optional(),
    /** The page whose `placement` it takes. */
    pageId: bodyIdSchema,
  })
  .refine(englishComplete, ENGLISH_INCOMPLETE)
  .refine(datesInOrder, DATES_OUT_OF_ORDER);

export type UpdateBannerValues = z.infer<typeof updateBannerSchema>;

export const deleteBannerSchema = z.object({ id: pathIdSchema });

/** One place of a page's sequence under its cover. */
export const pageSectionSchema = z.discriminatedUnion("kind", [
  z.object({ categoryId: bodyIdSchema, kind: z.literal("category") }),
  z.object({ kind: z.literal("best_sellers") }),
  z.object({ kind: z.literal("featured") }),
  z.object({ bannerId: bodyIdSchema, kind: z.literal("banner") }),
]);

export type PageSection = z.infer<typeof pageSectionSchema>;

/** The key that tells one place of the sequence from every other. */
export function pageSectionKey(section: PageSection): string {
  if (section.kind === "category") {
    return `category:${section.categoryId}`;
  }

  return section.kind === "banner"
    ? `banner:${section.bannerId}`
    : section.kind;
}

function unique(ids: readonly unknown[]): boolean {
  return new Set(ids).size === ids.length;
}

/**
 * A page's order (FER-020, FER-058): the cover's banners in their order;
 * the sequence under it (the categories' rows, "best sellers", "featured"
 * and the banners between rows); and the store's curated lists the page's
 * editor holds, the best sellers, up to ten in their order, and the
 * featured articles, none or two to four. Saved whole.
 */
export const savePageLayoutSchema = z.object({
  coverBannerIds: z
    .array(bodyIdSchema)
    .max(COVER_BANNERS_MAX)
    .refine(unique, { error: "Give each banner once" }),
  featuredProductIds: z
    .array(bodyIdSchema)
    .max(FEATURED_MAX, `Feature at most ${FEATURED_MAX} articles`)
    .refine(unique, { error: "Give each article once" })
    .refine((ids) => ids.length === 0 || ids.length >= FEATURED_MIN, {
      error: `Feature none or at least ${FEATURED_MIN} articles`,
    }),
  rankingProductIds: z
    .array(bodyIdSchema)
    .max(RANKING_MAX, `Rank at most ${RANKING_MAX} articles`)
    .refine(unique, { error: "Give each article once" }),
  sections: z
    .array(pageSectionSchema)
    .max(SECTIONS_MAX)
    .refine((sections) => unique(sections.map(pageSectionKey)), {
      error: "Give each row and banner once",
    }),
});

export type SavePageLayoutValues = z.infer<typeof savePageLayoutSchema>;

/** `page.saveLayout`'s input: the order and the page it is for. */
export const savePageLayoutInputSchema = savePageLayoutSchema.extend({
  pageId: pathIdSchema,
});

/** What the announcement form says under a field it refuses. */
export interface AnnouncementFormMessages {
  dateInvalid: string;
  endBeforeStart: string;
  linkInvalid: string;
  linkTooLong: string;
  shortNeedsText: string;
  shortTooLong: string;
  textRequired: string;
  textTooLong: string;
}

/** A day typed into `<input type="date">`: `""` is none. */
function formDate(invalid: string) {
  return z
    .string()
    .transform((typed) => (typed === "" ? null : typed))
    .pipe(z.string().refine(isCalendarDate, { error: invalid }).nullable());
}

/** A link typed into the form: blank is none. */
function formLink(messages: { linkInvalid: string; linkTooLong: string }) {
  return z
    .string()
    .trim()
    .transform((typed) => (typed === "" ? null : typed))
    .pipe(
      homeLink({
        invalid: messages.linkInvalid,
        tooLong: messages.linkTooLong,
      }).nullable()
    );
}

/** The announcement form's fields: strings and the switch, `""` for none. */
export interface AnnouncementFormFields {
  endsOn: string;
  isActive: boolean;
  linkUrl: string;
  shortTextEn: string;
  shortTextEs: string;
  startsOn: string;
  textEn: string;
  textEs: string;
}

/**
 * The announcement form's fields, read into what `page.saveAnnouncement`
 * takes, with the page's words for a refusal.
 */
export function createAnnouncementFormSchema(
  messages: AnnouncementFormMessages
) {
  const short = blankText(
    ANNOUNCEMENT_SHORT_TEXT_MAX_LENGTH,
    messages.shortTooLong
  );

  return z
    .object({
      endsOn: formDate(messages.dateInvalid),
      isActive: z.boolean(),
      linkUrl: formLink(messages),
      shortTextEn: short,
      shortTextEs: short,
      startsOn: formDate(messages.dateInvalid),
      textEn: blankText(ANNOUNCEMENT_TEXT_MAX_LENGTH, messages.textTooLong),
      textEs: requiredText(
        ANNOUNCEMENT_TEXT_MAX_LENGTH,
        messages.textRequired,
        messages.textTooLong
      ),
    })
    .refine(datesInOrder, {
      error: messages.endBeforeStart,
      path: ["endsOn"],
    })
    .refine((value) => value.shortTextEn === null || value.textEn !== null, {
      error: messages.shortNeedsText,
      path: ["shortTextEn"],
    });
}

/** What the banner form says under a field it refuses. */
export interface BannerFormMessages {
  articleRequired: string;
  categoryRequired: string;
  ctaNeedsTitle: string;
  ctaTooLong: string;
  dateInvalid: string;
  endBeforeStart: string;
  imageRequired: string;
  linkInvalid: string;
  linkTooLong: string;
  titleRequired: string;
  titleTooLong: string;
}

/**
 * A photo as the banner form holds it: a new upload, or the one stored,
 * which may be a seed's `/seed/...` file. The form never decides which
 * addresses are allowed: an edit sends a photo only when it changed, and
 * the server checks a new one is this deployment's upload.
 */
const storedImageSchema = z.object({
  height: z.number().int().positive(),
  url: z.string().min(1),
  width: z.number().int().positive(),
});

/** The banner form's fields, as the form holds them. */
export interface BannerFormFields {
  ctaLabelEn: string;
  ctaLabelEs: string;
  endsOn: string;
  image: z.infer<typeof uploadedImageSchema> | null;
  imagePhone: z.infer<typeof uploadedImageSchema> | null;
  isActive: boolean;
  linkCategoryId: string;
  linkKind: BannerLinkKind;
  linkProductId: string;
  linkUrl: string;
  placement: BannerPlacement;
  /** The place between rows, as the select holds it: a number in text. */
  rowsIndex: string;
  startsOn: string;
  titleEn: string;
  titleEs: string;
}

/** What the banner form gives once valid: a banner's fields and photos. */
export type BannerFormValues = BannerFields & {
  image: z.infer<typeof uploadedImageSchema>;
  imagePhone: z.infer<typeof uploadedImageSchema> | null;
};

/**
 * The banner form's fields, read into a banner's values (its photos, texts,
 * link, switch, days and place), with the page's words for a refusal. The
 * link's target is chosen from lists, so an empty choice is the only way it
 * can be wrong here; the service checks it is the store's.
 */
export function createBannerFormSchema(messages: BannerFormMessages) {
  const cta = blankText(BANNER_CTA_MAX_LENGTH, messages.ctaTooLong);

  return z
    .object({
      ctaLabelEn: cta,
      ctaLabelEs: cta,
      endsOn: formDate(messages.dateInvalid),
      // Read as a field, so a missing photo is said beside a missing title.
      image: storedImageSchema.nullable().transform((image, context) => {
        if (image === null) {
          context.addIssue({ code: "custom", message: messages.imageRequired });

          return z.NEVER;
        }

        return image;
      }),
      imagePhone: storedImageSchema.nullable(),
      isActive: z.boolean(),
      linkCategoryId: z.string(),
      linkKind: z.enum(BANNER_LINK_KINDS),
      linkProductId: z.string(),
      linkUrl: z.string(),
      placement: z.enum(BANNER_PLACEMENTS),
      rowsIndex: z.string(),
      startsOn: formDate(messages.dateInvalid),
      titleEn: blankText(BANNER_TITLE_MAX_LENGTH, messages.titleTooLong),
      titleEs: requiredText(
        BANNER_TITLE_MAX_LENGTH,
        messages.titleRequired,
        messages.titleTooLong
      ),
    })
    .transform((fields, context): BannerFormValues => {
      const link = readFormLink(fields, messages, context);
      const rowsIndex = Number(fields.rowsIndex);

      if (fields.ctaLabelEn !== null && fields.titleEn === null) {
        context.addIssue({
          code: "custom",
          message: messages.ctaNeedsTitle,
          path: ["ctaLabelEn"],
        });
      }

      if (!datesInOrder(fields)) {
        context.addIssue({
          code: "custom",
          message: messages.endBeforeStart,
          path: ["endsOn"],
        });
      }

      if (link === null) {
        return z.NEVER;
      }

      return {
        ctaLabelEn: fields.ctaLabelEn,
        ctaLabelEs: fields.ctaLabelEs,
        endsOn: fields.endsOn,
        image: fields.image,
        imagePhone: fields.imagePhone,
        isActive: fields.isActive,
        link,
        placement: fields.placement,
        ...(fields.placement === "rows" && Number.isInteger(rowsIndex)
          ? { rowsIndex }
          : {}),
        startsOn: fields.startsOn,
        titleEn: fields.titleEn,
        titleEs: fields.titleEs,
      };
    });
}

/** The id a select holds (`"12"`), or `null` for none chosen (`""`). */
function chosenId(selected: string): number | null {
  const id = Number(selected);

  return bodyIdSchema.safeParse(id).success ? id : null;
}

/** The banner form's link fields as one link, or `null` once refused. */
function readFormLink(
  fields: Pick<
    BannerFormFields,
    "linkCategoryId" | "linkKind" | "linkProductId" | "linkUrl"
  >,
  messages: BannerFormMessages,
  context: z.RefinementCtx
): BannerLink | null {
  const refuse = (path: string, message: string) => {
    context.addIssue({ code: "custom", message, path: [path] });

    return null;
  };

  if (fields.linkKind === "product") {
    const productId = chosenId(fields.linkProductId);

    return productId === null
      ? refuse("linkProductId", messages.articleRequired)
      : { kind: "product", productId };
  }

  if (fields.linkKind === "category") {
    const categoryId = chosenId(fields.linkCategoryId);

    return categoryId === null
      ? refuse("linkCategoryId", messages.categoryRequired)
      : { categoryId, kind: "category" };
  }

  if (fields.linkKind === "url") {
    const url = homeLink({
      invalid: messages.linkInvalid,
      tooLong: messages.linkTooLong,
    }).safeParse(fields.linkUrl);

    // A blank link is refused as an invalid one: `isSafeHomeLink("")`.
    return url.success
      ? { kind: "url", url: url.data }
      : refuse("linkUrl", url.error.issues[0]?.message ?? messages.linkInvalid);
  }

  return { kind: "none" };
}

/** A page's order form's fields, as its lists hold them. */
export interface PageLayoutFormFields {
  cover: { bannerId: number }[];
  featured: { productId: number }[];
  /** The article the "featured" picker holds, an id in text or `""`. */
  featuredPick: string;
  ranking: { productId: number }[];
  /** The article the "best sellers" picker holds, the same way. */
  rankingPick: string;
  sections: { section: PageSection }[];
}

/**
 * A page's order form's fields, read into what `page.saveLayout` takes,
 * with the page's words for the one rule a person can break by hand (the
 * featured articles are none or two to four; the lists cap the rest) and
 * for a cover or rows that list an entry twice, which the lists never do
 * by hand but the save would refuse.
 */
export function createPageLayoutFormSchema(messages: {
  featuredCount: string;
  repeated: string;
}) {
  return z
    .object({
      cover: z
        .array(z.object({ bannerId: bodyIdSchema }))
        .refine((rows) => unique(rows.map((row) => row.bannerId)), {
          error: messages.repeated,
        }),
      featured: z
        .array(z.object({ productId: bodyIdSchema }))
        .refine(
          (rows) =>
            rows.length === 0 ||
            (rows.length >= FEATURED_MIN && rows.length <= FEATURED_MAX),
          { error: messages.featuredCount }
        ),
      featuredPick: z.string(),
      ranking: z.array(z.object({ productId: bodyIdSchema })).max(RANKING_MAX),
      rankingPick: z.string(),
      sections: z
        .array(z.object({ section: pageSectionSchema }))
        .refine(
          (rows) => unique(rows.map((row) => pageSectionKey(row.section))),
          {
            error: messages.repeated,
          }
        ),
    })
    .transform((fields): SavePageLayoutValues => ({
      coverBannerIds: fields.cover.map((row) => row.bannerId),
      featuredProductIds: fields.featured.map((row) => row.productId),
      rankingProductIds: fields.ranking.map((row) => row.productId),
      sections: fields.sections.map((row) => row.section),
    }));
}
