import {
  type PublishGap,
  resolvePublishGaps,
} from "@/lib/catalog/publish-gaps";
import type { Locale } from "@/lib/i18n/config";
import type { client } from "@/lib/orpc/client";
import {
  type CreateProductValues,
  PRICE_MINOR_UNITS,
  type ProductFormValues,
} from "@/lib/schemas/catalog";

/** An article as `product.get` answers it, everything the wizard restores. */
export type StoreProduct = Awaited<ReturnType<typeof client.product.get>>;

/** One language's texts, as the wizard's form holds them. */
export type ProductFormTexts = ProductFormValues["es"];

const BLANK_TEXTS: ProductFormTexts = {
  description: "",
  seoDescription: "",
  seoTitle: "",
  title: "",
};

/** A new article in the wizard (FER-017): no photo yet, available. */
export function emptyProductForm(): ProductFormValues {
  return {
    attributeValueIds: [],
    categoryId: "",
    en: { ...BLANK_TEXTS },
    es: { ...BLANK_TEXTS },
    images: [],
    isAvailable: true,
    price: null,
  };
}

/** An article as `product.get` answered it, as the wizard's form holds it. */
export function productFormValues(
  article: Pick<
    StoreProduct,
    | "attributeValueIds"
    | "categoryId"
    | "images"
    | "isAvailable"
    | "priceAmount"
    | "translations"
  >
): ProductFormValues {
  const texts = (locale: Locale): ProductFormTexts => {
    const row = article.translations.find((text) => text.locale === locale);

    return row
      ? {
          description: row.description,
          seoDescription: row.seoDescription ?? "",
          seoTitle: row.seoTitle ?? "",
          title: row.title,
        }
      : { ...BLANK_TEXTS };
  };

  return {
    attributeValueIds: [...article.attributeValueIds],
    categoryId: article.categoryId === null ? "" : String(article.categoryId),
    en: texts("en"),
    es: texts("es"),
    images: article.images.map(({ height, url, width }) => ({
      height,
      url,
      width,
    })),
    isAvailable: article.isAvailable,
    price:
      article.priceAmount === null
        ? null
        : article.priceAmount / PRICE_MINOR_UNITS,
  };
}

/** Whether a language's texts hold anything at all. */
export function hasTexts(texts: ProductFormTexts): boolean {
  return Object.values(texts).some((text) => text.trim() !== "");
}

/**
 * What the form holds as `product.create` and `product.update` take it: the
 * price in minor units, the texts trimmed (a blank search text is none), the
 * category's id or none, and the English texts only when there are some, as
 * the server keeps them (a language with no text is no language).
 */
export function toProductValues(form: ProductFormValues): CreateProductValues {
  const row = (locale: Locale, texts: ProductFormTexts) => ({
    description: texts.description.trim(),
    locale,
    seoDescription: texts.seoDescription.trim() || null,
    seoTitle: texts.seoTitle.trim() || null,
    title: texts.title.trim(),
  });

  return {
    attributeValueIds: [...form.attributeValueIds],
    categoryId: form.categoryId === "" ? null : Number(form.categoryId),
    images: form.images.map(({ height, url, width }) => ({
      height,
      url,
      width,
    })),
    isAvailable: form.isAvailable,
    priceAmount:
      form.price === null ? null : Math.round(form.price * PRICE_MINOR_UNITS),
    translations: hasTexts(form.en)
      ? [row("es", form.es), row("en", form.en)]
      : [row("es", form.es)],
  };
}

/** What publishing the article as the form holds it still needs. */
export function formPublishGaps(form: ProductFormValues): PublishGap[] {
  const values = toProductValues(form);

  return resolvePublishGaps({
    categoryId: values.categoryId,
    imageCount: values.images.length,
    priceAmount: values.priceAmount,
    translations: values.translations,
  });
}

/**
 * Whether two states of the form save the same article: the filter values
 * as a set (the order they were tapped in changes nothing), the rest as the
 * write sends it.
 */
export function sameProduct(
  left: ProductFormValues,
  right: ProductFormValues
): boolean {
  const { attributeValueIds: leftIds, ...leftRest } = toProductValues(left);
  const { attributeValueIds: rightIds, ...rightRest } = toProductValues(right);
  const chosen = new Set(leftIds);

  return (
    leftIds.length === rightIds.length &&
    rightIds.every((id) => chosen.has(id)) &&
    JSON.stringify(leftRest) === JSON.stringify(rightRest)
  );
}
