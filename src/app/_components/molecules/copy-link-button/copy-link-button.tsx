"use client";

import { Link2 } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/app/_components/atoms/button";
import { Input } from "@/app/_components/atoms/input";
import { reportError } from "@/lib/errors/client";
import { cn } from "@/lib/utils";

export interface CopyLinkButtonProps {
  className?: string;
  /** Its words, in the page's language. */
  labels: {
    /** The button. */
    copy: string;
    /** Said politely once the link is on the clipboard. */
    copied: string;
    /** The name of the field that shows the link to copy by hand. */
    field: string;
    /** Why the link shows: the clipboard was refused. */
    manual: string;
  };
  /**
   * A path of this site (`/en/orders/…`): the link copied is absolute, on
   * the origin the page is open at, resolved when the button is pressed.
   */
  path: string;
}

type Outcome =
  | { kind: "copied" }
  | { kind: "idle" }
  | { kind: "manual"; url: string };

/**
 * A button that copies a link of this site, whole, to the clipboard
 * (FER-051: an order's page, to send the shopper again). Copied, a polite
 * line says so. When the browser refuses the clipboard (no permission, an
 * insecure page, no clipboard at all), the link shows in a read-only field,
 * selected, to copy by hand, with the reason above it. A refusal
 * (`NotAllowedError`) is the browser's policy, not a defect, so it is not
 * reported; any other failure is.
 */
function CopyLinkButton({ className, labels, path }: CopyLinkButtonProps) {
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const fieldId = useId();

  const copy = async () => {
    const url = new URL(path, window.location.origin).href;
    // Missing outside a secure page, whatever the types say.
    const clipboard = navigator.clipboard as Clipboard | undefined;

    if (!clipboard) {
      setOutcome({ kind: "manual", url });
      return;
    }

    try {
      await clipboard.writeText(url);
      setOutcome({ kind: "copied" });
    } catch (error) {
      // A refusal is the browser's policy; anything else is a defect.
      if (
        !(error instanceof DOMException && error.name === "NotAllowedError")
      ) {
        reportError(error, { action: "Orders.copy_link" });
      }

      setOutcome({ kind: "manual", url });
    }
  };

  return (
    <div
      className={cn("flex min-w-0 flex-col gap-2", className)}
      data-slot="copy-link-button"
    >
      <Button
        className="w-full md:w-auto md:self-start"
        data-testid="copy-link-button"
        onClick={() => {
          void copy();
        }}
        type="button"
        variant="outline"
      >
        <Link2 aria-hidden="true" />
        {labels.copy}
      </Button>
      <output className="block text-xs text-muted-foreground empty:hidden">
        {outcome.kind === "copied" ? labels.copied : null}
      </output>
      {outcome.kind === "manual" ? (
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-xs" id={`${fieldId}-why`}>
            {labels.manual}
          </p>
          <label className="sr-only" htmlFor={fieldId}>
            {labels.field}
          </label>
          <Input
            aria-describedby={`${fieldId}-why`}
            // Selected at once, so a long press or Ctrl+C copies it whole.
            autoFocus
            data-testid="copy-link-field"
            id={fieldId}
            onFocus={(event) => {
              event.currentTarget.select();
            }}
            readOnly
            value={outcome.url}
          />
        </div>
      ) : null}
    </div>
  );
}

export { CopyLinkButton };
