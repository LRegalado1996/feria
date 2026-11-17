"use client";

import { ArrowRight, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { type Ref, useId, useRef, useState } from "react";

import { StoreButton } from "@/app/_components/atoms/store-button";
import type { Dictionary } from "@/content";
import { catalogHref, EMPTY_CATALOG_QUERY } from "@/lib/catalog/query";
import { useHydrated } from "@/lib/hooks/ui/use-hydrated";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { SEARCH_MAX_LENGTH } from "@/lib/schemas/catalog";
import { cn } from "@/lib/utils";

type ShellCopy = Dictionary["storefront"]["shell"];

export interface StoreSearchPanelProps {
  /** Placed on the button that opens the panel. */
  className?: string;
  copy: ShellCopy;
  locale: Locale;
}

/** The moss panel's own box: the dialog's and the plain one's. */
const PANEL_CLASS =
  "border-t border-store-background/15 bg-store-contrast px-4 pt-14 pb-9 text-store-background outline-none md:px-7 md:pt-12 md:pb-15";

/** The close button, top right in either panel. */
const CLOSE_CLASS = "absolute top-2 right-2 md:right-5";

interface SearchFormProps {
  copy: ShellCopy;
  /** The field's id, unique on the page: the label points at it. */
  fieldId: string;
  fieldRef?: Ref<HTMLInputElement>;
  locale: Locale;
  /** With the script: what a submit does instead of loading the catalog. */
  onSearch?: (form: HTMLFormElement) => void;
  testId: string;
}

/**
 * One large underlined field and an arrow: a plain GET form that opens the
 * catalog with `?q=`, which `onSearch` takes over once React owns the page.
 */
function SearchForm({
  copy,
  fieldId,
  fieldRef,
  locale,
  onSearch,
  testId,
}: SearchFormProps) {
  return (
    <search className="mx-auto block max-w-275">
      <form
        action={localizePath("/products", locale)}
        // Its underline is the field's focus mark: it turns the accent.
        className="flex items-end gap-3 border-b-2 border-store-background focus-within:border-store-accent"
        data-testid={testId}
        method="get"
        onSubmit={
          onSearch
            ? (event) => {
                event.preventDefault();
                onSearch(event.currentTarget);
              }
            : undefined
        }
      >
        <label className="sr-only" htmlFor={fieldId}>
          {copy.searchField}
        </label>
        <input
          autoComplete="off"
          className={cn(
            "min-w-0 flex-1 rounded-none bg-transparent pt-2.5 pb-3 font-display store-display-search leading-tight font-extrabold text-store-background uppercase outline-none placeholder:text-store-contrast-muted",
            // The search box's own clear button would sit on the dark.
            "[&::-webkit-search-cancel-button]:appearance-none"
          )}
          enterKeyHint="search"
          id={fieldId}
          maxLength={SEARCH_MAX_LENGTH}
          name="q"
          placeholder={copy.searchPlaceholder}
          ref={fieldRef}
          type="search"
        />
        <StoreButton
          aria-label={copy.searchSubmit}
          className="mb-1.5"
          size="icon-lg"
          type="submit"
          variant="contrast"
        >
          <ArrowRight aria-hidden="true" />
        </StoreButton>
      </form>
    </search>
  );
}

/**
 * The header's search (FER-039): its icon opens a dark panel right under the
 * header, over a scrim, with one large underlined field and an arrow. It is a
 * modal dialog: focus starts in the field and stays in the panel, Escape, a
 * tap outside or the close button closes it, and focus returns to the icon;
 * a search opens the catalog without a reload. Rendered in place, inside the
 * header, so it sits under it wherever the sticky header is.
 *
 * Before the script runs, the icon opens the browser's own popover instead
 * (`popovertarget`, which needs no script to open or close): the same field
 * as a plain form at the top of the screen, so the search works from the
 * first paint. Once React owns the page the icon opens the dialog; the plain
 * panel stays only for a visitor who opened it before then.
 */
function StoreSearchPanel({ className, copy, locale }: StoreSearchPanelProps) {
  const [open, setOpen] = useState(false);
  const hydrated = useHydrated();
  const router = useRouter();
  const field = useRef<HTMLInputElement>(null);
  const plain = useRef<HTMLDivElement>(null);
  const id = useId();
  const plainId = useId();

  /** Opens the catalog with what was typed: the whole catalog for nothing. */
  const search = (form: HTMLFormElement) => {
    const typed = new FormData(form).get("q");
    const q = typeof typed === "string" ? typed.trim() : "";
    router.push(
      catalogHref(locale, { ...EMPTY_CATALOG_QUERY, q: q === "" ? null : q })
    );
    setOpen(false);
  };

  const openChange = (next: boolean) => {
    // A plain panel opened before React took over (by the keyboard, which
    // leaves focus on the icon) gives way to the dialog; hiding a closed
    // one does nothing.
    if (next && plain.current && "hidePopover" in plain.current) {
      plain.current.hidePopover();
    }
    setOpen(next);
  };

  return (
    <>
      <DialogPrimitive.Root onOpenChange={openChange} open={open}>
        <DialogPrimitive.Trigger asChild>
          <StoreButton
            aria-label={copy.search}
            className={className}
            data-testid="store-search-button"
            popoverTarget={hydrated ? undefined : plainId}
            size="icon"
            variant="contrast"
          >
            <Search aria-hidden="true" />
          </StoreButton>
        </DialogPrimitive.Trigger>
        <DialogPrimitive.Overlay
          // From the header's bottom edge down: the header stays as it is.
          className="absolute inset-x-0 top-full h-dvh bg-store-foreground/50"
          data-slot="dialog-overlay"
          data-testid="dialog-overlay"
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn("absolute inset-x-0 top-full", PANEL_CLASS)}
          data-slot="dialog-content"
          data-testid="store-search-panel"
          onOpenAutoFocus={(event) => {
            // The field, not the close button that comes first in the panel.
            event.preventDefault();
            field.current?.focus();
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            {copy.search}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close asChild>
            <StoreButton
              aria-label={copy.searchClose}
              className={CLOSE_CLASS}
              size="icon"
              variant="contrast"
            >
              <X aria-hidden="true" />
            </StoreButton>
          </DialogPrimitive.Close>
          <SearchForm
            copy={copy}
            fieldId={id}
            fieldRef={field}
            locale={locale}
            onSearch={search}
            testId="store-search-form"
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Root>
      {/* In the browser's top layer, so it is placed against the screen, not
          the header. Shown only while open (`open:` matches
          `:popover-open`), so a browser without popovers never shows it. */}
      <div
        className={cn(
          "inset-x-0 top-0 bottom-auto m-0 hidden h-auto w-full max-w-none backdrop:bg-store-foreground/50 open:block",
          PANEL_CLASS
        )}
        data-slot="store-search-plain"
        data-testid="store-search-plain"
        id={plainId}
        popover="auto"
        ref={plain}
      >
        <StoreButton
          aria-label={copy.searchClose}
          className={CLOSE_CLASS}
          popoverTarget={plainId}
          popoverTargetAction="hide"
          size="icon"
          variant="contrast"
        >
          <X aria-hidden="true" />
        </StoreButton>
        <SearchForm
          copy={copy}
          fieldId={`${plainId}-field`}
          locale={locale}
          testId="store-search-plain-form"
        />
      </div>
    </>
  );
}

export { StoreSearchPanel };
