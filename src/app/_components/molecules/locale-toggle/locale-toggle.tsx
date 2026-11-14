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
function LocaleToggle({ className }: LocaleToggleProps) {
  return (
    <Suspense fallback={<LocaleLink className={className} search="" />}>
      <LocaleLinkWithSearch className={className} />
    </Suspense>
  );
}

function LocaleLinkWithSearch({ className }: LocaleToggleProps) {
  const search = useSearchParams().toString();

  return <LocaleLink className={className} search={search} />;
}

function LocaleLink({
  className,
  search,
}: LocaleToggleProps & { search: string }) {
  const copy = useDictionary().locale;
  const target = OTHER_LOCALE[useLocale()];
  // The server may see the rewritten path (`/es/...`) where the browser sees
  // the bare one; `localizePath` drops either prefix, so both renders agree.
  const pathname = localizePath(usePathname(), target);

  return (
    <Button asChild className={className} size="sm" variant="ghost">
      <Link
        data-slot="locale-toggle"
        data-testid="locale-toggle"
        href={search ? `${pathname}?${search}` : pathname}
        hrefLang={target}
        // The label is written in the language it leads to, so a screen
        // reader pronounces it in that language.
        lang={target}
      >
        {/* Decoration, so it gives way first: a phone-width navbar has room
            for the language's name or the icon, not both. */}
        <Languages aria-hidden="true" className="hidden size-4 sm:block" />
        {copy.switchTo}
      </Link>
    </Button>
  );
}

export { LocaleToggle };
