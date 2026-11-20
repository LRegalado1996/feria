"use client";

import { useId } from "react";
import { type UseFormReturn, useFormState } from "react-hook-form";

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
import { useDictionary } from "@/lib/hooks/i18n";
import type {
  AnnouncementFormFields,
  SaveAnnouncementValues,
} from "@/lib/schemas/page";
import { cn } from "@/lib/utils";

/** The announcement as `home.get` reads it, or `null` before it exists. */
export interface AnnouncementFormAnnouncement {
  endsOn: string | null;
  isActive: boolean;
  linkUrl: string | null;
  shortTextEn: string | null;
  shortTextEs: string | null;
  startsOn: string | null;
  textEn: string | null;
  textEs: string;
}

/** The form's fields for `announcement`: strings, `""` for none. */
export function announcementFields(
  announcement: AnnouncementFormAnnouncement | null
): AnnouncementFormFields {
  return {
    endsOn: announcement?.endsOn ?? "",
    isActive: announcement?.isActive ?? true,
    linkUrl: announcement?.linkUrl ?? "",
    shortTextEn: announcement?.shortTextEn ?? "",
    shortTextEs: announcement?.shortTextEs ?? "",
    startsOn: announcement?.startsOn ?? "",
    textEn: announcement?.textEn ?? "",
    textEs: announcement?.textEs ?? "",
  };
}

export interface AnnouncementFormProps {
  className?: string;
  /**
   * The form, made by the screen so its preview reads what is typed before
   * it is saved: `useForm` with `createAnnouncementFormSchema`.
   */
  form: UseFormReturn<AnnouncementFormFields, unknown, SaveAnnouncementValues>;
  /**
   * Saves the announcement; answers whether it was saved. A failure keeps
   * everything typed, and the screen says why.
   */
  onSave: (values: SaveAnnouncementValues) => Promise<boolean>;
}

const TEXT_FIELDS = [
  ["textEs", "es", "shortTextEs"],
  ["textEn", "en", "shortTextEn"],
] as const;

/**
 * The announcement bar's card (FER-020): its line in Spanish and English,
 * each with a shorter one for a phone, an optional link, the switch and its
 * optional first and last days. Errors show under their field; a save
 * resets the form to what was saved.
 */
function AnnouncementForm({ className, form, onSave }: AnnouncementFormProps) {
  const { admin } = useDictionary();
  const copy = admin.home.announcement;
  const headingId = useId();
  const { isSubmitting } = useFormState({ control: form.control });

  const submit = async (values: SaveAnnouncementValues) => {
    if (await onSave(values)) {
      form.reset(announcementFields(values));
    }
  };

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-4 text-card-foreground md:p-5",
        className
      )}
      data-slot="announcement-form"
      data-testid="announcement-form"
    >
      <div className="space-y-1">
        <h2 className="text-sm font-semibold" id={headingId}>
          {copy.title}
        </h2>
        <p className="text-xs text-muted-foreground">{copy.hint}</p>
      </div>
      <Form {...form}>
        <form
          aria-labelledby={headingId}
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            void form.handleSubmit(submit)(event);
          }}
        >
          <fieldset
            className="flex min-w-0 flex-col gap-4"
            disabled={isSubmitting}
          >
            <FormField
              control={form.control}
              name="isActive"
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
                    {copy.fields.isActive}
                  </FormLabel>
                </FormItem>
              )}
            />
            <div className="grid gap-4 md:grid-cols-2">
              {TEXT_FIELDS.map(([name, lang, short]) => (
                <div className="flex min-w-0 flex-col gap-4" key={name}>
                  <FormField
                    control={form.control}
                    name={name}
                    render={({ field }) => (
                      <FormItem className="min-w-0">
                        <FormLabel required={name === "textEs"}>
                          {copy.fields[name]}
                        </FormLabel>
                        <FormControl>
                          <Input {...field} autoComplete="off" lang={lang} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={short}
                    render={({ field }) => (
                      <FormItem className="min-w-0">
                        <FormLabel>{copy.fields[short]}</FormLabel>
                        <FormControl>
                          <Input {...field} autoComplete="off" lang={lang} />
                        </FormControl>
                        <FormDescription>
                          {copy.fields.shortHint}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ))}
            </div>
            <FormField
              control={form.control}
              name="linkUrl"
              render={({ field }) => (
                <FormItem className="min-w-0">
                  <FormLabel>{copy.fields.linkUrl}</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="off" inputMode="url" />
                  </FormControl>
                  <FormDescription>{copy.fields.linkHint}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DaysFields
              form={form}
              hint={copy.fields.daysHint}
              labels={copy.fields}
            />
          </fieldset>
          <div>
            <Button
              className="w-full md:w-auto"
              data-testid="announcement-form-submit"
              disabled={isSubmitting}
              type="submit"
              variant="outline"
            >
              {isSubmitting ? copy.pending : copy.submit}
            </Button>
          </div>
        </form>
      </Form>
    </section>
  );
}

/**
 * The first and last days, native date fields (`design.md` § Data), side
 * by side from `sm` up, with one hint under both.
 */
function DaysFields({
  form,
  hint,
  labels,
}: {
  form: UseFormReturn<AnnouncementFormFields, unknown, SaveAnnouncementValues>;
  hint: string;
  labels: { endsOn: string; startsOn: string };
}) {
  const hintId = useId();

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="grid gap-4 sm:grid-cols-2">
        {(["startsOn", "endsOn"] as const).map((name) => (
          <FormField
            control={form.control}
            key={name}
            name={name}
            render={({ field }) => (
              <FormItem className="min-w-0">
                <FormLabel>{labels[name]}</FormLabel>
                <FormControl>
                  <Input {...field} type="date" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground" id={hintId}>
        {hint}
      </p>
    </div>
  );
}

export { AnnouncementForm };
