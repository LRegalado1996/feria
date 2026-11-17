import { z } from "zod";

import { LOCALES } from "@/lib/i18n/config";

/** A category's or an article's address segment: what `slugify` produces. */
export const CATALOG_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CATALOG_SLUG_MAX_LENGTH = 80;

export const PRODUCT_STATUSES = ["draft", "published"] as const;

/** The catalog's orders (FER-023): newest first, or by price either way. */
export const PRODUCT_SORTS = ["newest", "price_asc", "price_desc"] as const;

export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const PRODUCT_TITLE_MAX_LENGTH = 120;
export const PRODUCT_DESCRIPTION_MAX_LENGTH = 4000;
export const PRODUCT_SEO_TITLE_MAX_LENGTH = 70;
export const PRODUCT_SEO_DESCRIPTION_MAX_LENGTH = 160;
/** 999 999,99 in either currency, far above any article and inside int4. */
export const PRODUCT_PRICE_MAX = 99_999_999;
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

/**
 * The keyset cursor of the public list: the sort that made it and the last
 * row's key in that sort, whole (`publishedAt` or `priceAmount`, then `id` to
 * break ties), so a page never repeats or skips a row while others are
 * inserted. Both price orders share a key, so the sort itself is what tells
 * a cursor from one apart from the other.
 */
export const productCursorSchema = z
  .object({
    id: idSchema,
    sort: z.enum(PRODUCT_SORTS),
    // The key of that sort: `publishedAt` for the newest first,
    // `priceAmount` for a price order. Only that one.
    // Empty text is refused before coercion: `Number("")` is a price of 0.
    priceAmount: z
      .union([z.number(), z.string().trim().min(1).transform(Number)])
      .pipe(z.number().int().min(0).max(INT4_MAX))
      .optional(),
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
      cursor.sort === "newest"
        ? cursor.publishedAt !== undefined && cursor.priceAmount === undefined
        : cursor.priceAmount !== undefined && cursor.publishedAt === undefined,
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
  sort: z.enum(PRODUCT_SORTS).default("newest"),
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

export const productTranslationSchema = z.object({
  description: z.string().trim().max(PRODUCT_DESCRIPTION_MAX_LENGTH),
  locale: localeSchema,
  seoDescription: optionalText(PRODUCT_SEO_DESCRIPTION_MAX_LENGTH),
  seoTitle: optionalText(PRODUCT_SEO_TITLE_MAX_LENGTH),
  title: z.string().trim().min(1).max(PRODUCT_TITLE_MAX_LENGTH),
});

/**
 * An article's editable fields. Spanish is required (it names the slug and
 * is the fallback for every other language); each language at most once.
 */
const productFieldsSchema = z.object({
  categoryId: bodyIdSchema.nullable(),
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
      message: "The Spanish title is required",
    }),
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

/** Every image of the article, once each, in the new order. */
export const reorderProductImagesSchema = productIdSchema.extend({
  imageIds: z
    .array(bodyIdSchema)
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Each image at most once",
    }),
});

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
 * An empty text is `null`: the page writes its own from the names.
 */
export const updateCategoryPageSchema = z.object({
  coverAltEn: optionalText(COVER_ALT_MAX_LENGTH),
  coverAltEs: optionalText(COVER_ALT_MAX_LENGTH),
  id: idSchema,
  parentId: bodyIdSchema.nullable(),
  seoDescriptionEn: optionalText(CATEGORY_SEO_DESCRIPTION_MAX_LENGTH),
  seoDescriptionEs: optionalText(CATEGORY_SEO_DESCRIPTION_MAX_LENGTH),
  seoTitleEn: optionalText(CATEGORY_SEO_TITLE_MAX_LENGTH),
  seoTitleEs: optionalText(CATEGORY_SEO_TITLE_MAX_LENGTH),
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

  return z.object({
    coverAltEn: englishText(COVER_ALT_MAX_LENGTH, messages.altTooLong),
    coverAltEs: text(COVER_ALT_MAX_LENGTH, messages.altTooLong),
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
export const PRODUCT_ATTRIBUTE_VALUES_MAX = 50;

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

/** Every value the article carries, replacing what it had. */
export const setProductAttributeValuesSchema = productIdSchema.extend({
  valueIds: z
    .array(bodyIdSchema)
    .max(PRODUCT_ATTRIBUTE_VALUES_MAX)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Each value at most once",
    }),
});
