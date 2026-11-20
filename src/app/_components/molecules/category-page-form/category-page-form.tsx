"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { useForm, useFormState, useWatch } from "react-hook-form";

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
import { ImageUploader } from "@/app/_components/molecules/image-uploader";
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
  /** Whether the store's header lists it, when it is in no group (FER-051). */
  showInHeader: boolean;
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

/** Whether the form still holds the image the category had. */
function sameImage(image: CoverImage | null, stored: CoverImage | null) {
  return image?.url === stored?.url;
}

/**
 * A category's page (FER-043): the group it is in (a native select of the
 * categories in no group, "No group" first), its title and description for
 * search engines in both languages (empty: the page writes its own), and
 * its cover: a computer photo and an optional phone one, each uploaded with
 * `ImageUploader` (FER-011) and saved with the rest, and the cover's
 * description in both languages. A group or a category in no group says
 * whether the store's header lists it (FER-051); one in a group always
 * shows in its group's dropdown, which the form says instead. A phone
 * photo needs a computer one, so
 * removing the computer photo removes both. Only an image that changed is
 * sent. The English texts wait for an English name, which their row needs.
 * A failure keeps everything typed and says so under the form.
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
  // The cover the form opened with: a save sends an image only when the form
  // changed it from this one. The list read again can bring another cover
  // (saved from another tab) that the form never showed.
  const loaded = useRef(category.cover);
  const form = useForm<CategoryPageFormValues>({
    defaultValues: {
      cover: category.cover.computer,
      coverAltEn: category.coverAltEn ?? "",
      coverAltEs: category.coverAltEs ?? "",
      coverPhone: category.cover.phone,
      parentId: category.parentId === null ? "" : String(category.parentId),
      seoDescriptionEn: category.seoDescriptionEn ?? "",
      seoDescriptionEs: category.seoDescriptionEs ?? "",
      seoTitleEn: category.seoTitleEn ?? "",
      seoTitleEs: category.seoTitleEs ?? "",
      showInHeader: category.showInHeader,
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
  const hasCover = useWatch({ control: form.control, name: "cover" }) !== null;
  const parentId = useWatch({ control: form.control, name: "parentId" });
  // A group is in none, whatever its shut select still holds (a group was
  // chosen before another category joined this one): it has the checkbox.
  const inGroup = !isGroup && parentId !== "";
  // A photo still on its way is not in the form yet: a save now would leave
  // it out. Save waits for it; its own cancel and the form's Cancel do not.
  const [uploading, setUploading] = useState({
    cover: false,
    coverPhone: false,
  });
  const waiting = uploading.cover || uploading.coverPhone;

  const submit = async (values: CategoryPageFormValues) => {
    setFailed(false);
    const english = (text: string) => (hasEnglish ? orNull(text) : null);
    const result = await onSave({
      cover: sameImage(values.cover, loaded.current.computer)
        ? undefined
        : values.cover,
      coverAltEn: english(values.coverAltEn),
      coverAltEs: orNull(values.coverAltEs),
      coverPhone: sameImage(values.coverPhone, loaded.current.phone)
        ? undefined
        : values.coverPhone,
      id: category.id,
      // A category that became a group while the form was open (another
      // joined it) is in none, whatever the shut select still holds.
      parentId:
        isGroup || values.parentId === "" ? null : Number(values.parentId),
      seoDescriptionEn: english(values.seoDescriptionEn),
      seoDescriptionEs: orNull(values.seoDescriptionEs),
      seoTitleEn: english(values.seoTitleEn),
      seoTitleEs: orNull(values.seoTitleEs),
      // A category in a group always shows in its dropdown: its own choice
      // is kept as it is for the day it leaves the group.
      showInHeader:
        isGroup || values.parentId === "" ? values.showInHeader : undefined,
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
                    value={isGroup ? "" : field.value}
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
          {inGroup ? (
            <p
              className="text-xs text-muted-foreground"
              data-testid="category-header-in-group"
            >
              {copy.showInHeaderInGroup}
            </p>
          ) : (
            <FormField
              control={form.control}
              name="showInHeader"
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
                    {copy.showInHeader}
                  </FormLabel>
                  <FormDescription className="col-span-2">
                    {copy.showInHeaderHint}
                  </FormDescription>
                </FormItem>
              )}
            />
          )}
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
            <p className="text-xs text-muted-foreground">{copy.coverHint}</p>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="cover"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormControl>
                      <ImageUploader
                        label={copy.coverComputer}
                        onBusyChange={(busy) => {
                          setUploading((was) => ({ ...was, cover: busy }));
                        }}
                        onChange={(image) => {
                          field.onChange(image);

                          if (image === null) {
                            form.setValue("coverPhone", null);
                          }
                        }}
                        purpose="cover"
                        sizes="(min-width: 768px) 20rem, 100vw"
                        value={field.value}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="coverPhone"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormControl>
                      <ImageUploader
                        description={
                          hasCover
                            ? copy.coverPhoneHint
                            : copy.coverPhoneNeedsComputer
                        }
                        disabled={!hasCover}
                        label={copy.coverPhone}
                        onBusyChange={(busy) => {
                          setUploading((was) => ({ ...was, coverPhone: busy }));
                        }}
                        onChange={(image) => {
                          // A phone photo needs a computer one: one that
                          // lands after the computer photo was removed is
                          // dropped, as the shut field could not remove it.
                          if (
                            image !== null &&
                            form.getValues("cover") === null
                          ) {
                            return;
                          }

                          field.onChange(image);
                        }}
                        purpose="cover"
                        sizes="(min-width: 768px) 20rem, 100vw"
                        value={field.value}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
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
          <Button disabled={isSubmitting || waiting} type="submit">
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
