"use client";

import { type ComponentProps, type ReactNode, useId, useRef } from "react";

import { useDictionary } from "@/lib/hooks/i18n";
import { cn } from "@/lib/utils";

export type AdminFrameProps = ComponentProps<"div"> & {
  /** The screen, the frame's main landmark. */
  children: ReactNode;
  /** The sections, in the sidebar the frame shows from `md` up. */
  sidebar: ReactNode;
};

/**
 * The admin's layout around a screen (FER-040, FER-064): the skip link, the
 * sidebar from `md` up, and the screen as the main landmark the skip link
 * lands on. Every admin page renders its own frame, and Next keeps the
 * screens left behind mounted and hidden (Cache Components), so the landmark
 * takes an id of its own (`useId`) instead of a fixed one: no two elements
 * in the document share it, and each skip link reaches its own screen. A
 * client component only for that id; the content stays the server's.
 */
function AdminFrame({
  children,
  className,
  sidebar,
  ...props
}: AdminFrameProps) {
  const { admin } = useDictionary();
  const mainId = useId();
  const main = useRef<HTMLElement>(null);

  return (
    <div
      className={cn(
        "min-h-dvh bg-sidebar text-sidebar-foreground md:grid md:grid-cols-[16rem_minmax(0,1fr)]",
        className
      )}
      data-slot="admin-frame"
      {...props}
    >
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2"
        href={`#${mainId}`}
        // Once React owns it, it moves focus itself: the address keeps no
        // `#` of an id the next render does not give again, and Back has
        // no jump to undo. Before then, the browser's own jump does it.
        onClick={(event) => {
          if (main.current) {
            event.preventDefault();
            main.current.focus();
          }
        }}
      >
        {admin.shell.skipToContent}
      </a>
      <header className="sticky top-0 hidden h-dvh border-r border-sidebar-border md:block">
        {sidebar}
      </header>
      <main className="min-w-0" id={mainId} ref={main} tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}

export { AdminFrame };
