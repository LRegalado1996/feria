import { z } from "zod";

import { LOCALES } from "@/lib/i18n/config";
import { uploadedImageSchema } from "@/lib/schemas/upload";

/** A category's or an article's address segment: what `slugify` produces. */
export const CATALOG_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CATALOG_SLUG_MAX_LENGTH = 80;

export const PRODUCT_STATUSES = ["draft", "published"] as const;

/**
 * The catalog's orders, as its menu lists them: the store's own (FER-044),
 * the default; by price either way; newest first (FER-023).
 */
export const PRODUCT_SORTS = [
  "position",
  "price_asc",
  "price_desc",
  "newest",
] as const;

export type ProductSort = (typeof PRODUCT_SORTS)[number];

/** The order a catalog address without `?sort=` shows: the store's own. */
export const DEFAULT_PRODUCT_SORT: ProductSort = "position";

/** The column each order's cursor carries, besides the id. */
export const PRODUCT_SORT_KEYS = {
  newest: "publishedAt",
  position: "position",
  price_asc: "priceAmount",
  price_desc: "priceAmount",
} as const satisfies Record<ProductSort, string>;

export const PRODUCT_TITLE_MAX_LENGTH = 120;
export const PRODUCT_DESCRIPTION_MAX_LENGTH = 4000;
export const PRODUCT_SEO_TITLE_MAX_LENGTH = 70;
export const PRODUCT_SEO_DESCRIPTION_MAX_LENGTH = 160;
/** 999 999,99 in either currency, far above any article and inside int4. */
export const PRODUCT_PRICE_MAX = 99_999_999;
/** The filter values one article carries at most (FER-033). */
export const PRODUCT_ATTRIBUTE_VALUES_MAX = 50;
export const SEARCH_MAX_LENGTH = 100;
export const PRODUCTS_PAGE_SIZE = 24;
export const CATALOG_FILTERS_MAX = 10;
export const CATALOG_FILTER_VALUES_MAX = 20;
export const PRODUCTS_PAGE_SIZE_MAX = 48;
export const RELATED_PRODUCTS_DEFAULT = 4;
export const RELATED_PRODUCTS_MAX = 12;

/** The largest value of a Postgres `integer`, every id column's type. */
export const INT4_MAX = 2_147_483_647;

// Coerced: the REST surface reads ids and page sizes from the path and the
// query string. `Number("")` is 0, which `positive()` and `min(1)` refuse.
const idSchema = z.coerce.number().int().positive().max(INT4_MAX);

// Not coerced: a JSON body sends numbers as numbers, and `Number(true)` is 1,
// which would attach category 1 instead of refusing a malformed body.
const bodyIdSchema = z.number().int().positive().max(INT4_MAX);
const localeSchema = z.enum(LOCALES);

export const catalogSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(CATALOG_SLUG_MAX_LENGTH)
  .regex(CATALOG_SLUG_PATTERN);

/** A public read: the language to answer in. */
const publicCatalogSchema = z.object({ locale: localeSchema });

export const listCategoriesSchema = publicCatalogSchema;

// Empty text is refused before coercion: `Number("")` is 0.
const cursorIntegerSchema = z
  .union([z.number(), z.string().trim().min(1).transform(Number)])
  .pipe(z.number().int().min(0).max(INT4_MAX));

/**
 * The keyset cursor of the public list: the sort that made it and the last
 * row's key in that sort, whole (`position`, `publishedAt` or `priceAmount`,
 * then `id` to break ties), so a page never repeats or skips a row while
 * others are inserted. Both price orders share a key, so the sort itself is
 * what tells a cursor from one apart from the other.
 */
export const productCursorSchema = z
  .object({
    id: idSchema,
    sort: z.enum(PRODUCT_SORTS),
    // The key of that sort (`PRODUCT_SORT_KEYS`), and only that one.
    position: cursorIntegerSchema.optional(),
    priceAmount: cursorIntegerSchema.optional(),
    // Postgres has no year 0, so a cursor from it would fail in the database.
    publishedAt: z.iso
      .datetime({ offset: true })
      .refine((value) => !value.startsWith("0000"), {
        message: "Not a date a row can have",
      })
      .optional(),
  })
  .refine(
    (cursor) =>
      (["position", "priceAmount", "publishedAt"] as const).every(
        (key) =>
          (cursor[key] !== undefined) ===
          (PRODUCT_SORT_KEYS[cursor.sort] === key)
      ),
    "A cursor carries its sort's key, and only it"
  );

/**
 * The catalog's filters as the page read them from the URL: each filter's
 * slug with the slugs of the values asked for. Unknown ones are ignored by
 * the service, so an old link never breaks; this only bounds the input.
 */
export const catalogFiltersSchema = z
  .array(
    z.object({
      attribute: catalogSlugSchema,
      values: z.array(catalogSlugSchema).min(1).max(CATALOG_FILTER_VALUES_MAX),
    })
  )
  .max(CATALOG_FILTERS_MAX);

export type CatalogFilters = z.infer<typeof catalogFiltersSchema>;

export const listProductsSchema = publicCatalogSchema.extend({
  category: catalogSlugSchema.optional(),
  // The store's own filters (FER-033): values of one filter are
  // alternatives, different filters narrow each other.
  filters: catalogFiltersSchema.optional(),
  cursor: productCursorSchema.optional(),
  sort: z.enum(PRODUCT_SORTS).default(DEFAULT_PRODUCT_SORT),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PRODUCTS_PAGE_SIZE_MAX)
    .default(PRODUCTS_PAGE_SIZE),
  // Blank is no search, not a search for nothing.
  q: z
    .string()
    .trim()
    .max(SEARCH_MAX_LENGTH)
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
});

export const getProductSchema = publicCatalogSchema.extend({
  slug: catalogSlugSchema,
});

export const listRelatedProductsSchema = getProductSchema.extend({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(RELATED_PRODUCTS_MAX)
    .default(RELATED_PRODUCTS_DEFAULT),
});

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable();

/**
 * An article's texts in one language. The title may be blank: a draft exists
 * from its first photo on, before anyone named it (FER-017). Publishing needs
 * the Spanish one, and the title of any other language the article has
 * (`resolvePublishGaps`).
 */
export const productTranslationSchema = z.object({
  description: z.string().trim().max(PRODUCT_DESCRIPTION_MAX_LENGTH),
  locale: localeSchema,
  seoDescription: optionalText(PRODUCT_SEO_DESCRIPTION_MAX_LENGTH),
  seoTitle: optionalText(PRODUCT_SEO_TITLE_MAX_LENGTH),
  title: z.string().trim().max(PRODUCT_TITLE_MAX_LENGTH),
});

export type ProductTranslationValues = z.infer<typeof productTranslationSchema>;

/** Whether a language's texts hold nothing at all: no text in that language. */
function isBlankTranslation(row: ProductTranslationValues): boolean {
  return (
    row.title === "" &&
    row.description === "" &&
    row.seoTitle === null &&
    row.seoDescription === null
  );
}

/** At most this many photos per article (FER-017); the first is its cover. */
export const PRODUCT_IMAGES_MAX = 8;

/**
 * A path on this site, as a photo saved before uploads has it (the seed's
 * `/seed/<file>`): one slash, then no second one, no query and no spaces.
 */
const SITE_PATH_PATTERN = /^\/[\w.-][\w./-]*$/u;

/**
 * One of the article's photos, in the order the article shows them. A photo
 * the article already has is sent back as it is stored, which for one saved
 * before uploads is a path on this site; a new one is an upload's address,
 * which the service checks is this deployment's own (`isOwnBlobUrl`).
 */
export const productImageInputSchema = uploadedImageSchema.extend({
  url: z.union([
    uploadedImageSchema.shape.url,
    z.string().max(500).regex(SITE_PATH_PATTERN),
  ]),
});

export type ProductImageValues = z.infer<typeof productImageInputSchema>;

/**
 * An article's editable fields, everything the wizard (FER-017) holds, so
 * one write saves the whole article. Spanish is required (it names the slug
 * and is the fallback for every other language); each language at most once,
 * and one holding no text at all is no text in that language, dropped. The
 * photos come in their order, each once; the filter values replace the ones
 * the article had.
 */
const productFieldsSchema = z.object({
  attributeValueIds: z
    .array(bodyIdSchema)
    .max(PRODUCT_ATTRIBUTE_VALUES_MAX)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Each value at most once",
    }),
  categoryId: bodyIdSchema.nullable(),
  images: z
    .array(productImageInputSchema)
    .max(PRODUCT_IMAGES_MAX)
    .refine(
      (images) =>
        new Set(images.map((image) => image.url)).size === images.length,
      { message: "Each photo at most once" }
    ),
  isAvailable: z.boolean(),
  priceAmount: z.number().int().min(0).max(PRODUCT_PRICE_MAX).nullable(),
  translations: z
    .array(productTranslationSchema)
    .min(1)
    .max(LOCALES.length)
    .refine(
      (rows) => new Set(rows.map((row) => row.locale)).size === rows.length,
      { message: "Each language at most once" }
    )
    .refine((rows) => rows.some((row) => row.locale === "es"), {
      message: "The Spanish texts are required",
    })
    .transform((rows) =>
      rows.filter((row) => row.locale === "es" || !isBlankTranslation(row))
    ),
});

export const createProductSchema = z.object(productFieldsSchema.shape);

export type CreateProductValues = z.infer<typeof createProductSchema>;

export const productIdSchema = z.object({ id: idSchema });

export const updateProductSchema = productIdSchema.extend(
  productFieldsSchema.shape
);

export type UpdateProductValues = z.infer<typeof updateProductSchema>;

export const setProductAvailabilitySchema = productIdSchema.extend({
  isAvailable: z.boolean(),
});

/** The messages the article wizard (FER-017) shows under its fields. */
export interface ProductFormMessages {
  descriptionTooLong: string;
  priceDecimals: string;
  priceNegative: string;
  priceTooHigh: string;
  titleTooLong: string;
}

/** Cents per unit of either currency the store sells in. */
export const PRICE_MINOR_UNITS = 100;

/**
 * The article wizard's own schema (FER-017), its messages in the page's
 * language: every field as the form holds it. The price is in whole units
 * as typed (`12.5`), `null` while blank or refused, and becomes minor units
 * only on its way out; it may not carry more decimals than the cents hold,
 * which would be rounded silently. The category is the `<select>`'s value,
 * `""` for none. A blank text is a draft's right: what publishing needs is
 * `resolvePublishGaps`'s, not this schema's. No search texts: an article's
 * come from its title and description (Lucas, 2026-11-18). Without messages
 * (a local copy read back from the browser, FER-017) zod's own are kept.
 */
export function createProductFormSchema(messages?: ProductFormMessages) {
  const texts = z.object({
    description: z
      .string()
      .trim()
      .max(PRODUCT_DESCRIPTION_MAX_LENGTH, messages?.descriptionTooLong),
    title: z
      .string()
      .trim()
      .max(PRODUCT_TITLE_MAX_LENGTH, messages?.titleTooLong),
  });

  return z.object({
    attributeValueIds: z.array(bodyIdSchema).max(PRODUCT_ATTRIBUTE_VALUES_MAX),
    categoryId: z.string().regex(/^\d*$/u),
    en: texts,
    es: texts,
    // A photo the article holds, as `product.get` answered it, or a new
    // upload: the server checks the address, so only the shape counts here.
    images: z
      .array(
        z.object({
          height: z.number().int().positive(),
          url: z.string().min(1).max(500),
          width: z.number().int().positive(),
        })
      )
      .max(PRODUCT_IMAGES_MAX),
    isAvailable: z.boolean(),
    price: z
      .number()
      .min(0, messages?.priceNegative)
      .max(PRODUCT_PRICE_MAX / PRICE_MINOR_UNITS, messages?.priceTooHigh)
      .refine(
        (value) => {
          const cents = value * PRICE_MINOR_UNITS;
          return Math.abs(cents - Math.round(cents)) < 1e-6;
        },
        { message: messages?.priceDecimals }
      )
      .nullable(),
  });
}

export type ProductFormValues = z.infer<
  ReturnType<typeof createProductFormSchema>
>;

/**
 * The columns the admin's article list sorts by (FER-019): the last change
 * (the default), the title and the category's name in the page's language,
 * the price and the status.
 */
export const STORE_PRODUCT_SORTS = [
  "updated",
  "title",
  "category",
  "price",
  "status",
] as const;

export type StoreProductSort = (typeof STORE_PRODUCT_SORTS)[number];

export const SORT_DIRECTIONS = ["asc", "desc"] as const;

export type SortDirection = (typeof SORT_DIRECTIONS)[number];

/** The order the admin's list opens in: the most recent change first. */
export const DEFAULT_STORE_PRODUCT_SORT: StoreProductSort = "updated";

/**
 * Each column's first direction, what a sort without `dir` means: the most
 * recent change first, A to Z, the cheapest first, drafts first.
 */
export const STORE_PRODUCT_SORT_DIRECTIONS = {
  category: "asc",
  price: "asc",
  status: "asc",
  title: "asc",
  updated: "desc",
} as const satisfies Record<StoreProductSort, SortDirection>;

/** Whether an article can be bought, as the admin's list filters it. */
export const PRODUCT_AVAILABILITIES = ["available", "unavailable"] as const;

export type ProductAvailability = (typeof PRODUCT_AVAILABILITIES)[number];

/**
 * How far the admin's list counts its matches (`docs/agents/database.md`:
 * count capped): past it, the total reads "10.000+" and the pages stop at
 * `ceil(cap / limit)`, so the service answers a page past that one with no
 * rows, like any page past the last. It bounds the page number too: at one
 * row a page, the cap is the last page there can be.
 */
export const STORE_PRODUCTS_COUNT_CAP = 10_000;

/**
 * The admin's articles (FER-017, FER-019), drafts and published, one
 * numbered page at a time (Lucas chose numbered pages over endless scrolling,
 * 2026-11-18), searched by title, narrowed by status, availability,
 * categories (a group's slug stands for all of it) and the store's filters,
 * sorted by a column. Unknown category, filter or value slugs are ignored,
 * as the storefront ignores them: an old bookmark filters less, never fails.
 * `locale` is the page's language, which the title and the category sort by.
 */
export const listStoreProductsSchema = z.object({
  availability: z.enum(PRODUCT_AVAILABILITIES).optional(),
  categories: z
    .array(catalogSlugSchema)
    .max(CATALOG_FILTER_VALUES_MAX)
    .optional(),
  dir: z.enum(SORT_DIRECTIONS).optional(),
  filters: catalogFiltersSchema.optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PRODUCTS_PAGE_SIZE_MAX)
    .default(PRODUCTS_PAGE_SIZE),
  locale: localeSchema,
  page: z.coerce.number().int().min(1).max(STORE_PRODUCTS_COUNT_CAP).default(1),
  // Blank is no search, not a search for nothing.
  q: z
    .string()
    .trim()
    .max(SEARCH_MAX_LENGTH)
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
  sort: z.enum(STORE_PRODUCT_SORTS).default(DEFAULT_STORE_PRODUCT_SORT),
  status: z.enum(PRODUCT_STATUSES).optional(),
});

export type ListStoreProductsInput = z.input<typeof listStoreProductsSchema>;
export type ListStoreProductsValues = z.infer<typeof listStoreProductsSchema>;

export type ListProductsValues = z.infer<typeof listProductsSchema>;
export type ProductCursor = z.infer<typeof productCursorSchema>;

export const CATEGORY_NAME_MAX_LENGTH = 60;

const categoryNamesSchema = z.object({
  // English is optional: the storefront shows the Spanish name where it has
  // none (Lucas, 2026-11-14).
  nameEn: z
    .string()
    .trim()
    .max(CATEGORY_NAME_MAX_LENGTH)
    .transform((value) => (value === "" ? null : value))
    .nullable(),
  nameEs: z.string().trim().min(1).max(CATEGORY_NAME_MAX_LENGTH),
});

export const createCategorySchema = z.object(categoryNamesSchema.shape);

export type CreateCategoryValues = z.infer<typeof createCategorySchema>;

export const renameCategorySchema = z
  .object({ id: idSchema })
  .extend(categoryNamesSchema.shape);

export type RenameCategoryValues = z.infer<typeof renameCategorySchema>;

/** Every category of the store, once each, in the new order. */
export const reorderCategoriesSchema = z.object({
  ids: z
    .array(bodyIdSchema)
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Each category at most once",
    }),
});

/**
 * A category to delete and, when it still has articles, the category of the
 * same store they move to: none is ever left without one.
 */
export const deleteCategorySchema = z.object({
  id: idSchema,
  moveToId: bodyIdSchema.nullable(),
});

/** What a search result shows of a page: its title and its description. */
export const CATEGORY_SEO_TITLE_MAX_LENGTH = 70;
export const CATEGORY_SEO_DESCRIPTION_MAX_LENGTH = 160;
export const COVER_ALT_MAX_LENGTH = 200;

/**
 * A category's slug is its page's address (`/burbujeros`, FER-043), so it
 * is never a path the site already answers, nor a language prefix: a
 * category named "Cart" gets `/cart-2`. Every slug is made on the server
 * from the Spanish name, never taken from a request, so the service holds
 * this rule. A path added here comes with a migration that renames the
 * categories already holding it, as `0015` does; FER-048 has the database
 * refuse one too.
 */
export const RESERVED_CATEGORY_SLUGS = [
  "admin",
  "api",
  "apple-icon",
  "brand",
  "cart",
  "coming-soon",
  "design",
  "en",
  "es",
  "icon",
  "llms",
  "monitoring",
  "opengraph-image",
  "orders",
  "productos",
  "robots",
  "seed",
  "sitemap",
] as const;

/**
 * A category's page (FER-043): the group it belongs to, or none, and its
 * texts for search engines and its cover's description, in both languages.
 * An empty text is `null`: the page writes its own from the names. The
 * cover's two images (FER-011) are each an uploaded image, `null` to remove
 * it, or left out to keep the one stored: what a form that did not touch
 * them sends, and a tab older than uploads. `showInHeader` (FER-051) left
 * out keeps the stored choice, so a tab older than it changes nothing.
 */
export const updateCategoryPageSchema = z.object({
  cover: uploadedImageSchema.nullable().optional(),
  coverAltEn: optionalText(COVER_ALT_MAX_LENGTH),
  coverAltEs: optionalText(COVER_ALT_MAX_LENGTH),
  coverPhone: uploadedImageSchema.nullable().optional(),
  id: idSchema,
  parentId: bodyIdSchema.nullable(),
  seoDescriptionEn: optionalText(CATEGORY_SEO_DESCRIPTION_MAX_LENGTH),
  seoDescriptionEs: optionalText(CATEGORY_SEO_DESCRIPTION_MAX_LENGTH),
  seoTitleEn: optionalText(CATEGORY_SEO_TITLE_MAX_LENGTH),
  seoTitleEs: optionalText(CATEGORY_SEO_TITLE_MAX_LENGTH),
  showInHeader: z.boolean().optional(),
});

export type UpdateCategoryPageValues = z.infer<typeof updateCategoryPageSchema>;

/** The messages the category's page form shows under its fields. */
interface CategoryPageFormMessages {
  altTooLong: string;
  descriptionTooLong: string;
  titleTooLong: string;
}

/**
 * The category's page form (FER-043), its messages in the page's language.
 * The group is the `<select>`'s value: `""` for none, else the group's id.
 * Without an English name (`english: false`) the English texts are shut
 * and sent as none, so what they still hold is not held to their limits:
 * a draft over one could not be shortened, and would block the save.
 */
export function createCategoryPageFormSchema(
  messages: CategoryPageFormMessages,
  { english }: { english: boolean }
) {
  const text = (max: number, message: string) =>
    z.string().trim().max(max, message);
  const englishText = (max: number, message: string) =>
    english ? text(max, message) : z.string();

  // An image as the form holds it: one stored before uploads (a seed's
  // `/seed/...` path) is shown and kept as it is, so only its shape counts.
  const image = z
    .object({
      height: z.number().int().positive(),
      url: z.string().min(1),
      width: z.number().int().positive(),
    })
    .nullable();

  return z.object({
    cover: image,
    coverAltEn: englishText(COVER_ALT_MAX_LENGTH, messages.altTooLong),
    coverAltEs: text(COVER_ALT_MAX_LENGTH, messages.altTooLong),
    coverPhone: image,
    parentId: z.string().regex(/^\d*$/u),
    seoDescriptionEn: englishText(
      CATEGORY_SEO_DESCRIPTION_MAX_LENGTH,
      messages.descriptionTooLong
    ),
    seoDescriptionEs: text(
      CATEGORY_SEO_DESCRIPTION_MAX_LENGTH,
      messages.descriptionTooLong
    ),
    seoTitleEn: englishText(
      CATEGORY_SEO_TITLE_MAX_LENGTH,
      messages.titleTooLong
    ),
    seoTitleEs: text(CATEGORY_SEO_TITLE_MAX_LENGTH, messages.titleTooLong),
    showInHeader: z.boolean(),
  });
}

export type CategoryPageFormValues = z.infer<
  ReturnType<typeof createCategoryPageFormSchema>
>;

/** The messages the category form shows under its fields. */
interface CategoryFormMessages {
  nameRequired: string;
  nameTooLong: string;
}

/**
 * The category form's own schema, its messages in the page's language. What
 * the form sends is then held to `createCategorySchema` by the procedure.
 */
export function createCategoryFormSchema(messages: CategoryFormMessages) {
  return z.object({
    nameEn: z
      .string()
      .trim()
      .max(CATEGORY_NAME_MAX_LENGTH, messages.nameTooLong),
    nameEs: z
      .string()
      .trim()
      .min(1, messages.nameRequired)
      .max(CATEGORY_NAME_MAX_LENGTH, messages.nameTooLong),
  });
}

export type CategoryFormValues = z.infer<
  ReturnType<typeof createCategoryFormSchema>
>;

/**
 * Query-string names the catalog already uses: a filter's slug is its URL
 * parameter, so it can never be one of these (FER-033).
 */
export const RESERVED_ATTRIBUTE_SLUGS = [
  "category",
  "cursor",
  "q",
  "sort",
] as const;

/** A swatch is `#` and six lowercase hex digits, like a store's colors. */
export const SWATCH_COLOR_PATTERN = /^#[0-9a-f]{6}$/;

export const ATTRIBUTE_NAME_MAX_LENGTH = 60;

export const listCatalogFiltersSchema = publicCatalogSchema.extend({});

/** A filter's or a value's names: the Spanish one required, English optional. */
const attributeNamesSchema = z.object({
  nameEn: z
    .string()
    .trim()
    .max(ATTRIBUTE_NAME_MAX_LENGTH)
    .transform((value) => (value === "" ? null : value))
    .nullable(),
  nameEs: z.string().trim().min(1).max(ATTRIBUTE_NAME_MAX_LENGTH),
});

export type AttributeNames = z.infer<typeof attributeNamesSchema>;

/**
 * The admin's form for a filter or a value (FER-033): the names as typed,
 * and the swatch as the color input gives it, `""` when there is none.
 */
export function createAttributeFormSchema(messages: CategoryFormMessages) {
  return createCategoryFormSchema(messages).extend({
    swatchColor: z.union([
      z.literal(""),
      z.string().regex(SWATCH_COLOR_PATTERN),
    ]),
  });
}

export type AttributeFormValues = z.infer<
  ReturnType<typeof createAttributeFormSchema>
>;

const swatchColorSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(SWATCH_COLOR_PATTERN)
  .nullable();

export const createAttributeSchema = z.object(attributeNamesSchema.shape);

export const renameAttributeSchema = z
  .object({ id: idSchema })
  .extend(attributeNamesSchema.shape);

export const reorderAttributesSchema = z.object({
  ids: z
    .array(bodyIdSchema)
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Each filter at most once",
    }),
});

export const deleteAttributeSchema = z.object({ id: idSchema });

export const createAttributeValueSchema = z
  .object({ attributeId: bodyIdSchema, swatchColor: swatchColorSchema })
  .extend(attributeNamesSchema.shape);

export const updateAttributeValueSchema = z
  .object({ id: idSchema, swatchColor: swatchColorSchema })
  .extend(attributeNamesSchema.shape);

export const reorderAttributeValuesSchema = z.object({
  attributeId: bodyIdSchema,
  ids: z
    .array(bodyIdSchema)
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Each value at most once",
    }),
});

export const deleteAttributeValueSchema = z.object({
  id: idSchema,
});
