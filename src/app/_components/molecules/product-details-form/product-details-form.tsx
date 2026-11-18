"use client";

import { Tabs } from "radix-ui";
import type { ReactNode } from "react";
import { useFormContext } from "react-hook-form";
import { z } from "zod";

import { Input } from "@/app/_components/atoms/input";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/_components/molecules/form";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import type { client } from "@/lib/orpc/client";
import type { ProductFormValues } from "@/lib/schemas/catalog";
import { cn } from "@/lib/utils";
import { type Currency, formatCurrencySign } from "@/lib/utils/format";

type StoreCategory = Awaited<ReturnType<typeof client.category.list>>[number];

/** The two languages an article's texts are written in. */
export type TextLanguage = "en" | "es";

const textLanguageSchema = z.enum(["en", "es"]);

export interface ProductDetailsFormProps {
  /**
   * Where the "fill with AI" button of FER-018 goes: above the fields, once
   * that ticket hands it in. Nothing shows while it is left out.
   */
  assistant?: ReactNode;
  categories: readonly StoreCategory[];
  className?: string;
  currency: Currency;
  /** The language whose texts are on screen, Spanish first. */
  language: TextLanguage;
  onLanguageChange: (language: TextLanguage) => void;
}

// The same surface as `atoms/input`: white over the admin's grey canvas, a
// step lighter in dark, so no field reads as disabled.
const TEXTAREA_CLASS =
  "min-h-32 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40";

const SELECT_CLASS =
  "h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive md:h-9 md:text-sm dark:bg-input/30";

/** A name in the page's language, else the Spanish one. */
function nameIn(row: { nameEn: string | null; nameEs: string }, en: boolean) {
  return en ? (row.nameEn ?? row.nameEs) : row.nameEs;
}

/**
 * The article's details (FER-017), inside the wizard's form: the title and
 * the description in Spanish, with English one tab away (optional; once any
 * English is typed its title is needed to publish); the category, groups
 * holding their categories (a group may hold articles of its own); the
 * price in either notation (FER-035), its currency's sign inside the field;
 * and whether it can be bought. Errors show under their field, in the
 * page's language. The filters and the previews are the wizard's own
 * sections, beside these.
 */
function ProductDetailsForm({
  assistant,
  categories,
  className,
  currency,
  language,
  onLanguageChange,
}: ProductDetailsFormProps) {
  const { articles } = useDictionary();
  const copy = articles.wizard.details;
  const locale = useLocale();
  const en = locale === "en";
  const form = useFormContext<ProductFormValues>();
  const sign = formatCurrencySign(currency, locale);
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
                    // The article's text is in the tab's language; its label,
                    // help and errors stay in the page's.
                    lang={language}
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
                  <textarea
                    {...field}
                    className={TEXTAREA_CLASS}
                    lang={language}
                    rows={5}
                  />
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
              <div className="relative grid min-w-0">
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-0 left-3 flex h-11 items-center text-base text-muted-foreground md:h-9 md:text-sm"
                  data-testid="product-price-currency"
                >
                  {sign}
                </span>
                <FormControl>
                  <Input
                    {...field}
                    autoComplete="off"
                    className={sign.length > 1 ? "pl-14" : "pl-7"}
                    enterKeyHint="done"
                    onValueChange={onChange}
                    type="number"
                  />
                </FormControl>
              </div>
              {/* The sign is drawn for the eye; the ear gets the currency's
                  name with the field. */}
              <FormDescription className="sr-only">
                {interpolate(copy.priceCurrency, {
                  currency: copy.currencies[currency],
                })}
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
    </div>
  );
}

export { ProductDetailsForm };
