"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ORPCError } from "@orpc/client";
import { useState } from "react";
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
import { useHydrated } from "@/lib/hooks/ui/use-hydrated";
import { useChangePassword } from "@/lib/hooks/user";
import {
  type ChangePasswordFormValues,
  createChangePasswordFormSchema,
  LOGIN_REFUSALS,
} from "@/lib/schemas/access";

export interface ChangePasswordFormProps {
  /**
   * The login is on a temporary password an admin gave it: the first field
   * is named for it.
   */
  forced: boolean;
  /** Where to land once saved, already localized and checked by the page. */
  redirectTo: string;
}

/**
 * The signed-in login choosing its own password (FER-015): the current one
 * (the temporary one, when an admin gave it), then the new one twice. A
 * wrong current password is said under its field; any other failure keeps
 * everything typed and says so. Saved, a full page load to `redirectTo`:
 * what the admin may reach just changed (docs/agents/nextjs.md §
 * Navigation).
 */
function ChangePasswordForm({ forced, redirectTo }: ChangePasswordFormProps) {
  const copy = useDictionary().admin.password;
  const changePassword = useChangePassword();
  const [failed, setFailed] = useState(false);
  const form = useForm<ChangePasswordFormValues>({
    defaultValues: {
      confirmPassword: "",
      currentPassword: "",
      newPassword: "",
    },
    resolver: zodResolver(createChangePasswordFormSchema(copy.validation)),
  });
  // A hook, not `form.formState`: the React Compiler memoizes a read off the
  // stable `form` object, and the button would never update.
  const { isSubmitting } = useFormState({ control: form.control });
  const hydrated = useHydrated();

  const submit = async (values: ChangePasswordFormValues) => {
    setFailed(false);

    try {
      await changePassword.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      window.location.assign(redirectTo);
    } catch (error) {
      if (
        error instanceof ORPCError &&
        error.code === "BAD_REQUEST" &&
        error.message === LOGIN_REFUSALS.wrongCurrentPassword
      ) {
        form.setError("currentPassword", {
          message: forced
            ? copy.errors.wrongTemporary
            : copy.errors.wrongCurrent,
        });
        return;
      }

      reportError(error, { action: "Account.change_password" });
      setFailed(true);
    }
  };

  return (
    <Form {...form}>
      <form
        className="space-y-4"
        data-slot="change-password-form"
        data-testid="change-password-form"
        noValidate
        onSubmit={(event) => {
          void form.handleSubmit(submit)(event);
        }}
      >
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>
                {forced ? copy.fields.temporary : copy.fields.current}
              </FormLabel>
              <FormControl>
                <PasswordInput
                  {...field}
                  autoComplete="current-password"
                  required
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>{copy.fields.new}</FormLabel>
              <FormControl>
                <PasswordInput
                  {...field}
                  autoComplete="new-password"
                  required
                />
              </FormControl>
              <FormDescription>{copy.fields.newHint}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>{copy.fields.confirm}</FormLabel>
              <FormControl>
                <PasswordInput
                  {...field}
                  autoComplete="new-password"
                  required
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {failed ? (
          <p className="text-center text-sm text-destructive" role="alert">
            {copy.errors.save}
          </p>
        ) : null}
        <Button
          className="w-full"
          data-testid="change-password-submit"
          disabled={!hydrated || isSubmitting}
          type="submit"
        >
          {isSubmitting ? copy.pending : copy.submit}
        </Button>
      </form>
    </Form>
  );
}

export { ChangePasswordForm };
