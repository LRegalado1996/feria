"use client";

import { useEffect, useState } from "react";

import { Button } from "@/app/_components/atoms/button";
import { reportError } from "@/lib/errors/client";

/**
 * A page that threw while rendering. Reports once and shows the event id, the
 * code support looks the failure up by. Not shown when nothing was sent.
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const [eventId, setEventId] = useState<string | null>(null);

  useEffect(() => {
    // Reporting is the external system this effect synchronises with, and the
    // id only exists once it has run.
    // oxlint-disable-next-line react/set-state-in-effect -- see above
    setEventId(reportError(error, { action: "App.render_failed" }));
  }, [error]);

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center"
      data-slot="error-page"
    >
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        This page failed to load. Try again in a moment.
      </p>
      <Button onClick={retry} type="button" variant="outline">
        Try again
      </Button>
      {eventId ? (
        <p className="text-xs text-muted-foreground">
          Support code: <span className="font-mono">{eventId}</span>
        </p>
      ) : null}
    </main>
  );
}
