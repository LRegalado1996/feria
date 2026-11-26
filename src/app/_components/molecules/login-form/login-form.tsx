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
import { PasswordInput } from "@/app/_components/molecules/password-input";
import { reportError } from "@/lib/errors/client";
import { useDictionary } from "@/lib/hooks/i18n";
import {
  createLoginFormSchema,
  type LoginFormValues,
} from "@/lib/schemas/access";
import { cn } from "@/lib/utils";

/** How a save ended: saved, refused for its email, or failed. */
export type LoginFormOutcome = "failed" | "saved" | "taken";

export interface LoginFormProps {
  className?: string;
  onCancel: () => void;
  /** Creates the login; answers how it ended. A failure keeps what was typed. */
  onSave: (values: LoginFormValues) => Promise<LoginFormOutcome>;
}

/**
 * A new login (FER-015): its name, its email and the temporary password the
 * admin types to send it. An email another login has is said under the
 * email; any other failure keeps everything typed and says so.
 */
function LoginForm({ className, onCancel, onSave }: LoginFormProps) {
  const { admin } = useDictionary();
  const copy = admin.users;
  const [failed, setFailed] = useState(false);
  const form = useForm<LoginFormValues>({
    defaultValues: { email: "", name: "", password: "" },
    resolver: zodResolver(createLoginFormSchema(copy.validation)),
  });
  // A hook, not `form.formState`: the React Compiler memoizes a read off the
  // stable `form` object, and the controls would never update.
  const { isSubmitting: saving } = useFormState({ control: form.control });

  const submit = async (values: LoginFormValues) => {
    setFailed(false);
    let outcome: LoginFormOutcome;

    try {
      outcome = await onSave(values);
    } catch (error) {
      // The caller answers its own failures; one that slips through is
      // still a failed save, never controls left waiting.
      reportError(error, { action: "Users.create_login" });
      outcome = "failed";
    }

    if (outcome === "taken") {
      form.setError("email", { message: copy.errors.emailTaken });
    }

    setFailed(outcome === "failed");
  };

  return (
    <Form {...form}>
      <form
        aria-label={copy.form.createTitle}
        className={cn("flex min-w-0 flex-col gap-5", className)}
        data-slot="login-form"
        data-testid="login-form"
        noValidate
        onSubmit={(event) => {
          void form.handleSubmit(submit)(event);
        }}
      >
        <fieldset className="flex min-w-0 flex-col gap-5" disabled={saving}>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="min-w-0">
                <FormLabel required>{copy.form.name}</FormLabel>
                <FormControl>
                  <Input {...field} autoComplete="off" required />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="min-w-0">
                <FormLabel required>{copy.form.email}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    autoCapitalize="none"
                    autoComplete="off"
                    inputMode="email"
                    required
                    spellCheck={false}
                    type="email"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
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
          {failed ? (
            <p className="text-sm text-destructive" role="alert">
              {copy.errors.create}
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
            <Button data-testid="login-form-submit" type="submit">
              {saving ? copy.form.pending : copy.form.submit}
            </Button>
          </div>
        </fieldset>
      </form>
    </Form>
  );
}

export { LoginForm };
