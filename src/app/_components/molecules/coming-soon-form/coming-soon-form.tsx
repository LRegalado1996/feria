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
import { LOCALES, type Locale } from "@/lib/i18n/config";
import {
  type ComingSoonFormFields,
  createComingSoonFormSchema,
  type UpdateComingSoonValues,
} from "@/lib/schemas/coming-soon";
import { cn } from "@/lib/utils";

/** One language's texts as `comingSoon.get` reads them. */
interface ComingSoonTexts {
  eyebrow: string | null;
  headline: string | null;
  lead: string | null;
  marquee: string | null;
}

/** The page as `comingSoon.get` reads it: what the form starts from. */
export interface ComingSoonFormPage {
  countdownTo: string | null;
  published: boolean;
  translations: readonly (ComingSoonTexts & { locale: Locale })[];
}

/** What the page says where a field is empty, per language: the dictionary's. */
export type ComingSoonDefaults = Record<
  Locale,
  Record<keyof ComingSoonTexts, string>
>;

export interface ComingSoonFormProps {
  className?: string;
  /** Shown in an empty field, so the admin sees what the page will say. */
  defaults: ComingSoonDefaults;
  /** The form's id: the screen's save button, in its top bar, submits it. */
  id: string;
  /**
   * Saves the texts and the day and answers the page as it was stored,
   * which the form then shows, or `null` when the save failed: the form
   * then keeps everything typed.
   */
  onSave: (
    values: UpdateComingSoonValues
  ) => Promise<ComingSoonFormPage | null>;
  page: ComingSoonFormPage;
}

const TEXTAREA_CLASS =
  "w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40";

/** Each language's three fields, by the form's names. */
const FIELDS = {
  en: {
    eyebrow: "eyebrowEn",
    headline: "headlineEn",
    lead: "leadEn",
    marquee: "marqueeEn",
  },
  es: {
    eyebrow: "eyebrowEs",
    headline: "headlineEs",
    lead: "leadEs",
    marquee: "marqueeEs",
  },
} as const satisfies Record<
  Locale,
  Record<keyof ComingSoonTexts, keyof ComingSoonFormFields>
>;

/** How tall each text's box starts: its lines, or a paragraph's room. */
const ROWS = { headline: 2, lead: 3, marquee: 4 } as const;

/** The texts in the order the page shows them, top to bottom. */
const TEXTS = ["eyebrow", "headline", "lead", "marquee"] as const;

/** The hint under each text, by its key in the dictionary; none for the lead. */
const HINTS = {
  eyebrow: "eyebrowHint",
  headline: "headlineHint",
  lead: null,
  marquee: "marqueeHint",
} as const;

/** The fields as the form holds them: strings, `""` for nothing. */
function fieldsOf(page: ComingSoonFormPage): ComingSoonFormFields {
  const texts = (locale: Locale) =>
    page.translations.find((translation) => translation.locale === locale);

  return {
    countdownTo: page.countdownTo ?? "",
    eyebrowEn: texts("en")?.eyebrow ?? "",
    eyebrowEs: texts("es")?.eyebrow ?? "",
    headlineEn: texts("en")?.headline ?? "",
    headlineEs: texts("es")?.headline ?? "",
    leadEn: texts("en")?.lead ?? "",
    leadEs: texts("es")?.lead ?? "",
    marqueeEn: texts("en")?.marquee ?? "",
    marqueeEs: texts("es")?.marquee ?? "",
  };
}

/** One card of the form, named by its heading. */
function FormCard({
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
      data-slot="coming-soon-form-card"
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
 * The coming-soon page's texts and countdown (FER-034), in the admin's
 * cards: the line over the headline (the fair's dates), the headline, the
 * text under it and the moving band in Spanish and
 * in English, each field marked with its `lang` and showing, while empty,
 * the dictionary's text the page then says; and the day the countdown
 * counts to. Nothing is required. Errors show under their field, and a
 * failed save keeps everything typed. Its submit button lives in the
 * screen's top bar (`id`), under the thumb on a phone. The switch is not
 * here: it has its own control, so saving texts never publishes the page.
 */
function ComingSoonForm({
  className,
  defaults,
  id,
  onSave,
  page,
}: ComingSoonFormProps) {
  const { comingSoon } = useDictionary();
  const copy = comingSoon.manage;
  const form = useForm<ComingSoonFormFields, unknown, UpdateComingSoonValues>({
    resetOptions: { keepDirtyValues: true },
    resolver: zodResolver(createComingSoonFormSchema(copy.errors)),
    // Follows the stored page when a read brings a newer one (another
    // admin's save), keeping what this admin is typing: a field left as it
    // was would otherwise send the older text back and undo theirs.
    values: fieldsOf(page),
  });
  const { isSubmitting } = useFormState({ control: form.control });

  const submit = async (values: UpdateComingSoonValues) => {
    const saved = await onSave(values);

    // A failure keeps everything typed: the screen says it failed. A save
    // turns off `resetOptions`' keepDirtyValues, which `reset` inherits:
    // what was saved is no longer this admin's edit, so a later read with
    // another admin's newer text must replace it, not be ignored.
    if (saved !== null) {
      form.reset(fieldsOf(saved), { keepDirtyValues: false });
    }
  };

  return (
    <Form {...form}>
      <form
        aria-label={copy.title}
        className={cn("flex flex-col gap-6", className)}
        data-slot="coming-soon-form"
        data-testid="coming-soon-form"
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
          {LOCALES.map((lang) => (
            <FormCard hint={copy.textsHint} key={lang} title={copy.texts[lang]}>
              {TEXTS.map((text) => (
                <FormField
                  control={form.control}
                  key={text}
                  name={FIELDS[lang][text]}
                  render={({ field }) => (
                    <FormItem className="min-w-0">
                      <FormLabel>{copy.fields[FIELDS[lang][text]]}</FormLabel>
                      <FormControl>
                        {text === "eyebrow" ? (
                          <Input
                            {...field}
                            autoComplete="off"
                            lang={lang}
                            placeholder={defaults[lang][text]}
                          />
                        ) : (
                          <textarea
                            {...field}
                            className={TEXTAREA_CLASS}
                            lang={lang}
                            placeholder={defaults[lang][text]}
                            rows={ROWS[text]}
                          />
                        )}
                      </FormControl>
                      {HINTS[text] ? (
                        <FormDescription>
                          {copy.fields[HINTS[text]]}
                        </FormDescription>
                      ) : null}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </FormCard>
          ))}
          <FormCard title={copy.countdown}>
            <FormField
              control={form.control}
              name="countdownTo"
              render={({ field }) => (
                <FormItem className="min-w-0 md:max-w-xs">
                  <FormLabel>{copy.fields.countdownTo}</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" />
                  </FormControl>
                  <FormDescription>{copy.countdownHint}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormCard>
        </fieldset>
      </form>
    </Form>
  );
}

export { ComingSoonForm };
