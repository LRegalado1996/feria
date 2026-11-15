import { z } from "zod";

import { LOCALES } from "@/lib/i18n/config";
import { storeScopeSchema } from "@/lib/schemas/access";
import { storeSlugSchema } from "@/lib/schemas/store";

/** A category's or an article's address segment: what `slugify` produces. */
export const CATALOG_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CATALOG_SLUG_MAX_LENGTH = 80;

export const PRODUCT_STATUSES = ["draft", "published"] as const;

export const PRODUCT_TITLE_MAX_LENGTH = 120;
export const PRODUCT_DESCRIPTION_MAX_LENGTH = 4000;
export const PRODUCT_SEO_TITLE_MAX_LENGTH = 70;
export const PRODUCT_SEO_DESCRIPTION_MAX_LENGTH = 160;
/** 999 999,99 in either currency, far above any article and inside int4. */
export const PRODUCT_PRICE_MAX = 99_999_999;
export const SEARCH_MAX_LENGTH = 100;
export const PRODUCTS_PAGE_SIZE = 24;
export const PRODUCTS_PAGE_SIZE_MAX = 48;
export const RELATED_PRODUCTS_DEFAULT = 4;
export const RELATED_PRODUCTS_MAX = 12;

const idSchema = z.number().int().positive();
const localeSchema = z.enum(LOCALES);

export const catalogSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(CATALOG_SLUG_MAX_LENGTH)
  .regex(CATALOG_SLUG_PATTERN);

/** A public read: the store by its address and the language to answer in. */
const publicCatalogSchema = z.object({
  locale: localeSchema,
  storeSlug: storeSlugSchema,
});

export const listCategoriesSchema = publicCatalogSchema;

/**
 * The keyset cursor of the public list: the last row's sort key, whole
 * (`publishedAt`, then `id` to break ties), so a page never repeats or skips
 * a row while others are inserted.
 */
export const productCursorSchema = z.object({
  id: idSchema,
  publishedAt: z.iso.datetime({ offset: true }),
});

export const listProductsSchema = publicCatalogSchema.extend({
  category: catalogSlugSchema.optional(),
  cursor: productCursorSchema.optional(),
  limit: z
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
  limit: z
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
  categoryId: idSchema.nullable(),
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

export const createProductSchema = storeScopeSchema.extend(
  productFieldsSchema.shape
);

export type CreateProductValues = z.infer<typeof createProductSchema>;

export const productIdSchema = storeScopeSchema.extend({ id: idSchema });

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
    .array(idSchema)
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Each image at most once",
    }),
});

export type ListProductsValues = z.infer<typeof listProductsSchema>;
export type ProductCursor = z.infer<typeof productCursorSchema>;
