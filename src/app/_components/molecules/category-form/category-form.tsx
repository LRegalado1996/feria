"use client";

import { zodResolver } from "@hookform/resolvers/zod";
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
import { useDictionary } from "@/lib/hooks/i18n";
import {
  type CategoryFormValues,
  createCategoryFormSchema,
} from "@/lib/schemas/catalog";
import { cn } from "@/lib/utils";

/** How a save ended, as the form needs to show it. */
export type CategoryFormResult = "duplicate" | "failed" | "saved";

export interface CategoryFormProps {
  className?: string;
  /** Present when the form edits a category: shows "Cancel". */
  onCancel?: () => void;
  /** Saves the names; the form keeps what was typed unless it was saved. */
  onSave: (values: {
    nameEn: string | null;
    nameEs: string;
  }) => Promise<CategoryFormResult>;
  pendingLabel: string;
  submitLabel: string;
  /** The names to start from: a category being renamed. */
  values?: { nameEn: string | null; nameEs: string };
}

/**
 * The Spanish name (required) and the English one (optional: the storefront
 * shows the Spanish one in its place). A name the store already uses comes
 * back as an error on the Spanish field; nothing typed is lost on a failure.
 */
function CategoryForm({
  className,
  onCancel,
  onSave,
  pendingLabel,
  submitLabel,
  values,
}: CategoryFormProps) {
  const { admin } = useDictionary();
  const copy = admin.categories;
  const [failed, setFailed] = useState(false);
  const form = useForm<CategoryFormValues>({
    defaultValues: {
      nameEn: values?.nameEn ?? "",
      nameEs: values?.nameEs ?? "",
    },
    resolver: zodResolver(createCategoryFormSchema(copy.errors)),
  });
  const { isSubmitting } = useFormState({ control: form.control });

  const submit = async ({ nameEn, nameEs }: CategoryFormValues) => {
    setFailed(false);
    const result = await onSave({
      nameEn: nameEn === "" ? null : nameEn,
      nameEs,
    });

    if (result === "duplicate") {
      form.setError("nameEs", { message: copy.errors.duplicate });
    } else if (result === "failed") {
      setFailed(true);
    } else if (!values) {
      // A new category was added: the form is ready for the next one.
      form.reset({ nameEn: "", nameEs: "" });
    }
  };

  return (
    <Form {...form}>
      <form
        className={cn(
          "grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start",
          className
        )}
        data-slot="category-form"
        noValidate
        onSubmit={(event) => {
          void form.handleSubmit(submit)(event);
        }}
      >
        {/* Fields are locked while saving: what is typed meanwhile was not
            sent, and the reset after a save would erase it. A fieldset
            keeps the grid's columns with `contents`. */}
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
        </fieldset>
        <div className="flex gap-2 sm:pt-6">
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

export { CategoryForm };
