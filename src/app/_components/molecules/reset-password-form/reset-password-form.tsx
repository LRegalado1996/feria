"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFormState } from "react-hook-form";

import { Button } from "@/app/_components/atoms/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/_components/molecules/form";
import { PasswordInput } from "@/app/_components/molecules/password-input";
import { reportError } from "@/lib/errors/client";
import { useDictionary } from "@/lib/hooks/i18n";
import {
  createResetPasswordFormSchema,
  type ResetPasswordFormValues,
} from "@/lib/schemas/access";
import { cn } from "@/lib/utils";

export interface ResetPasswordFormProps {
  className?: string;
  onCancel: () => void;
  /** Saves the password; answers whether it was. A failure keeps it typed. */
  onSave: (values: ResetPasswordFormValues) => Promise<boolean>;
}

/**
 * Another login's new temporary password, typed by the admin (FER-015). A
 * failure keeps it typed and says so.
 */
function ResetPasswordForm({
  className,
  onCancel,
  onSave,
}: ResetPasswordFormProps) {
  const copy = useDictionary().admin.users;
  const form = useForm<ResetPasswordFormValues>({
    defaultValues: { password: "" },
    resolver: zodResolver(createResetPasswordFormSchema(copy.validation)),
  });
  // A hook, not `form.formState`: the React Compiler memoizes a read off the
  // stable `form` object, and the controls would never update.
  const { errors, isSubmitting: saving } = useFormState({
    control: form.control,
  });

  const submit = async (values: ResetPasswordFormValues) => {
    let saved: boolean;

    try {
      saved = await onSave(values);
    } catch (error) {
      reportError(error, { action: "Users.reset_password" });
      saved = false;
    }

    // A form error of its own, which the next submit clears, even one its
    // validation stops before it reaches the server.
    if (!saved) {
      form.setError("root", { message: copy.errors.reset });
    }
  };

  return (
    <Form {...form}>
      <form
        aria-label={copy.reset.title}
        className={cn("flex min-w-0 flex-col gap-5", className)}
        data-slot="reset-password-form"
        data-testid="reset-password-form"
        noValidate
        onSubmit={(event) => {
          void form.handleSubmit(submit)(event);
        }}
      >
        <fieldset className="flex min-w-0 flex-col gap-5" disabled={saving}>
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem className="min-w-0">
                <FormLabel required>{copy.form.password}</FormLabel>
                <FormControl>
                  {/* Revealable: the admin reads it out or copies it next. */}
                  <PasswordInput
                    {...field}
                    autoComplete="new-password"
                    required
                  />
                </FormControl>
                <FormDescription>{copy.form.passwordHint}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          {errors.root?.message ? (
            <p className="text-sm text-destructive" role="alert">
              {errors.root.message}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              onClick={() => {
                onCancel();
              }}
              type="button"
              variant="outline"
            >
              {copy.form.cancel}
            </Button>
            <Button data-testid="reset-password-submit" type="submit">
              {saving ? copy.reset.pending : copy.reset.submit}
            </Button>
          </div>
        </fieldset>
      </form>
    </Form>
  );
}

export { ResetPasswordForm };
