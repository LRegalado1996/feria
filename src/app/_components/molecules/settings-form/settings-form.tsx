"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type ReactNode, useId } from "react";
import { useForm, useFormState } from "react-hook-form";

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
import type { Locale } from "@/lib/i18n/config";
import {
  createStoreSettingsFormSchema,
  type STORE_CURRENCIES,
  type StoreSettingsFormFields,
  type StoreSettingsFormValues,
  type UpdateStoreValues,
} from "@/lib/schemas/store";
import { cn } from "@/lib/utils";

/** The store as `store.get` reads it: what the form starts from. */
export interface SettingsFormStore {
  currencyCode: (typeof STORE_CURRENCIES)[number];
  instagramUrl: string | null;
  name: string;
  tiktokUrl: string | null;
  translations: readonly {
    description: string;
    locale: Locale;
    /** Where to find the store (FER-078), or `null` for none. */
    location: string | null;
    tagline: string;
  }[];
  whatsappNumber: string | null;
}

export interface SettingsFormProps {
  className?: string;
  /** The form's id: the screen's save button, in its top bar, submits it. */
  id: string;
  /**
   * Saves the settings and answers the store as it was stored, which the
   * form then shows, or `null` when the save failed: the form then keeps
   * everything typed.
   */
  onSave: (values: UpdateStoreValues) => Promise<SettingsFormStore | null>;
  store: SettingsFormStore;
}

const TEXTAREA_CLASS =
  "min-h-28 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40";

const TEXT_FIELDS = [
  ["taglineEs", "es", "input"],
  ["taglineEn", "en", "input"],
  ["descriptionEs", "es", "textarea"],
  ["descriptionEn", "en", "textarea"],
] as const;

/** Where to find the store, one optional line per language (FER-078). */
const LOCATION_FIELDS = [
  ["locationEs", "es"],
  ["locationEn", "en"],
] as const;

/** The fields as the form holds them: strings, `""` for nothing. */
function fieldsOf(store: SettingsFormStore): StoreSettingsFormFields {
  const text = (locale: Locale) =>
    store.translations.find((translation) => translation.locale === locale);

  return {
    descriptionEn: text("en")?.description ?? "",
    descriptionEs: text("es")?.description ?? "",
    instagramUrl: store.instagramUrl ?? "",
    locationEn: text("en")?.location ?? "",
    locationEs: text("es")?.location ?? "",
    name: store.name,
    taglineEn: text("en")?.tagline ?? "",
    taglineEs: text("es")?.tagline ?? "",
    tiktokUrl: store.tiktokUrl ?? "",
    whatsappNumber: store.whatsappNumber ?? "",
  };
}

/** One card of the form, named by its heading. */
function SettingsCard({
  children,
  hint,
  title,
}: {
  children: ReactNode;
  hint?: string;
  title: string;
}) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-4 text-card-foreground md:p-5"
      data-slot="settings-card"
    >
      <div className="space-y-1">
        <h2 className="text-sm font-semibold" id={headingId}>
          {title}
        </h2>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * The company's settings (FER-014), in the admin's cards: the store's name,
 * its tagline and description in both languages, its WhatsApp number, its
 * Instagram and TikTok links, and where to find it, one optional line in
 * each language that the footer shows (FER-078). The currency is shown, not edited: it is
 * fixed per store (decided 2026-11-18), so the form never sends it. The WhatsApp number is read as typed
 * (`createStoreSettingsFormSchema`) and shown, once saved, as it was kept.
 * Errors show under their field, and a failed save keeps everything typed.
 * Its submit button lives in the screen's top bar (`id`), under the thumb
 * on a phone, and the screen says how a save ended.
 */
function SettingsForm({ className, id, onSave, store }: SettingsFormProps) {
  const { admin } = useDictionary();
  const copy = admin.settings;
  const form = useForm<
    StoreSettingsFormFields,
    unknown,
    StoreSettingsFormValues
  >({
    defaultValues: fieldsOf(store),
    resolver: zodResolver(createStoreSettingsFormSchema(copy.errors)),
  });
  const { isSubmitting } = useFormState({ control: form.control });

  const submit = async (values: StoreSettingsFormValues) => {
    const saved = await onSave(values);

    // A failure keeps everything typed: the screen says it failed.
    if (saved !== null) {
      form.reset(fieldsOf(saved));
    }
  };

  return (
    <Form {...form}>
      <form
        aria-label={copy.title}
        className={cn("flex flex-col gap-6", className)}
        data-slot="settings-form"
        data-testid="settings-form"
        id={id}
        noValidate
        onSubmit={(event) => {
          void form.handleSubmit(submit)(event);
        }}
      >
        <fieldset
          className="flex min-w-0 flex-col gap-6"
          disabled={isSubmitting}
        >
          <SettingsCard title={copy.identity}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="min-w-0">
                  <FormLabel required>{copy.fields.name}</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="organization" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <dl className="space-y-1" data-testid="settings-currency">
              <dt className="text-sm font-medium">{copy.currency}</dt>
              <dd className="text-sm">{copy.currencies[store.currencyCode]}</dd>
              <dd className="text-xs text-muted-foreground">
                {copy.currencyHint}
              </dd>
            </dl>
          </SettingsCard>
          <SettingsCard hint={copy.textsHint} title={copy.texts}>
            <div className="grid gap-4 md:grid-cols-2">
              {TEXT_FIELDS.map(([name, lang, control]) => (
                <FormField
                  control={form.control}
                  key={name}
                  name={name}
                  render={({ field }) => (
                    <FormItem className="min-w-0">
                      <FormLabel required>{copy.fields[name]}</FormLabel>
                      <FormControl>
                        {control === "input" ? (
                          <Input {...field} autoComplete="off" lang={lang} />
                        ) : (
                          <textarea
                            {...field}
                            className={TEXTAREA_CLASS}
                            lang={lang}
                          />
                        )}
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </SettingsCard>
          <SettingsCard title={copy.contact}>
            <FormField
              control={form.control}
              name="whatsappNumber"
              render={({ field }) => (
                <FormItem className="min-w-0">
                  <FormLabel>{copy.fields.whatsappNumber}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      autoComplete="tel"
                      inputMode="tel"
                      type="tel"
                    />
                  </FormControl>
                  <FormDescription>{copy.fields.whatsappHint}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 md:grid-cols-2">
              {LOCATION_FIELDS.map(([name, lang]) => (
                <FormField
                  control={form.control}
                  key={name}
                  name={name}
                  render={({ field }) => (
                    <FormItem className="min-w-0">
                      <FormLabel>{copy.fields[name]}</FormLabel>
                      <FormControl>
                        <Input {...field} autoComplete="off" lang={lang} />
                      </FormControl>
                      <FormDescription>
                        {copy.fields.locationHint}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {(["instagramUrl", "tiktokUrl"] as const).map((name) => (
                <FormField
                  control={form.control}
                  key={name}
                  name={name}
                  render={({ field }) => (
                    <FormItem className="min-w-0">
                      <FormLabel>{copy.fields[name]}</FormLabel>
                      <FormControl>
                        <Input {...field} autoComplete="url" type="url" />
                      </FormControl>
                      <FormDescription>
                        {copy.fields.socialHint}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </SettingsCard>
        </fieldset>
      </form>
    </Form>
  );
}

export { SettingsForm };
