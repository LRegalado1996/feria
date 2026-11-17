"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { useState } from "react";
import { useForm, useFormState } from "react-hook-form";

import { Button } from "@/app/_components/atoms/button";
import { Input } from "@/app/_components/atoms/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/_components/molecules/form";
import type { CoverImage } from "@/lib/catalog/cover";
import { useDictionary } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import {
  type CategoryPageFormValues,
  createCategoryPageFormSchema,
  type UpdateCategoryPageValues,
} from "@/lib/schemas/catalog";
import { cn } from "@/lib/utils";

/** A category's page as the admin's list has it (`category.list`). */
export interface CategoryPageFormCategory {
  cover: { computer: CoverImage | null; phone: CoverImage | null };
  coverAltEn: string | null;
  coverAltEs: string | null;
  id: number;
  nameEn: string | null;
  nameEs: string;
  parentId: number | null;
  seoDescriptionEn: string | null;
  seoDescriptionEs: string | null;
  seoTitleEn: string | null;
  seoTitleEs: string | null;
}

export interface CategoryPageFormProps {
  category: CategoryPageFormCategory;
  className?: string;
  /** The groups it can join: categories in no group, itself left out. */
  groups: readonly { id: number; name: string }[];
  /** It holds categories itself, so it can join no group. */
  isGroup: boolean;
  onCancel: () => void;
  /** Saves the page; the form keeps what was typed unless it was saved. */
  onSave: (values: UpdateCategoryPageValues) => Promise<"failed" | "saved">;
}

const TEXT_FIELDS = [
  ["seoTitleEs", "es"],
  ["seoTitleEn", "en"],
  ["seoDescriptionEs", "es"],
  ["seoDescriptionEn", "en"],
] as const;

const SELECT_CLASS =
  "h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base disabled:opacity-50 md:h-9 md:text-sm";

/** `""` (nothing typed) as `null`: the page then writes its own text. */
function orNull(text: string) {
  return text === "" ? null : text;
}

/** One of the cover's images as a small preview, or what stands for it. */
function CoverPreview({
  alt,
  image,
  label,
  missing,
}: {
  alt: string;
  image: CoverImage | null;
  label: string;
  missing: string;
}) {
  return (
    <figure className="flex min-w-0 flex-col gap-1.5">
      <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
      {image ? (
        <Image
          alt={alt}
          className="h-28 w-full rounded-md border object-cover"
          height={image.height}
          sizes="(min-width: 768px) 16rem, 50vw"
          src={image.url}
          width={image.width}
        />
      ) : (
        <p className="flex h-28 items-center rounded-md border border-dashed px-3 text-xs text-muted-foreground">
          {missing}
        </p>
      )}
    </figure>
  );
}

/**
 * A category's page (FER-043): the group it is in (a native select of the
 * categories in no group, "No group" first), its title and description for
 * search engines in both languages (empty: the page writes its own), and
 * its cover, shown as it is with a note that uploading it comes with
 * FER-011, with the cover's description in both languages. The English
 * texts wait for an English name, which their row needs. A failure keeps
 * everything typed and says so under the form.
 */
function CategoryPageForm({
  category,
  className,
  groups,
  isGroup,
  onCancel,
  onSave,
}: CategoryPageFormProps) {
  const { admin } = useDictionary();
  const copy = admin.categories.page;
  const [failed, setFailed] = useState(false);
  const hasEnglish = category.nameEn !== null;
  const hasCover = category.cover.computer !== null;
  const form = useForm<CategoryPageFormValues>({
    defaultValues: {
      coverAltEn: category.coverAltEn ?? "",
      coverAltEs: category.coverAltEs ?? "",
      parentId: category.parentId === null ? "" : String(category.parentId),
      seoDescriptionEn: category.seoDescriptionEn ?? "",
      seoDescriptionEs: category.seoDescriptionEs ?? "",
      seoTitleEn: category.seoTitleEn ?? "",
      seoTitleEs: category.seoTitleEs ?? "",
    },
    // Built on every render: a rename can take the English name away while
    // the form is open, and the English texts' limits go with it.
    resolver: zodResolver(
      createCategoryPageFormSchema(admin.categories.errors, {
        english: hasEnglish,
      })
    ),
  });
  const { isSubmitting } = useFormState({ control: form.control });

  const submit = async (values: CategoryPageFormValues) => {
    setFailed(false);
    const english = (text: string) => (hasEnglish ? orNull(text) : null);
    const result = await onSave({
      coverAltEn: english(values.coverAltEn),
      coverAltEs: orNull(values.coverAltEs),
      id: category.id,
      parentId: values.parentId === "" ? null : Number(values.parentId),
      seoDescriptionEn: english(values.seoDescriptionEn),
      seoDescriptionEs: orNull(values.seoDescriptionEs),
      seoTitleEn: english(values.seoTitleEn),
      seoTitleEs: orNull(values.seoTitleEs),
    });

    setFailed(result === "failed");
  };

  return (
    <Form {...form}>
      <form
        aria-label={interpolate(copy.title, { name: category.nameEs })}
        className={cn("flex flex-col gap-5", className)}
        data-slot="category-page-form"
        data-testid="category-page-form"
        noValidate
        onSubmit={(event) => {
          void form.handleSubmit(submit)(event);
        }}
      >
        <fieldset
          className="flex min-w-0 flex-col gap-5"
          disabled={isSubmitting}
        >
          <FormField
            control={form.control}
            name="parentId"
            render={({ field }) => (
              <FormItem className="min-w-0">
                <FormLabel>{copy.group}</FormLabel>
                <FormControl>
                  <select
                    {...field}
                    className={SELECT_CLASS}
                    disabled={isGroup}
                  >
                    <option value="">{copy.groupNone}</option>
                    {groups.map((group) => (
                      <option key={group.id} value={String(group.id)}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormDescription>
                  {isGroup ? copy.groupIsGroup : copy.groupHint}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {TEXT_FIELDS.map(([name, lang]) => (
              <FormField
                control={form.control}
                key={name}
                name={name}
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel>{copy[name]}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        autoComplete="off"
                        disabled={lang === "en" && !hasEnglish}
                        lang={lang}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {hasEnglish
              ? copy.seoHint
              : `${copy.seoHint} ${copy.englishNeedsName}`}
          </p>
          <section
            aria-labelledby={`category-cover-${category.id}`}
            className="flex flex-col gap-3"
          >
            <h3
              className="text-sm font-semibold"
              id={`category-cover-${category.id}`}
            >
              {copy.cover}
            </h3>
            {hasCover ? (
              <div className="grid grid-cols-2 gap-3 md:max-w-lg">
                <CoverPreview
                  alt={category.coverAltEs ?? category.nameEs}
                  image={category.cover.computer}
                  label={copy.coverComputer}
                  missing={copy.coverNone}
                />
                <CoverPreview
                  alt={category.coverAltEs ?? category.nameEs}
                  image={category.cover.phone}
                  label={copy.coverPhone}
                  missing={copy.coverPhoneSame}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{copy.coverNone}</p>
            )}
            <p className="text-xs text-muted-foreground">{copy.coverUpload}</p>
            {hasCover ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ["coverAltEs", "es"],
                    ["coverAltEn", "en"],
                  ] as const
                ).map(([name, lang]) => (
                  <FormField
                    control={form.control}
                    key={name}
                    name={name}
                    render={({ field }) => (
                      <FormItem className="min-w-0">
                        <FormLabel>{copy[name]}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            autoComplete="off"
                            disabled={lang === "en" && !hasEnglish}
                            lang={lang}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            ) : null}
          </section>
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <Button disabled={isSubmitting} type="submit">
            {isSubmitting ? copy.pending : copy.submit}
          </Button>
          <Button
            disabled={isSubmitting}
            onClick={() => {
              onCancel();
            }}
            type="button"
            variant="ghost"
          >
            {copy.cancel}
          </Button>
        </div>
        {failed ? (
          <p className="text-sm text-destructive" role="alert">
            {admin.categories.errors.generic}
          </p>
        ) : null}
      </form>
    </Form>
  );
}

export { CategoryPageForm };
