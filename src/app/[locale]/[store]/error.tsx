"use client";

import { useEffect } from "react";

import { StoreStatusPage } from "@/app/_components/organisms/store-status-page";
import { reportError } from "@/lib/errors/client";
import { useDictionary } from "@/lib/hooks/i18n";

/**
 * A page of a store that threw while rendering, inside its header and
 * footer: reported once, with a retry.
 */
export default function StoreError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const copy = useDictionary().storefront.shell.error;

  useEffect(() => {
    // Reporting is the external system this effect synchronises with.
    reportError(error, { action: "Storefront.render_failed" });
  }, [error]);

  return (
    <StoreStatusPage
      body={copy.body}
      retry={{ label: copy.retry, onRetry: retry }}
      title={copy.title}
    />
  );
}
