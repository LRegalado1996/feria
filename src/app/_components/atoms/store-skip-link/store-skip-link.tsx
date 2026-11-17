"use client";

import type { ComponentProps, MouseEvent } from "react";

import { cn } from "@/lib/utils";

export type StoreSkipLinkProps = Omit<ComponentProps<"a">, "href"> & {
  /** The id of the content it skips to, inside the same frame. */
  target: string;
};

/**
 * The first stop of every store page: a link past the header to the page's
 * content, shown only while it has focus. Every page renders its own frame,
 * and a page left behind stays in the document, hidden (Cache Components),
 * with an element of the same id; so once React owns the link it moves focus
 * to the content of its own frame, not to the first match in the document.
 */
function StoreSkipLink({
  children,
  className,
  onClick,
  target,
  ...props
}: StoreSkipLinkProps) {
  const skip = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    const content = event.currentTarget
      .closest('[data-slot="store-frame"]')
      ?.querySelector<HTMLElement>(`#${target}`);

    if (content) {
      event.preventDefault();
      content.focus();
    }
  };

  return (
    <a
      className={cn(
        "sr-only rounded-full bg-store-accent px-5 py-3 font-display text-xs font-extrabold text-store-foreground uppercase focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-accent",
        className
      )}
      data-slot="store-skip-link"
      href={`#${target}`}
      onClick={skip}
      {...props}
    >
      {children}
    </a>
  );
}

export { StoreSkipLink };
