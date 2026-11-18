"use client";

import { ChevronDown } from "lucide-react";
import { Tabs } from "radix-ui";
import { type ReactNode, useId } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { z } from "zod";

import { Input } from "@/app/_components/atoms/input";
import type {
  AttributeFormResult,
  AttributeFormSaved,
} from "@/app/_components/molecules/attribute-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/_components/molecules/form";
import { ProductFilterChips } from "@/app/_components/molecules/product-filter-chips";
import { ProductSeoPreview } from "@/app/_components/molecules/product-seo-preview";
import { hasTexts } from "@/lib/catalog/product-form";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import type { client } from "@/lib/orpc/client";
import {
  PRICE_MINOR_UNITS,
  PRODUCT_SEO_DESCRIPTION_MAX_LENGTH,
  PRODUCT_SEO_TITLE_MAX_LENGTH,
  type ProductFormValues,
} from "@/lib/schemas/catalog";
import { articleSearchTexts } from "@/lib/seo/article-metadata";
import { cn } from "@/lib/utils";
import { type Currency, formatPrice } from "@/lib/utils/format";

type StoreCategory = Awaited<ReturnType<typeof client.category.list>>[number];
type StoreAttribute = Awaited<ReturnType<typeof client.attribute.list>>[number];

/** The two languages an article's texts are written in. */
export type TextLanguage = "en" | "es";

const textLanguageSchema = z.enum(["en", "es"]);

export interface ProductDetailsFormProps {
  /**
   * Where the "fill with AI" button of FER-018 goes: above the fields, once
   * that ticket hands it in. Nothing shows while it is left out.
   */
  assistant?: ReactNode;
  attributes: readonly StoreAttribute[];
  categories: readonly StoreCategory[];
  className?: string;
  currency: Currency;
  /** The language whose texts are on screen, Spanish first. */
  language: TextLanguage;
  onCreateValue: (
    attributeId: number,
    values: AttributeFormSaved
  ) => Promise<{ id?: number; result: AttributeFormResult }>;
  onLanguageChange: (language: TextLanguage) => void;
  /** What the search and share previews need beside the form. */
  seo: {
    /** The site's host, as a search result writes it. */
    host: string;
    /** The article's address segment, once it has one. */
    slug: string | null;
    storeName: string;
    /** The store's tagline in each language, the description's last default. */
    taglines: Record<TextLanguage, string | undefined>;
  };
}

const TEXTAREA_CLASS =
  "min-h-32 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40";

const SELECT_CLASS =
  "h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base aria-invalid:border-destructive md:h-9 md:text-sm";

/** A name in the page's language, else the Spanish one. */
function nameIn(row: { nameEn: string | null; nameEs: string }, en: boolean) {
  return en ? (row.nameEn ?? row.nameEs) : row.nameEs;
}

/**
 * The article's details (FER-017's second step), inside the wizard's form:
 * the title and the description in Spanish, with English one tab away
 * (optional; once any English is typed its title is needed to publish);
 * the category, groups holding their categories (a group may hold
 * articles of its own); the price in either notation (FER-035); whether it
 * can be bought; the store's filters as chips; and, folded away, the texts
 * for search engines with a live preview of the result and the share card.
 * Errors show under their field, in the page's language.
 */
function ProductDetailsForm({
  assistant,
  attributes,
  categories,
  className,
  currency,
  language,
  onCreateValue,
  onLanguageChange,
  seo,
}: ProductDetailsFormProps) {
  const { articles } = useDictionary();
  const copy = articles.wizard.details;
  const locale = useLocale();
  const en = locale === "en";
  const form = useFormContext<ProductFormValues>();
  const filtersTitle = useId();
  const [texts, otherTexts, price, images] = useWatch({
    control: form.control,
    name: [language, language === "es" ? "en" : "es", "price", "images"],
  });
  // The storefront in English shows the Spanish texts when there are none.
  const shown = language === "en" && !hasTexts(texts) ? otherTexts : texts;
  const search = articleSearchTexts(
    {
      description: shown.description.trim(),
      seoDescription: shown.seoDescription.trim() || null,
      seoTitle: shown.seoTitle.trim() || null,
      title: shown.title.trim(),
    },
    { name: seo.storeName, tagline: seo.taglines[language] }
  );
  const [main] = images;
  // The card's renderer fetches only a photo on this site (`ownUrl()`).
  const ownPhoto = main?.url.startsWith("/") ? main.url : null;
  const groups = new Set(
    categories.flatMap((row) => (row.parentId === null ? [] : [row.parentId]))
  );

  return (
    <div
      className={cn("grid max-w-3xl min-w-0 gap-6", className)}
      data-slot="product-details-form"
    >
      {assistant}
      <Tabs.Root
        className="grid min-w-0 gap-4"
        onValueChange={(value) => {
          const parsed = textLanguageSchema.safeParse(value);

          if (parsed.success) {
            onLanguageChange(parsed.data);
          }
        }}
        value={language}
      >
        <Tabs.List
          aria-label={copy.languages}
          className="inline-flex w-full rounded-lg border bg-muted p-1 sm:w-auto sm:justify-self-start"
        >
          {(["es", "en"] as const).map((tab) => (
            <Tabs.Trigger
              className="min-h-11 flex-1 rounded-md px-4 text-sm font-medium text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs sm:flex-none md:min-h-9"
              data-testid={`product-language-${tab}`}
              key={tab}
              value={tab}
            >
              {tab === "es" ? copy.spanish : copy.english}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content
          className="grid min-w-0 gap-4 outline-none"
          lang={language}
          value={language}
        >
          {language === "en" ? (
            <p className="text-xs text-muted-foreground">{copy.englishHint}</p>
          ) : null}
          <FormField
            control={form.control}
            key={`${language}.title`}
            name={`${language}.title`}
            render={({ field }) => (
              <FormItem className="min-w-0">
                <FormLabel>{copy.title}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    autoComplete="off"
                    enterKeyHint="next"
                    placeholder={copy.titlePlaceholder}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            key={`${language}.description`}
            name={`${language}.description`}
            render={({ field }) => (
              <FormItem className="min-w-0">
                <FormLabel>{copy.description}</FormLabel>
                <FormControl>
                  <textarea {...field} className={TEXTAREA_CLASS} rows={5} />
                </FormControl>
                <FormDescription className="text-xs">
                  {copy.descriptionHint}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </Tabs.Content>
      </Tabs.Root>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="categoryId"
          render={({ field }) => (
            <FormItem className="min-w-0 content-start">
              <FormLabel>{copy.category}</FormLabel>
              <FormControl>
                <select {...field} className={SELECT_CLASS}>
                  <option value="">{copy.categoryNone}</option>
                  {categories
                    .filter((row) => row.parentId === null)
                    .map((row) =>
                      groups.has(row.id) ? (
                        <optgroup key={row.id} label={nameIn(row, en)}>
                          <option value={String(row.id)}>
                            {interpolate(copy.categoryGroup, {
                              name: nameIn(row, en),
                            })}
                          </option>
                          {categories
                            .filter((child) => child.parentId === row.id)
                            .map((child) => (
                              <option key={child.id} value={String(child.id)}>
                                {nameIn(child, en)}
                              </option>
                            ))}
                        </optgroup>
                      ) : (
                        <option key={row.id} value={String(row.id)}>
                          {nameIn(row, en)}
                        </option>
                      )
                    )}
                </select>
              </FormControl>
              {categories.length === 0 ? (
                <FormDescription className="text-xs">
                  {copy.categoryEmpty}
                </FormDescription>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="price"
          render={({ field: { onChange, ...field } }) => (
            <FormItem className="min-w-0 content-start">
              <FormLabel>{copy.price}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  autoComplete="off"
                  enterKeyHint="done"
                  onValueChange={onChange}
                  type="number"
                />
              </FormControl>
              <FormDescription className="text-xs">
                {interpolate(copy.priceHint, { currency })}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={form.control}
        name="isAvailable"
        render={({ field: { onChange, value, ...field } }) => (
          <FormItem className="min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3">
            <FormControl>
              <input
                {...field}
                checked={value}
                className="size-5 accent-primary"
                onChange={(event) => {
                  onChange(event.currentTarget.checked);
                }}
                type="checkbox"
              />
            </FormControl>
            {/* 44 px to tap on a phone: the label is the target. */}
            <FormLabel className="min-h-11 md:min-h-9">
              {copy.available}
            </FormLabel>
            <FormDescription className="col-span-2 text-xs">
              {copy.availableHint}
            </FormDescription>
          </FormItem>
        )}
      />
      <section aria-labelledby={filtersTitle} className="grid gap-3">
        <div className="grid gap-1">
          <h3 className="text-sm font-semibold" id={filtersTitle}>
            {copy.filters}
          </h3>
          <p className="text-xs text-muted-foreground">{copy.filtersHint}</p>
        </div>
        <FormField
          control={form.control}
          name="attributeValueIds"
          render={({ field }) => (
            <ProductFilterChips
              attributes={attributes}
              onChange={(ids) => {
                field.onChange(ids);
              }}
              onCreateValue={onCreateValue}
              value={field.value}
            />
          )}
        />
      </section>
      <details className="group rounded-lg border bg-card" lang={language}>
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg px-4 text-sm font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          {copy.seo.summary}
          <ChevronDown
            aria-hidden
            className="size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <div className="grid gap-4 border-t p-4">
          <p className="text-xs text-muted-foreground">{copy.seo.hint}</p>
          {(
            [
              ["seoTitle", copy.seo.title, PRODUCT_SEO_TITLE_MAX_LENGTH],
              [
                "seoDescription",
                copy.seo.description,
                PRODUCT_SEO_DESCRIPTION_MAX_LENGTH,
              ],
            ] as const
          ).map(([name, label, max]) => (
            <FormField
              control={form.control}
              key={`${language}.${name}`}
              name={`${language}.${name}`}
              render={({ field }) => (
                <FormItem className="min-w-0">
                  <FormLabel>{label}</FormLabel>
                  <FormControl>
                    {name === "seoTitle" ? (
                      <Input {...field} autoComplete="off" />
                    ) : (
                      <textarea
                        {...field}
                        className={cn(TEXTAREA_CLASS, "min-h-20")}
                        rows={3}
                      />
                    )}
                  </FormControl>
                  <FormDescription className="text-right text-xs tabular-nums">
                    {interpolate(copy.seo.length, {
                      count: field.value.trim().length,
                      max,
                    })}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
          <ProductSeoPreview
            copy={copy.seo}
            description={search.description}
            displayUrl={`${seo.host} › productos › ${seo.slug ?? "…"}`}
            pageTitle={search.pageTitle}
            sharePhotoLeftOut={main !== undefined && ownPhoto === null}
            sharePhotoUrl={ownPhoto}
            sharePrice={
              price === null
                ? null
                : formatPrice(
                    Math.round(price * PRICE_MINOR_UNITS),
                    currency,
                    locale
                  )
            }
            shareTitle={shown.title.trim() || "…"}
            storeName={seo.storeName}
          />
        </div>
      </details>
    </div>
  );
}

export { ProductDetailsForm };
