import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
};

/** A miss with a way out, instead of Next's dead-end default. */
export default function NotFound() {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center"
      data-slot="not-found-page"
    >
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">
        The address you opened does not exist or is no longer available.
      </p>
      <Link
        className="text-sm text-primary underline underline-offset-4"
        data-testid="not-found-home-link"
        href="/"
      >
        Go to the home page
      </Link>
    </main>
  );
}
