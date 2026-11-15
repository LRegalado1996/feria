"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";

import { reportError } from "@/lib/errors/client";
import { useDictionary } from "@/lib/hooks/i18n";
import { cn } from "@/lib/utils";

export interface StoreShareButtonProps {
  className?: string;
  /** What the shared link is called in the share sheet. */
  title: string;
}

/**
 * Shares the page the shopper is on (FER-023): the phone's share sheet when
 * the browser has one, else the link copied, said in a polite live region.
 * Closing the share sheet is not a failure.
 */
function StoreShareButton({ className, title }: StoreShareButtonProps) {
  const copy = useDictionary().storefront.catalog;
  const [status, setStatus] = useState("");

  const share = async () => {
    const url = window.location.href;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          reportError(error, { action: "Catalog.share" });
        }
      }

      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setStatus(copy.shareCopied);
    } catch (error) {
      reportError(error, { action: "Catalog.copy_link" });
      setStatus(copy.shareFailed);
    }
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button
        className="inline-flex min-h-11 items-center gap-2 border-2 border-store-contrast px-4 text-sm font-semibold text-store-foreground hover:bg-store-contrast hover:text-store-background focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground"
        data-slot="store-share-button"
        onClick={() => {
          void share();
        }}
        type="button"
      >
        <Share2 aria-hidden="true" className="size-4" />
        {copy.share}
      </button>
      <output aria-live="polite" className="text-sm text-store-muted">
        {status}
      </output>
    </div>
  );
}

export { StoreShareButton };
