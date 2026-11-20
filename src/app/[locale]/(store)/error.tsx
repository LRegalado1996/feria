"use client";

import { useEffect } from "react";

import { StoreFrame } from "@/app/_components/organisms/store-frame";
import { StoreStatusPage } from "@/app/_components/organisms/store-status-page";
import { reportError } from "@/lib/errors/client";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";

/**
 * A page of the store that threw while rendering, in the store's frame:
 * reported once, with a retry. It replaces the page, frame included, so it
 * brings its own, without the bar or the categories it cannot read.
 */
export default function StoreError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const { shell } = useDictionary().storefront;
  const locale = useLocale();

  useEffect(() => {
    // Reporting is the external system this effect synchronises with.
    reportError(error, { action: "Storefront.render_failed" });
  }, [error]);

  return (
    <StoreFrame copy={shell} locale={locale}>
      <StoreStatusPage
        body={shell.error.body}
        retry={{ label: shell.error.retry, onRetry: retry }}
        title={shell.error.title}
      />
    </StoreFrame>
  );
}
