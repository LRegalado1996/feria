"use client";

import Link from "next/link";

import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { localizePath } from "@/lib/i18n/paths";

/**
 * A miss with a way out, instead of Next's dead-end default. A client
 * component because `not-found` receives no params: the language comes from
 * the provider the root layout mounted around it.
 */
export default function NotFound() {
  const { errors } = useDictionary();
  const locale = useLocale();

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center"
      data-slot="not-found-page"
    >
      <title>{errors.notFound.title}</title>
      <h1 className="text-2xl font-semibold">{errors.notFound.title}</h1>
      <p className="text-sm text-muted-foreground">
        {errors.notFound.description}
      </p>
      <Link
        className="text-sm text-primary underline underline-offset-4"
        data-testid="not-found-home-link"
        href={localizePath("/", locale)}
      >
        {errors.notFound.homeLink}
      </Link>
    </main>
  );
}
