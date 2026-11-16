"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useSyncExternalStore } from "react";
import { useForm, useFormState } from "react-hook-form";

import { Button } from "@/app/_components/atoms/button";
import { Input } from "@/app/_components/atoms/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/_components/molecules/form";
import { PasswordInput } from "@/app/_components/molecules/password-input";
import type { Dictionary } from "@/content";
import { reportError } from "@/lib/errors/client";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { localizePath } from "@/lib/i18n/paths";
import { type AuthFormValues, createAuthSchema } from "@/lib/schemas/auth";
import { authClient } from "@/server/better-auth/client";

// Better Auth error codes the user can act on, by their message in the `auth`
// dictionary. Anything else gets the generic line: the library's own message
// is never shown.
const ERROR_KEYS: Partial<Record<string, keyof Dictionary["auth"]["errors"]>> =
  {
    INVALID_EMAIL_OR_PASSWORD: "invalidCredentials",
  };

export interface AuthFormProps {
  onSuccess?: () => void;
}

/**
 * A full page load, not `router.refresh()`: the session changed, and a soft
 * refresh can keep a shell rendered for the old session, or drop the page
 * behind a server redirect (docs/agents/nextjs.md § Navigation). To the home
 * page of the language the visitor signed in from.
 */
function reloadSignedIn(home: string) {
  window.location.assign(home);
}

function subscribeToNothing() {
  return () => undefined;
}

/**
 * `false` in the server render and while hydrating, `true` once React owns
 * the form. Before that, a submit is the browser's own: a GET to this page
 * with the email and password in the URL, where logs and history keep them.
 */
function useHydrated() {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  );
}

/**
 * Email and password sign-in. There is no sign-up: logins are created by a
 * superadmin or a store member (FER-009).
 */
export function AuthForm({ onSuccess }: AuthFormProps) {
  const { auth } = useDictionary();
  const locale = useLocale();
  const copy = auth.signIn;
  const [error, setError] = useState("");
  const form = useForm<AuthFormValues>({
    resolver: zodResolver(createAuthSchema(auth.validation)),
    defaultValues: { email: "", password: "" },
  });
  // A hook, not `form.formState`: the React Compiler memoizes a read off the
  // stable `form` object, and the button would never update.
  const { isSubmitting } = useFormState({ control: form.control });
  const hydrated = useHydrated();

  const onSubmit = async (values: AuthFormValues) => {
    setError("");

    try {
      const result = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      });

      if (result.error) {
        const errorKey = ERROR_KEYS[result.error.code ?? ""];
        setError(errorKey ? auth.errors[errorKey] : copy.failed);
        return;
      }

      onSuccess?.();
      reloadSignedIn(localizePath("/", locale));
    } catch (error) {
      reportError(error, { action: "Auth.sign_in" });
      setError(auth.errors.unreachable);
    }
  };

  return (
    <div className="space-y-4" data-slot="auth-form">
      <Form {...form}>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            void form.handleSubmit(onSubmit)(event);
          }}
        >
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{auth.fields.email.label}</FormLabel>
                <FormControl>
                  <Input
                    autoComplete="email"
                    placeholder={auth.fields.email.placeholder}
                    type="email"
                    {...field}
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
              <FormItem>
                <FormLabel required>{auth.fields.password.label}</FormLabel>
                <FormControl>
                  <PasswordInput
                    autoComplete="current-password"
                    placeholder="••••••••"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {error && (
            <p
              className="text-center text-sm text-destructive"
              data-testid="auth-error"
              role="alert"
            >
              {error}
            </p>
          )}
          <Button
            className="w-full"
            disabled={!hydrated || isSubmitting}
            type="submit"
          >
            {isSubmitting ? copy.pending : copy.submit}
          </Button>
        </form>
      </Form>
    </div>
  );
}
