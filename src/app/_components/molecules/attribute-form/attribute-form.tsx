"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
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
              render={({ field }) =>
                field.value === "" ? (
                  <div className="sm:col-span-3">
                    {/* The button opens the browser's picker, and the swatch
                        exists once a color is chosen there: a form left with
                        no choice saves none, whatever the picker showed. */}
                    <label
                      className={cn(
                        buttonVariants({ size: "sm", variant: "outline" }),
                        "cursor-pointer has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
                      )}
                    >
                      {copy.fields.swatchAdd}
                      <input
                        className="sr-only"
                        onChange={(event) => {
                          field.onChange(event.target.value.toLowerCase());
                        }}
                        type="color"
                      />
                    </label>
                  </div>
                ) : (
                  <FormItem className="sm:col-span-3">
                    <FormLabel>{copy.fields.swatch}</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl>
                        <input
                          className="h-11 w-16 cursor-pointer rounded-md border bg-background p-1 md:h-9"
                          type="color"
                          {...field}
                          onChange={(event) => {
                            field.onChange(event.target.value.toLowerCase());
                          }}
                        />
                      </FormControl>
                      <Button
                        onClick={() => {
                          field.onChange("");
                        }}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        {copy.fields.swatchRemove}
                      </Button>
                    </div>
                    <FormDescription>{copy.fields.swatchHint}</FormDescription>
                  </FormItem>
                )
              }
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
            <Button onClick={onCancel} type="button" variant="ghost">
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

export { AttributeForm };
