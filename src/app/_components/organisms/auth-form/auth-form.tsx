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
import {
  type AuthFormValues,
  createAuthSchema,
  createSignUpSchema,
} from "@/lib/schemas/auth";
import { authClient } from "@/server/better-auth/client";

type AuthMode = "signin" | "signup";

// Each mode's copy in the `auth` dictionary.
const COPY_KEY = {
  signin: "signIn",
  signup: "signUp",
} as const satisfies Record<AuthMode, keyof Dictionary["auth"]>;

// Better Auth error codes the user can act on, by their message in the `auth`
// dictionary. Anything else gets the generic line for the mode: the library's
// own message is never shown.
const ERROR_KEYS: Partial<Record<string, keyof Dictionary["auth"]["errors"]>> =
  {
    INVALID_EMAIL_OR_PASSWORD: "invalidCredentials",
    USER_ALREADY_EXISTS: "userExists",
    USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "userExists",
  };

export interface AuthFormProps {
  initialMode?: AuthMode;
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

export function AuthForm({ onSuccess, initialMode = "signin" }: AuthFormProps) {
  const [mode, setMode] = useState(initialMode);

  // Keyed by mode: switching mounts a fresh form, so nothing typed or
  // reported in one mode leaks into the other, with no `reset()` to undo.
  return (
    <AuthModeForm
      key={mode}
      mode={mode}
      onSuccess={onSuccess}
      onSwitchMode={() => {
        setMode(mode === "signin" ? "signup" : "signin");
      }}
    />
  );
}

function AuthModeForm({
  mode,
  onSuccess,
  onSwitchMode,
}: {
  mode: AuthMode;
  onSuccess?: () => void;
  onSwitchMode: () => void;
}) {
  const { auth } = useDictionary();
  const locale = useLocale();
  const copy = auth[COPY_KEY[mode]];
  const [error, setError] = useState("");
  const form = useForm<AuthFormValues>({
    resolver: zodResolver(
      mode === "signup"
        ? createSignUpSchema(auth.validation)
        : createAuthSchema(auth.validation)
    ),
    defaultValues: { name: "", email: "", password: "" },
  });
  // A hook, not `form.formState`: the React Compiler memoizes a read off the
  // stable `form` object, and the button would never update.
  const { isSubmitting } = useFormState({ control: form.control });
  const hydrated = useHydrated();

  const onSubmit = async (values: AuthFormValues) => {
    setError("");

    try {
      const result =
        mode === "signup"
          ? await authClient.signUp.email({
              email: values.email,
              password: values.password,
              name: values.name ?? "",
            })
          : await authClient.signIn.email({
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
      reportError(error, {
        action: mode === "signup" ? "Auth.sign_up" : "Auth.sign_in",
      });
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
          {mode === "signup" && (
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>{auth.fields.name.label}</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="name"
                      placeholder={auth.fields.name.placeholder}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
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
                    autoComplete={
                      mode === "signup" ? "new-password" : "current-password"
                    }
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
      <div className="text-center">
        <Button onClick={onSwitchMode} size="sm" variant="link">
          {copy.switchTo}
        </Button>
      </div>
    </div>
  );
}
