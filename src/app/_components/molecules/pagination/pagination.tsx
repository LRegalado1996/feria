"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/app/_components/atoms/button";
import { useDictionary } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import { cn } from "@/lib/utils";
import { paginationItems } from "@/lib/utils/pagination";

export interface PaginationProps {
  className?: string;
  /** The address of a page of the list, built by the caller. */
  hrefFor: (page: number) => string;
  /** The page shown, which may lie past the last one (an old link). */
  page: number;
  pageCount: number;
}

const STEP_CLASS = buttonVariants({ size: "icon-sm", variant: "outline" });

/**
 * "Anterior" or "Siguiente": a link, or past the list's end a dimmed icon
 * the ear skips (the current page already says where the list is).
 */
function Step({
  direction,
  href,
}: {
  direction: "next" | "previous";
  href: string | null;
}) {
  const copy = useDictionary().common.pagination;
  const Icon = direction === "next" ? ChevronRight : ChevronLeft;

  if (href === null) {
    return (
      <span
        aria-hidden="true"
        className={cn(STEP_CLASS, "opacity-50")}
        data-testid={`pagination-${direction}`}
      >
        <Icon />
      </span>
    );
  }

  return (
    <Link
      className={STEP_CLASS}
      data-testid={`pagination-${direction}`}
      href={href}
      rel={direction === "next" ? "next" : "prev"}
    >
      <Icon aria-hidden="true" />
      <span className="sr-only">
        {direction === "next" ? copy.nextPage : copy.previousPage}
      </span>
    </Link>
  );
}

/**
 * A list's numbered pages (FER-019), in Vercel's quiet style: outlined icon
 * steps either side, the page numbers between them, the current one filled
 * (`aria-current="page"`), a gap where pages are left out
 * (`paginationItems`). Every page is a link, so the list's address names its
 * page and back and forward walk through them. On a phone the numbers give
 * way to "Página 2 de 6" between the steps. A step past either end is
 * dimmed; past the last page (an old link) the steps still lead back.
 */
function Pagination({ className, hrefFor, page, pageCount }: PaginationProps) {
  const copy = useDictionary().common.pagination;

  if (pageCount <= 1 && page <= 1) {
    return null;
  }

  const last = Math.max(pageCount, 1);

  return (
    <nav
      aria-label={copy.label}
      className={cn("flex", className)}
      data-slot="pagination"
      data-testid="pagination"
    >
      <ul className="flex items-center gap-1">
        <li>
          <Step
            direction="previous"
            href={page > 1 ? hrefFor(Math.min(page - 1, last)) : null}
          />
        </li>
        {paginationItems(page, pageCount).map((item) =>
          item.kind === "gap" ? (
            <li
              className="hidden size-8 items-center justify-center text-sm text-muted-foreground sm:flex"
              key={`gap-${item.side}`}
            >
              <span aria-hidden="true">…</span>
              <span className="sr-only">{copy.ellipsis}</span>
            </li>
          ) : (
            <li className="hidden sm:block" key={item.page}>
              <Link
                aria-current={item.page === page ? "page" : undefined}
                aria-label={interpolate(copy.page, { page: item.page })}
                className={cn(
                  buttonVariants({
                    size: "icon-sm",
                    variant: item.page === page ? "default" : "ghost",
                  }),
                  "min-w-8 px-2 tabular-nums md:w-auto"
                )}
                href={hrefFor(item.page)}
              >
                {item.page}
              </Link>
            </li>
          )
        )}
        <li
          className="px-2 text-sm text-muted-foreground tabular-nums sm:hidden"
          data-testid="pagination-position"
        >
          {interpolate(copy.pageOf, { count: last, page })}
        </li>
        <li>
          <Step
            direction="next"
            href={page < pageCount ? hrefFor(page + 1) : null}
          />
        </li>
      </ul>
    </nav>
  );
}

export { Pagination };
