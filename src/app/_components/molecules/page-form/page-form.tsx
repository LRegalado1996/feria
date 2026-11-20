"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";

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
import { reportError } from "@/lib/errors/client";
import { useDictionary } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import {
  createPageFormSchema,
  type PageFormFields,
  type PageFormValues,
} from "@/lib/schemas/page";
import { cn } from "@/lib/utils";
import { slugify } from "@/lib/utils/slugify";

/** A page's settings as `page.list` and `page.get` read them. */
export interface PageFormPage {
  isHome: boolean;
  isPublished: boolean;
  nameEn: string | null;
  nameEs: string;
  seoDescriptionEn: string | null;
  seoDescriptionEs: string | null;
  seoTitleEn: string | null;
  seoTitleEs: string | null;
  showInHeader: boolean;
  slug: string;
}

/** How a save ended: saved, refused for its address, or failed. */
export type PageFormOutcome = "failed" | "saved" | "taken";

export interface PageFormProps {
  className?: string;
  onCancel?: () => void;
  /** Saves the page; answers how it ended. A failure keeps what was typed. */
  onSave: (values: PageFormValues) => Promise<PageFormOutcome>;
  /** The page to edit, or `null` for a new one. */
  page: PageFormPage | null;
}

/** An address made from a name, for a new page whose address is untouched. */
const SLUG_FALLBACK = "pagina";

const TEXTAREA_CLASS =
  "min-h-20 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40";

/** The form's fields for `page`, or a new page's: a draft, off the header. */
function fieldsOf(page: PageFormPage | null): PageFormFields {
  return {
    isPublished: page?.isPublished ?? false,
    nameEn: page?.nameEn ?? "",
    nameEs: page?.nameEs ?? "",
    seoDescriptionEn: page?.seoDescriptionEn ?? "",
    seoDescriptionEs: page?.seoDescriptionEs ?? "",
    seoTitleEn: page?.seoTitleEn ?? "",
    seoTitleEs: page?.seoTitleEs ?? "",
    showInHeader: page?.showInHeader ?? false,
    slug: page?.slug ?? "",
  };
}

/** A switch the label names; the label is the 44 px target on a phone. */
function SwitchField({
  description,
  disabled = false,
  label,
  name,
  form,
}: {
  description: string;
  disabled?: boolean;
  form: ReturnType<typeof useForm<PageFormFields, unknown, PageFormValues>>;
  label: string;
  name: "isPublished" | "showInHeader";
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field: { onChange, value, ...field } }) => (
        <FormItem className="min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3">
          <FormControl>
            <input
              {...field}
              checked={value}
              className="size-5 accent-primary"
              disabled={disabled}
              onChange={(event) => {
                onChange(event.currentTarget.checked);
              }}
              type="checkbox"
            />
          </FormControl>
          <FormLabel className="min-h-11 md:min-h-9">{label}</FormLabel>
          <FormDescription className="col-span-2">
            {description}
          </FormDescription>
        </FormItem>
      )}
    />
  );
}

/**
 * A page's settings (FER-060): its name in Spanish and English, its
 * address (made from the Spanish name while a new page's address is left
 * alone), its title and description for search engines in each language,
 * whether it is published and whether the header lists it. The home stays
 * published and is never in the header: both are said, not offered. A save
 * refused for its address says so under the address; any other failure
 * keeps everything typed and says so.
 */
function PageForm({ className, onCancel, onSave, page }: PageFormProps) {
  const copy = useDictionary().admin.pages.form;
  const fields = copy.fields;
  const formId = useId();
  const [failed, setFailed] = useState(false);
  // Its own flag, not the form's `isSubmitting`: a newer read resets the
  // form while a save travels, and a reset clears `isSubmitting`, which
  // would hand the controls back mid-save.
  const [saving, setSaving] = useState(false);
  const form = useForm<PageFormFields, unknown, PageFormValues>({
    defaultValues: fieldsOf(page),
    resolver: zodResolver(createPageFormSchema(copy.errors)),
  });
  // The page as last read, for a save to rebase on.
  const received = useRef(page);

  // Follows every read of the stored page (another admin's save, this
  // admin's own save coming back), keeping what this admin is typing: a
  // field left as it was would otherwise send the older value back and
  // undo theirs. Keyed on each read, not on its values: react-hook-form's
  // own `values` skips a read equal to one it applied before, which left a
  // saved form on what it sent when the stored page came back as before.
  useEffect(() => {
    received.current = page;
    form.reset(fieldsOf(page), { keepDirtyValues: true });
  }, [form, page]);

  const isHome = page?.isHome ?? false;
  const submitLabel = page ? copy.submitEdit : copy.submitCreate;

  const submit = async (values: PageFormValues) => {
    setFailed(false);
    setSaving(true);
    let outcome: PageFormOutcome;

    try {
      outcome = await onSave(values);
    } catch (error) {
      // The caller answers its own failures; one that slips through is
      // still a failed save, said here, never controls left waiting.
      reportError(error, { action: "Pages.save_settings" });
      outcome = "failed";
    }

    setSaving(false);

    if (outcome === "taken") {
      form.setError("slug", { message: copy.errors.slugTaken });
    }

    // What was saved is no longer this admin's edit: the clean start is
    // the page as last read (the save's own answer once it is back), so a
    // later read with another admin's newer value replaces it.
    if (outcome === "saved") {
      form.reset(fieldsOf(received.current), { keepDirtyValues: false });
    }

    setFailed(outcome === "failed");
  };

  return (
    <Form {...form}>
      <form
        aria-label={page ? copy.editTitle : copy.createTitle}
        className={cn("flex min-w-0 flex-col gap-5", className)}
        data-slot="page-form"
        data-testid="page-form"
        id={formId}
        noValidate
        onSubmit={(event) => {
          void form.handleSubmit(submit)(event);
        }}
      >
        <fieldset className="flex min-w-0 flex-col gap-5" disabled={saving}>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["nameEs", "es"],
                ["nameEn", "en"],
              ] as const
            ).map(([name, lang]) => (
              <FormField
                control={form.control}
                key={name}
                name={name}
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel required={name === "nameEs"}>
                      {fields[name]}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        autoComplete="off"
                        lang={lang}
                        onChange={(event) => {
                          field.onChange(event);

                          // A new page's address follows its Spanish name
                          // until someone types one.
                          if (
                            name === "nameEs" &&
                            page === null &&
                            !form.getFieldState("slug").isDirty
                          ) {
                            form.setValue(
                              "slug",
                              slugify(event.currentTarget.value, SLUG_FALLBACK)
                            );
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </div>
          <FormField
            control={form.control}
            name="slug"
            render={({ field }) => (
              <FormItem className="min-w-0">
                <FormLabel required>{fields.slug}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    autoCapitalize="none"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </FormControl>
                <FormDescription>
                  {interpolate(fields.slugHint, {
                    slug: field.value === "" ? "…" : field.value,
                  })}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["seoTitleEs", "es"],
                ["seoTitleEn", "en"],
              ] as const
            ).map(([name, lang]) => (
              <FormField
                control={form.control}
                key={name}
                name={name}
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel>{fields[name]}</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="off" lang={lang} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
            {(
              [
                ["seoDescriptionEs", "es"],
                ["seoDescriptionEn", "en"],
              ] as const
            ).map(([name, lang]) => (
              <FormField
                control={form.control}
                key={name}
                name={name}
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel>{fields[name]}</FormLabel>
                    <FormControl>
                      <textarea
                        {...field}
                        className={TEXTAREA_CLASS}
                        lang={lang}
                        rows={2}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
            <p className="text-xs text-muted-foreground sm:col-span-2">
              {fields.seoHint}
            </p>
          </div>
          <SwitchField
            description={
              isHome ? fields.homeStaysPublished : fields.isPublishedHint
            }
            disabled={isHome}
            form={form}
            label={fields.isPublished}
            name="isPublished"
          />
          {isHome ? (
            <p className="text-xs text-muted-foreground">
              {fields.homeNoHeader}
            </p>
          ) : (
            <SwitchField
              description={fields.showInHeaderHint}
              form={form}
              label={fields.showInHeader}
              name="showInHeader"
            />
          )}
          {failed ? (
            <p className="text-sm text-destructive" role="alert">
              {copy.errors.save}
            </p>
          ) : null}
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <Button
            data-testid="page-form-submit"
            disabled={saving}
            type="submit"
          >
            {saving ? copy.pending : submitLabel}
          </Button>
          {onCancel ? (
            <Button
              disabled={saving}
              onClick={() => {
                onCancel();
              }}
              type="button"
              variant="ghost"
            >
              {copy.cancel}
            </Button>
          ) : null}
        </div>
      </form>
    </Form>
  );
}

export { PageForm };
