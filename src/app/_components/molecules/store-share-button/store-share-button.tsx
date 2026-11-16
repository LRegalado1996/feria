"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";

import { StoreButton } from "@/app/_components/atoms/store-button";
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
  // One share at a time: a second tap while the sheet or the copy is still
  // working does nothing.
  const [pending, setPending] = useState(false);

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

  const shareOnce = async () => {
    if (pending) {
      return;
    }

    setPending(true);
    // `share` reports its own failures and never throws.
    await share();
    setPending(false);
  };

  return (
    <div
      className={cn("flex items-center gap-2", className)}
      data-slot="store-share-button"
    >
      {/* A second action, never the page's main one: the outlined pill. */}
      <StoreButton
        aria-disabled={pending}
        onClick={() => {
          void shareOnce();
        }}
        type="button"
        variant="outline"
      >
        <Share2 aria-hidden="true" />
        {copy.share}
      </StoreButton>
      <output aria-live="polite" className="text-sm text-store-muted">
        {status.text}
        {/* An invisible mark that alternates, so a repeated message is new. */}
        {status.count % 2 === 1 ? "⁠" : null}
      </output>
    </div>
  );
}

export { StoreShareButton };
