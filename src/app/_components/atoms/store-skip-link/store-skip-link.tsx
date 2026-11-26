"use client";

import { Slot } from "radix-ui";
import {
  type ComponentProps,
  createContext,
  type MouseEvent,
  type ReactNode,
  use,
  useId,
} from "react";

import { cn } from "@/lib/utils";

/** The id of the content the scope's skip link leads to. */
const SkipTarget = createContext<string | null>(null);

/** The scope's id, read with `use(SkipTarget)`: none outside a scope. */
function scopeTarget(id: string | null, component: string): string {
  if (id === null) {
    throw new Error(`${component} renders inside a StoreSkipScope`);
  }

  return id;
}

export interface StoreSkipScopeProps {
  /** The page: its skip link and the content it leads to. */
  children: ReactNode;
}

/**
 * Gives one page's skip link and its content an id of their own (FER-064).
 * Every store page renders its own frame, and a page left behind stays in
 * the document, hidden (Cache Components): a fixed id would be on each of
 * them, which HTML forbids, and the browser would jump to the first. A
 * client component only for that id (`useId`); the page stays the
 * server's.
 */
function StoreSkipScope({ children }: StoreSkipScopeProps) {
  const id = useId();

  return <SkipTarget value={id}>{children}</SkipTarget>;
}

export type StoreSkipLinkProps = Omit<ComponentProps<"a">, "href">;

/**
 * The first stop of every store page: a link past the header to its
 * scope's content, shown only while it has focus. Once React owns it, it
 * moves focus there itself, so the address keeps no `#` a visitor would
 * share; before that, the browser's own jump does the same.
 */
function StoreSkipLink({
  children,
  className,
  onClick,
  ...props
}: StoreSkipLinkProps) {
  const target = scopeTarget(use(SkipTarget), "StoreSkipLink");

  const skip = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    const content = document.querySelector<HTMLElement>(
      `#${CSS.escape(target)}`
    );

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

export type StoreSkipTargetProps = ComponentProps<"div"> & {
  /** Gives the id to its one child instead (the gallery's `<main>`). */
  asChild?: boolean;
};

/**
 * The content its scope's skip link leads to: focusable by the link, never
 * a stop of the Tab order.
 */
function StoreSkipTarget({ asChild = false, ...props }: StoreSkipTargetProps) {
  const id = scopeTarget(use(SkipTarget), "StoreSkipTarget");
  const Comp = asChild ? Slot.Root : "div";

  return (
    <Comp data-slot="store-skip-target" {...props} id={id} tabIndex={-1} />
  );
}

export { StoreSkipLink, StoreSkipScope, StoreSkipTarget };
