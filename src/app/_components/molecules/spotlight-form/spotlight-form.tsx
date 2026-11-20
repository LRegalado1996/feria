"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
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
import { SheetBody, SheetFooter } from "@/app/_components/molecules/sheet";
import { useDictionary } from "@/lib/hooks/i18n";
import { DEFAULT_SPOTLIGHT_INDEX } from "@/lib/page/layout";
import {
  createSpotlightFormSchema,
  type SpotlightFormFields,
  type SpotlightFormValues,
} from "@/lib/schemas/page";

/** A spotlight as `page.get` reads it: what the form starts from. */
export interface SpotlightFormSpotlight {
  id: number;
  labelEn: string | null;
  labelEs: string | null;
  phraseEn: string | null;
  phraseEs: string | null;
  productId: number;
}

/** An article the form offers: its id and what it is called. */
export interface SpotlightFormChoice {
  id: number;
  label: string;
}

export interface SpotlightFormProps {
  /** The articles a spotlight can feature. */
  articles: readonly SpotlightFormChoice[];
  onCancel: () => void;
  /**
   * Saves the spotlight; answers whether it was saved. A failure keeps
   * everything typed and the form says so under itself.
   */
  onSave: (values: SpotlightFormValues) => Promise<boolean>;
  /**
   * The page's sequence under the cover, this spotlight left out, by name:
   * it goes after one of them, or first.
   */
  rows: readonly string[];
  /** Its place in `rows` when it is on the page already. */
  rowsIndex: number | null;
  /** The spotlight to edit, or `null` for a new one. */
  spotlight: SpotlightFormSpotlight | null;
}

const TEXTAREA_CLASS =
  "min-h-20 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40";

const SELECT_CLASS =
  "h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base disabled:opacity-50 md:h-9 md:text-sm dark:bg-input/30";

/** The form's fields for `spotlight`, or a new one's, at `rowsIndex`. */
function fieldsOf(
  spotlight: SpotlightFormSpotlight | null,
  rowsIndex: number
): SpotlightFormFields {
  return {
    labelEn: spotlight?.labelEn ?? "",
    labelEs: spotlight?.labelEs ?? "",
    phraseEn: spotlight?.phraseEn ?? "",
    phraseEs: spotlight?.phraseEs ?? "",
    productId: spotlight ? String(spotlight.productId) : "",
    rowsIndex: String(rowsIndex),
  };
}

/**
 * An article spotlight's form in the home screen's side sheet (FER-059):
 * the article it features (its photo, name and price come from it), its
 * optional label and phrase in both languages, and its place between the
 * page's rows, first by default, right under the cover. A failure keeps
 * everything typed and says so.
 */
function SpotlightForm({
  articles,
  onCancel,
  onSave,
  rows,
  rowsIndex,
  spotlight,
}: SpotlightFormProps) {
  const copy = useDictionary().admin.home.spotlightForm;
  const fields = copy.fields;
  const formId = useId();
  const [failed, setFailed] = useState(false);
  const form = useForm<SpotlightFormFields, unknown, SpotlightFormValues>({
    defaultValues: fieldsOf(
      spotlight,
      Math.min(rowsIndex ?? DEFAULT_SPOTLIGHT_INDEX, rows.length)
    ),
    resolver: zodResolver(createSpotlightFormSchema(copy.errors)),
  });
  const { isSubmitting } = useFormState({ control: form.control });

  const submit = async (values: SpotlightFormValues) => {
    setFailed(false);
    setFailed(!(await onSave(values)));
  };

  return (
    <Form {...form}>
      <form
        aria-label={spotlight ? copy.editTitle : copy.createTitle}
        className="flex min-h-0 flex-1 flex-col"
        data-slot="spotlight-form"
        data-testid="spotlight-form"
        id={formId}
        noValidate
        onSubmit={(event) => {
          void form.handleSubmit(submit)(event);
        }}
      >
        <SheetBody>
          <fieldset
            className="flex min-w-0 flex-col gap-5"
            disabled={isSubmitting}
          >
            <FormField
              control={form.control}
              name="productId"
              render={({ field }) => (
                <FormItem className="min-w-0">
                  <FormLabel required>{fields.productId}</FormLabel>
                  <FormControl>
                    <select {...field} className={SELECT_CLASS}>
                      <option value="">{fields.choose}</option>
                      {articles.map((choice) => (
                        <option key={choice.id} value={String(choice.id)}>
                          {choice.label}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormDescription>{fields.productHint}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["labelEs", "es"],
                  ["labelEn", "en"],
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
                      <FormDescription>{fields.labelHint}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["phraseEs", "es"],
                  ["phraseEn", "en"],
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
                      <FormDescription>{fields.phraseHint}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
            <FormField
              control={form.control}
              name="rowsIndex"
              render={({ field }) => (
                <FormItem className="min-w-0">
                  <FormLabel>{fields.rowsIndex}</FormLabel>
                  <FormControl>
                    <select {...field} className={SELECT_CLASS}>
                      <option value="0">{fields.rowsFirst}</option>
                      {rows.map((row, index) => (
                        <option
                          // A row's name can repeat (two categories named
                          // alike); its place cannot.
                          key={`${String(index)}:${row}`}
                          value={String(index + 1)}
                        >
                          {row}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {failed ? (
              <p className="text-sm text-destructive" role="alert">
                {copy.errors.save}
              </p>
            ) : null}
          </fieldset>
        </SheetBody>
        <SheetFooter className="flex flex-wrap gap-2">
          <Button
            data-testid="spotlight-form-submit"
            disabled={isSubmitting}
            type="submit"
          >
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
        </SheetFooter>
      </form>
    </Form>
  );
}

export { SpotlightForm };
