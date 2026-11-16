"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type RefCallback, useEffect, useId, useRef, useState } from "react";
import { useForm, useFormState } from "react-hook-form";

import { Button, buttonVariants } from "@/app/_components/atoms/button";
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
import {
  type AttributeFormValues,
  createAttributeFormSchema,
} from "@/lib/schemas/catalog";
import { cn } from "@/lib/utils";

/** How a save ended, as the form needs to show it. */
export type AttributeFormResult = "duplicate" | "failed" | "saved";

/** What the form saves: English and the swatch are `null` when left out. */
export interface AttributeFormSaved {
  nameEn: string | null;
  nameEs: string;
  swatchColor: string | null;
}

export interface AttributeFormProps {
  className?: string;
  /** Focus the Spanish name once shown: an editor opened from a button. */
  focusOnOpen?: boolean;
  /** The id of the heading that names the form, among several alike. */
  labelledBy?: string;
  /** Present when the form edits a filter or a value: shows "Cancel". */
  onCancel?: () => void;
  /** Saves; the form keeps what was typed unless it was saved. */
  onSave: (values: AttributeFormSaved) => Promise<AttributeFormResult>;
  pendingLabel: string;
  submitLabel: string;
  /** The values to start from: a filter or a value being edited. */
  values?: AttributeFormSaved;
  /** A value's form: it can carry a swatch color. A filter's cannot. */
  withSwatch?: boolean;
}

/**
 * A filter's or a value's names (Spanish required, English optional), and
 * for a value an optional swatch picked with the browser's color input. A
 * name already in use comes back as an error on the Spanish field; nothing
 * typed is lost on a failure.
 */
function AttributeForm({
  className,
  focusOnOpen = false,
  labelledBy,
  onCancel,
  onSave,
  pendingLabel,
  submitLabel,
  values,
  withSwatch = false,
}: AttributeFormProps) {
  const { admin } = useDictionary();
  const copy = admin.filters;
  const [failed, setFailed] = useState(false);
  const form = useForm<AttributeFormValues>({
    defaultValues: {
      nameEn: values?.nameEn ?? "",
      nameEs: values?.nameEs ?? "",
      swatchColor: values?.swatchColor ?? "",
    },
    resolver: zodResolver(createAttributeFormSchema(copy.errors)),
  });
  const { isSubmitting } = useFormState({ control: form.control });

  // The button that opened the editor is gone once it shows: focus moves
  // into it, or a keyboard user would be left on the page itself.
  useEffect(() => {
    if (focusOnOpen) {
      form.setFocus("nameEs");
    }
  }, [focusOnOpen, form]);

  const submit = async ({
    nameEn,
    nameEs,
    swatchColor,
  }: AttributeFormValues) => {
    setFailed(false);
    const result = await onSave({
      nameEn: nameEn === "" ? null : nameEn,
      nameEs,
      swatchColor: swatchColor === "" ? null : swatchColor,
    });

    if (result === "duplicate") {
      form.setError("nameEs", { message: copy.errors.duplicate });
    } else if (result === "failed") {
      setFailed(true);
    } else if (!values) {
      // Something new was added: the form is ready for the next one.
      form.reset({ nameEn: "", nameEs: "", swatchColor: "" });
    }
  };

  return (
    <Form {...form}>
      <form
        aria-labelledby={labelledBy}
        className={cn(
          "grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start",
          className
        )}
        data-slot="attribute-form"
        noValidate
        onSubmit={(event) => {
          void form.handleSubmit(submit)(event);
        }}
      >
        {/* Locked while saving: what is typed meanwhile was not sent, and
            the reset after a save would erase it. */}
        <fieldset className="contents" disabled={isSubmitting}>
          <FormField
            control={form.control}
            name="nameEs"
            render={({ field }) => (
              <FormItem className="min-w-0">
                <FormLabel required>{copy.fields.nameEs}</FormLabel>
                <FormControl>
                  <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="nameEn"
            render={({ field }) => (
              <FormItem className="min-w-0">
                <FormLabel>{copy.fields.nameEn}</FormLabel>
                <FormControl>
                  <Input autoComplete="off" lang="en" {...field} />
                </FormControl>
                <FormDescription>{copy.fields.nameEnHint}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          {withSwatch ? (
            <FormField
              control={form.control}
              name="swatchColor"
              render={({ field }) => (
                <SwatchField
                  hint={copy.fields.swatchHint}
                  labels={{
                    add: copy.fields.swatchAdd,
                    remove: copy.fields.swatchRemove,
                    swatch: copy.fields.swatch,
                  }}
                  {...field}
                />
              )}
            />
          ) : null}
        </fieldset>
        <div
          className={cn(
            "flex gap-2",
            withSwatch
              ? "sm:col-span-3"
              : "sm:col-start-3 sm:row-start-1 sm:pt-6"
          )}
        >
          <Button disabled={isSubmitting} type="submit">
            {isSubmitting ? pendingLabel : submitLabel}
          </Button>
          {onCancel ? (
            // Locked while saving: a save that lands after a cancel and a
            // reopen would close the newer editor.
            <Button
              disabled={isSubmitting}
              onClick={onCancel}
              type="button"
              variant="ghost"
            >
              {copy.edit.cancel}
            </Button>
          ) : null}
        </div>
        {failed ? (
          <p className="text-sm text-destructive sm:col-span-3" role="alert">
            {copy.errors.generic}
          </p>
        ) : null}
      </form>
    </Form>
  );
}

interface SwatchFieldProps {
  hint: string;
  labels: { add: string; remove: string; swatch: string };
  name: string;
  onBlur: () => void;
  onChange: (value: string) => void;
  ref: RefCallback<HTMLInputElement>;
  value: string;
}

/**
 * The swatch: with none, a button that opens the browser's picker, and the
 * swatch exists once a color is chosen there (a form left alone saves none,
 * whatever the picker showed). With one, the picker and "Remove". It is one
 * input in both states, so focus stays on it while a color is picked and
 * comes back to it after "Remove".
 */
function SwatchField({
  hint,
  labels,
  name,
  onBlur,
  onChange,
  ref,
  value,
}: SwatchFieldProps) {
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hasColor = value !== "";

  return (
    <div className="space-y-2 sm:col-span-3">
      <div className="flex flex-wrap items-center gap-2">
        <label
          className={
            hasColor
              ? "flex items-center gap-2 text-sm font-medium"
              : cn(
                  buttonVariants({ variant: "outline" }),
                  "cursor-pointer has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
                )
          }
        >
          {hasColor ? labels.swatch : labels.add}
          <input
            aria-describedby={hasColor ? hintId : undefined}
            className={
              hasColor
                ? "h-11 w-16 cursor-pointer rounded-md border bg-background p-1 md:h-9"
                : "sr-only"
            }
            name={name}
            onBlur={() => {
              onBlur();
            }}
            onChange={(event) => {
              onChange(event.target.value.toLowerCase());
            }}
            ref={(node) => {
              inputRef.current = node;
              ref(node);
            }}
            type="color"
            value={value}
          />
        </label>
        {hasColor ? (
          <Button
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            type="button"
            variant="ghost"
          >
            {labels.remove}
          </Button>
        ) : null}
      </div>
      {hasColor ? (
        <p className="text-sm text-muted-foreground" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export { AttributeForm };
