"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";

import { StoreButton } from "@/app/_components/atoms/store-button";
import { reportError } from "@/lib/errors/client";
import { useDictionary } from "@/lib/hooks/i18n";
import { useHydrated } from "@/lib/hooks/ui/use-hydrated";
import { cn } from "@/lib/utils";

export interface StoreShareButtonProps {
  className?: string;
  /** The article's name, which the phone's share sheet shows. */
  title: string;
  /** The article's whole address, in the page's language. */
  url: string;
}

type Outcome = "copied" | "failed" | "shared";

/** Whether the browser said no on purpose: a closed sheet, a refused clipboard. */
function isRefusal(error: unknown, ...names: string[]): boolean {
  return error instanceof DOMException && names.includes(error.name);
}

/**
 * "Compartir" on an article's page (FER-019): a small white circle with the
 * share icon, on the photos beside the magnifier, named for a screen reader
 * ("Compartir"); a check once the address is copied. On a phone it opens the phone's own share sheet (WhatsApp,
 * Instagram, a message) with the article's name and address; where there is
 * none (most computers) it copies the address and says so. Closing the
 * sheet is not an error; a clipboard the browser refuses says to copy the
 * address by hand. Anything else is reported. Disabled until React owns it:
 * a press on the server's HTML would do nothing.
 */
function StoreShareButton({ className, title, url }: StoreShareButtonProps) {
  const copy = useDictionary().storefront.article;
  const hydrated = useHydrated();
  const [said, setSaid] = useState<{ count: number; outcome: Outcome | null }>({
    count: 0,
    outcome: null,
  });

  const say = (outcome: Outcome) => {
    setSaid((previous) => ({ count: previous.count + 1, outcome }));
  };

  const copyAddress = async (): Promise<Outcome> => {
    if (!("clipboard" in navigator)) {
      return "failed";
    }

    try {
      await navigator.clipboard.writeText(url);
      return "copied";
    } catch (error) {
      if (!isRefusal(error, "NotAllowedError")) {
        reportError(error, { action: "Article.copy_link" });
      }

      return "failed";
    }
  };

  const share = async () => {
    if (typeof navigator.share !== "function") {
      say(await copyAddress());
      return;
    }

    try {
      await navigator.share({ title, url });
      say("shared");
    } catch (error) {
      if (isRefusal(error, "AbortError")) {
        return;
      }

      // The sheet would not open (no permission, nothing to share to): the
      // address is copied instead.
      if (!isRefusal(error, "NotAllowedError")) {
        reportError(error, { action: "Article.share" });
      }

      say(await copyAddress());
    }
  };

  let message = "";

  if (said.outcome === "copied") {
    message = copy.shareCopied;
  } else if (said.outcome === "failed") {
    message = copy.shareFailed;
  }

  return (
    <div className={cn("relative", className)} data-slot="store-share-button">
      <StoreButton
        aria-label={copy.share}
        data-testid="store-article-share"
        disabled={!hydrated}
        onClick={() => {
          void share();
        }}
        size="icon-sm"
        type="button"
        variant="outline"
      >
        {said.outcome === "copied" ? (
          <Check aria-hidden="true" />
        ) : (
          <Share2 aria-hidden="true" />
        )}
      </StoreButton>
      {/* Under the circle, on the photo: a moss note, so it reads on any
          photo. */}
      <output
        aria-live="polite"
        className="absolute top-full left-0 mt-2 w-max max-w-[min(16rem,70vw)] rounded-2xl bg-store-contrast px-3 py-2 text-xs text-store-background empty:hidden"
        data-testid="store-article-share-status"
      >
        {message}
        {/* An invisible mark that alternates, so a repeated message is new. */}
        {message !== "" && said.count % 2 === 1 ? "⁠" : null}
      </output>
    </div>
  );
}

export { StoreShareButton };
