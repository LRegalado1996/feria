"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type MouseEvent,
  Suspense,
  useId,
  useLayoutEffect,
  useState,
} from "react";

import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { usePrefersReducedMotion } from "@/lib/hooks/ui";
import { LOCALES, type Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";

// With two languages, "the other one" is the only place a toggle can lead.
const OTHER_LOCALE = { es: "en", en: "es" } as const satisfies Record<
  Locale,
  Locale
>;

/**
 * How long the thumb takes to cross, in milliseconds: the page navigates
 * once it has. Matches the thumb's `duration-200`.
 */
const LOCALE_TOGGLE_SLIDE_MS = 200;

/** The pill's parts a surface can style. */
export interface LocaleToggleClassNames {
  /** Each language's code; `data-state="on"` is the one over the thumb. */
  code?: string;
  /** The filled mark under the current language. */
  thumb?: string;
  /** The capsule; the link is `group`, so its focus and hover reach here. */
  track?: string;
}

export interface LocaleToggleProps {
  className?: string;
  /** Classes for the pill's parts, after the tone's own. */
  classNames?: LocaleToggleClassNames;
  /**
   * `app` is the app's neutral tokens, light and dark (the admin). `bare`
   * draws only the pill's shape, for a surface that brings its own colors
   * through `className` and `classNames` (`store-locale-toggle`).
   */
  tone?: "app" | "bare";
}

type PillClasses = Record<keyof LocaleToggleClassNames | "root", string>;

// The pill itself, whatever the tone: a capsule of two equal halves, the thumb
// under one of them, sliding across unless the visitor asked for less motion.
const PILL_BASE = {
  code: "relative px-2.5 text-center leading-none transition-colors duration-200 motion-reduce:transition-none",
  root: "group inline-flex shrink-0 items-center outline-none",
  thumb:
    "absolute inset-y-0.5 right-1/2 left-0.5 rounded-full transition-transform duration-200 ease-out motion-reduce:transition-none data-[side=end]:translate-x-full",
  track: "relative grid h-8 grid-cols-2 items-center rounded-full p-0.5",
} as const satisfies PillClasses;

// The admin's look (FER-040): a hairline capsule on a card, the current
// language inverted like the orders' current tab; a 44 px target on a phone.
const APP_TONE = {
  code: "text-xs font-medium data-[state=off]:text-muted-foreground data-[state=on]:text-background data-[state=off]:group-hover:text-foreground",
  root: "h-11 md:h-9",
  thumb: "bg-foreground",
  track:
    "border bg-card group-focus-visible:border-ring group-focus-visible:ring-[3px] group-focus-visible:ring-ring/50",
} as const satisfies PillClasses;

/** A click the browser turns into a new tab, a new window or a download. */
function opensElsewhere(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.button !== 0 ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  );
}

/**
 * The language switch, a pill like a light and dark switch: both codes, a
 * thumb under the current one. It is a link to the page the visitor is on,
 * in the other language: it swaps the URL's locale prefix and keeps the
 * path and the query string, so a filtered catalog stays filtered. Pressed,
 * the thumb slides to the other side, then the page navigates.
 *
 * The query string is only known in the browser: a prerendered shell is the
 * same for every query. So the server renders the link without it, and the
 * boundary swaps in the full one once React reads the URL. Until then the
 * link still leads to the same page in the other language.
 */
function LocaleToggle(props: LocaleToggleProps) {
  return (
    <Suspense fallback={<LocaleLink {...props} search="" />}>
      <LocaleLinkWithSearch {...props} />
    </Suspense>
  );
}

function LocaleLinkWithSearch(props: LocaleToggleProps) {
  const search = useSearchParams().toString();

  return <LocaleLink {...props} search={search} />;
}

function LocaleLink({
  className,
  classNames,
  search,
  tone = "app",
}: LocaleToggleProps & { search: string }) {
  const copy = useDictionary().locale;
  const current = useLocale();
  const target = OTHER_LOCALE[current];
  // The server may see the rewritten path (`/es/...`) where the browser sees
  // the bare one; `localizePath` drops either prefix, so both renders agree.
  const pathname = localizePath(usePathname(), target);
  const href = search ? `${pathname}?${search}` : pathname;
  const router = useRouter();
  const reducedMotion = usePrefersReducedMotion();
  const descriptionId = useId();
  // The address the visitor chose while the thumb crosses. Keyed by the
  // address, not a flag: once the page has switched, this toggle leads
  // elsewhere and the thumb rests under the new current language again.
  const [leavingFor, setLeavingFor] = useState<string | null>(null);
  // Next hides the page it leaves instead of unmounting it, and shows it
  // again, state and all, on Back or on the switch back: the pending switch
  // is forgotten as the page hides, or the thumb would still rest under the
  // language it left for and every press would read as a second one.
  useLayoutEffect(
    () => () => {
      setLeavingFor(null);
    },
    []
  );
  const shown = leavingFor === href ? target : current;
  const look: Partial<PillClasses> = tone === "app" ? APP_TONE : {};

  return (
    <Link
      aria-describedby={descriptionId}
      className={cn(PILL_BASE.root, look.root, className)}
      data-slot="locale-toggle"
      data-testid="locale-toggle"
      data-tone={tone}
      href={href}
      hrefLang={target}
      // The name is written in the language it leads to, so a screen reader
      // pronounces it in that language.
      lang={target}
      onClick={(event) => {
        if (reducedMotion || opensElsewhere(event)) {
          // Left to the link: no slide to wait for, or a new tab or window
          // the browser opens, while this page stays as it is.
          return;
        }

        event.preventDefault();

        if (leavingFor === href) {
          // A second press while the thumb crosses changes nothing.
          return;
        }

        setLeavingFor(href);
        window.setTimeout(() => {
          router.push(href);
        }, LOCALE_TOGGLE_SLIDE_MS);
      }}
    >
      <span className="sr-only">{copy.switchTo}</span>
      {/* For the eye: the codes say what the name and the description say,
          which a screen reader reads instead. */}
      <span
        aria-hidden="true"
        className={cn(PILL_BASE.track, look.track, classNames?.track)}
        data-slot="locale-toggle-track"
      >
        <span
          className={cn(PILL_BASE.thumb, look.thumb, classNames?.thumb)}
          data-side={shown === LOCALES[0] ? "start" : "end"}
          data-slot="locale-toggle-thumb"
          data-testid="locale-toggle-thumb"
        />
        {LOCALES.map((code) => (
          <span
            className={cn(PILL_BASE.code, look.code, classNames?.code)}
            data-slot="locale-toggle-code"
            data-state={code === shown ? "on" : "off"}
            key={code}
          >
            {/* A language's code, written as codes are: ES, EN. */}
            {code.toUpperCase()}
          </span>
        ))}
      </span>
      {/* The current language, said in it, for a screen reader. */}
      <span hidden id={descriptionId} lang={current}>
        {copy.current}
      </span>
    </Link>
  );
}

export { LocaleToggle };
