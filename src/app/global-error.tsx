"use client";

import "@/styles/globals.css";
import { useParams } from "next/navigation";
import { useEffect } from "react";

import { errors as enErrors } from "@/content/en/errors";
import { errors as esErrors } from "@/content/es/errors";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/config";

// The root layout is what failed, and its dictionary provider with it, so this
// page carries its own few lines in every language.
const COPY = {
  es: esErrors.global,
  en: enErrors.global,
} satisfies Record<Locale, typeof esErrors.global>;

/**
 * The reporter is imported lazily: if the shared chunk is what failed to load,
 * the page still renders, and the browser's own `reportError` takes the report
 * instead.
 */
async function reportRootError(error: unknown): Promise<void> {
  try {
    const { reportError } = await import("@/lib/errors/client");
    reportError(error, { action: "App.root_failed" });
  } catch (reporterError) {
    window.reportError(error);
    window.reportError(reporterError);
  }
}

/** The root layout itself threw, so this replaces the whole document. */
export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : DEFAULT_LOCALE;
  const copy = COPY[locale];

  useEffect(() => {
    void reportRootError(error);
  }, [error]);

  return (
    <html lang={locale}>
      <body>
        <main
          className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center"
          data-slot="global-error-page"
        >
          <h1 className="text-2xl font-semibold">{copy.title}</h1>
          <p className="text-sm text-muted-foreground">{copy.description}</p>
          <button
            className="rounded-md border px-4 py-2 text-sm"
            onClick={retry}
            type="button"
          >
            {copy.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
