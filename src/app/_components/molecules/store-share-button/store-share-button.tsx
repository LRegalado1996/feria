"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";

import { reportError } from "@/lib/errors/client";
import { useDictionary } from "@/lib/hooks/i18n";
import { cn } from "@/lib/utils";

export interface StoreShareButtonProps {
  className?: string;
  /**
   * The page's own path, as the store writes its links: shared instead of
   * the address bar's, so `fbclid` or `utm_source` are not passed on.
   */
  path: string;
  /** What the shared link is called in the share sheet. */
  title: string;
}

/**
 * Shares the page (FER-023): the phone's share sheet when the browser has
 * one, else the link copied, said in a polite live region. Closing the
 * share sheet is not a failure; a share sheet that fails copies the link
 * instead.
 */
function StoreShareButton({ className, path, title }: StoreShareButtonProps) {
  const copy = useDictionary().storefront.catalog;
  // The count changes the text even when the message repeats, so a second
  // "Link copied" is announced like the first.
  const [status, setStatus] = useState({ count: 0, text: "" });

  const say = (text: string) => {
    setStatus((previous) => ({ count: previous.count + 1, text }));
  };

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      say(copy.shareCopied);
    } catch (error) {
      reportError(error, { action: "Catalog.copy_link" });
      say(copy.shareFailed);
    }
  };

  const share = async () => {
    const url = new URL(path, window.location.origin).href;

    if (typeof navigator.share !== "function") {
      await copyLink(url);
      return;
    }

    try {
      await navigator.share({ title, url });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      reportError(error, { action: "Catalog.share" });
      await copyLink(url);
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
        {status.text}
        {/* An invisible mark that alternates, so a repeated message is new. */}
        {status.count % 2 === 1 ? "⁠" : null}
      </output>
    </div>
  );
}

export { StoreShareButton };
