"use client";

import { Copy } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/app/_components/atoms/button";
import { reportError } from "@/lib/errors/client";
import { useDictionary } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import { cn } from "@/lib/utils";

export interface LoginCredentialsProps {
  className?: string;
  email: string;
  /** The temporary password the admin just typed. */
  password: string;
  /** The admin's sign-in page, a path of this site in the login's language. */
  signInPath: string;
}

type Outcome = { kind: "copied" } | { kind: "idle" } | { kind: "manual" };

/**
 * What the admin sends a login with a temporary password (FER-015): the
 * sign-in page, the email and the password, shown once, right after they
 * were saved, and copied in one go. When the browser refuses the clipboard
 * the same text shows selected, to copy by hand. A refusal is the
 * browser's policy and is not reported; any other failure is.
 */
function LoginCredentials({
  className,
  email,
  password,
  signInPath,
}: LoginCredentialsProps) {
  const copy = useDictionary().admin.users;
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [message, setMessage] = useState("");
  const fieldId = useId();

  const copyDetails = async () => {
    const text = interpolate(copy.created.message, {
      email,
      password,
      url: new URL(signInPath, window.location.origin).href,
    });
    setMessage(text);
    // Missing outside a secure page, whatever the types say.
    const clipboard = navigator.clipboard as Clipboard | undefined;

    if (!clipboard) {
      setOutcome({ kind: "manual" });
      return;
    }

    try {
      await clipboard.writeText(text);
      setOutcome({ kind: "copied" });
    } catch (error) {
      if (
        !(error instanceof DOMException && error.name === "NotAllowedError")
      ) {
        reportError(error, { action: "Users.copy_credentials" });
      }

      setOutcome({ kind: "manual" });
    }
  };

  return (
    <div
      className={cn("flex min-w-0 flex-col gap-4", className)}
      data-slot="login-credentials"
      data-testid="login-credentials"
    >
      <dl className="grid gap-3 rounded-lg border p-4 text-sm">
        <div className="min-w-0 space-y-0.5">
          <dt className="text-xs text-muted-foreground">{copy.form.email}</dt>
          <dd className="break-all" data-testid="login-credentials-email">
            {email}
          </dd>
        </div>
        <div className="min-w-0 space-y-0.5">
          <dt className="text-xs text-muted-foreground">
            {copy.form.password}
          </dt>
          <dd
            className="font-mono break-all"
            data-testid="login-credentials-password"
          >
            {password}
          </dd>
        </div>
      </dl>
      <Button
        className="w-full sm:w-auto sm:self-start"
        data-testid="login-credentials-copy"
        onClick={() => {
          void copyDetails();
        }}
        type="button"
        variant="outline"
      >
        <Copy aria-hidden="true" />
        {copy.created.copy}
      </Button>
      <output className="block text-xs text-muted-foreground empty:hidden">
        {outcome.kind === "copied" ? copy.created.copied : null}
      </output>
      {outcome.kind === "manual" ? (
        <div className="flex min-w-0 flex-col gap-1.5">
          <label className="text-xs" htmlFor={fieldId}>
            {copy.created.copyFailed}
          </label>
          <textarea
            // Selected at once, so a long press or Ctrl+C copies it whole.
            autoFocus
            className="min-h-24 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm dark:bg-input/30"
            data-testid="login-credentials-field"
            id={fieldId}
            onFocus={(event) => {
              event.currentTarget.select();
            }}
            readOnly
            value={message}
          />
        </div>
      ) : null}
    </div>
  );
}

export { LoginCredentials };
