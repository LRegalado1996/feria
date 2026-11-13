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
import { reportError } from "@/lib/errors/client";
import {
  type AuthFormValues,
  authSchema,
  signUpSchema,
} from "@/lib/schemas/auth";
import { authClient } from "@/server/better-auth/client";

type AuthMode = "signin" | "signup";

const COPY = {
  signin: {
    submit: "Sign In",
    pending: "Signing in…",
    switchTo: "Don't have an account? Sign Up",
    failed: "Sign in failed. Try again.",
  },
  signup: {
    submit: "Sign Up",
    pending: "Signing up…",
    switchTo: "Already have an account? Sign In",
    failed: "Sign up failed. Try again.",
  },
} satisfies Record<AuthMode, Record<string, string>>;

// Better Auth error codes the user can act on. Anything else gets the generic
// line for the mode: the library's own message is never shown.
const ERROR_MESSAGES: Partial<Record<string, string>> = {
  INVALID_EMAIL_OR_PASSWORD: "Invalid email or password.",
  USER_ALREADY_EXISTS: "An account with this email already exists.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    "An account with this email already exists.",
};

const UNREACHABLE =
  "We could not reach the server. Check your connection and try again.";

export interface AuthFormProps {
  initialMode?: AuthMode;
  onSuccess?: () => void;
}

/**
 * A full page load, not `router.refresh()`: the session changed, and a soft
 * refresh can keep a shell rendered for the old session, or drop the page
 * behind a server redirect (docs/agents/nextjs.md § Navigation).
 */
function reloadSignedIn() {
  window.location.assign("/");
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
  const copy = COPY[mode];
  const [error, setError] = useState("");
  const form = useForm<AuthFormValues>({
    resolver: zodResolver(mode === "signup" ? signUpSchema : authSchema),
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
        setError(ERROR_MESSAGES[result.error.code ?? ""] ?? copy.failed);
        return;
      }

      onSuccess?.();
      reloadSignedIn();
    } catch (error) {
      reportError(error, {
        action: mode === "signup" ? "Auth.sign_up" : "Auth.sign_in",
      });
      setError(UNREACHABLE);
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
                  <FormLabel required>Name</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="name"
                      placeholder="Your name"
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
                <FormLabel required>Email</FormLabel>
                <FormControl>
                  <Input
                    autoComplete="email"
                    placeholder="you@example.com"
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
                <FormLabel required>Password</FormLabel>
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
