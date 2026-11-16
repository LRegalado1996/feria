"use client";

import { Languages } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { Button } from "@/app/_components/atoms/button";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";

// With two languages, "the other one" is the only place a toggle can lead.
const OTHER_LOCALE = { es: "en", en: "es" } as const satisfies Record<
  Locale,
  Locale
>;

export interface LocaleToggleProps {
  className?: string;
  /**
   * `bare` is a plain link styled only by `className`, for a surface that
   * brings its own tokens (the storefront's `store-locale-toggle`).
   */
  tone?: "app" | "bare";
}

/**
 * A link to the page the visitor is on, in the other language: it swaps the
 * URL's locale prefix and keeps the path and the query string, so a filtered
 * catalog stays filtered.
 *
 * The query string is only known in the browser: a prerendered shell is the
 * same for every query. So the server renders the link without it, and the
 * boundary swaps in the full one once React reads the URL. Until then the
 * link still leads to the same page in the other language.
 */
function LocaleToggle({ className, tone = "app" }: LocaleToggleProps) {
  return (
    <Suspense
      fallback={<LocaleLink className={className} search="" tone={tone} />}
    >
      <LocaleLinkWithSearch className={className} tone={tone} />
    </Suspense>
  );
}

function LocaleLinkWithSearch({ className, tone }: LocaleToggleProps) {
  const search = useSearchParams().toString();

  return <LocaleLink className={className} search={search} tone={tone} />;
}

function LocaleLink({
  className,
  search,
  tone,
}: LocaleToggleProps & { search: string }) {
  const copy = useDictionary().locale;
  const target = OTHER_LOCALE[useLocale()];
  // The server may see the rewritten path (`/es/...`) where the browser sees
  // the bare one; `localizePath` drops either prefix, so both renders agree.
  const pathname = localizePath(usePathname(), target);

  const link = (
    <Link
      className={tone === "bare" ? className : undefined}
      data-slot="locale-toggle"
      data-testid="locale-toggle"
      href={search ? `${pathname}?${search}` : pathname}
      hrefLang={target}
      // The label is written in the language it leads to, so a screen
      // reader pronounces it in that language.
      lang={target}
    >
      {tone === "bare" ? null : (
        // Decoration, so it gives way first: a phone-width navbar has room
        // for the language's name or the icon, not both.
        <Languages aria-hidden="true" className="hidden size-4 sm:block" />
      )}
      {copy.switchTo}
    </Link>
  );

  if (tone === "bare") {
    return link;
  }

  return (
    <Button asChild className={className} size="sm" variant="ghost">
      {link}
    </Button>
  );
}

export { LocaleToggle };
