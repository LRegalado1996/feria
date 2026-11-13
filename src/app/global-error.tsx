"use client";

import "@/styles/globals.css";
import { useEffect } from "react";

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
  useEffect(() => {
    void reportRootError(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main
          className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center"
          data-slot="global-error-page"
        >
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            The app failed to load. Try again in a moment.
          </p>
          <button
            className="rounded-md border px-4 py-2 text-sm"
            onClick={retry}
            type="button"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
