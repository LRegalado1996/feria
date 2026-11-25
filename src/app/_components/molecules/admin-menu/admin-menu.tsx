"use client";

import { Menu, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { createContext, type ReactNode, use, useEffect, useState } from "react";

import { Button } from "@/app/_components/atoms/button";
import { followedLink } from "@/lib/admin/followed-link";
import { useDictionary } from "@/lib/hooks/i18n";
import { cn } from "@/lib/utils";

/** From here up the sections are the sidebar, and the panel has no place. */
export const ADMIN_MENU_WIDE_QUERY = "(min-width: 48rem)";

/** Whether a menu button is inside the shell's menu, which it opens. */
const InsideMenu = createContext(false);

export interface AdminMenuProps {
  /** The page, whose top bar holds the button that opens the panel. */
  children: ReactNode;
  /** What the panel shows: the shell's sections, as its sidebar has them. */
  panel: ReactNode;
}

/**
 * The admin's sections on a phone (FER-040): a panel from the left edge,
 * opened by `AdminMenuButton` in the page's top bar. A modal dialog: it
 * traps focus, closes on Escape, on the dimmed area, on its close button and
 * on choosing a link (a section, the language), and gives focus back to the
 * button that opened it. It never shows from `md` up, where the sidebar has
 * the same sections, and closes if the window widens past it while open.
 */
function AdminMenu({ children, panel }: AdminMenuProps) {
  const { admin } = useDictionary();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const wide = window.matchMedia(ADMIN_MENU_WIDE_QUERY);
    const closeWhenWide = () => {
      if (wide.matches) {
        setOpen(false);
      }
    };
    wide.addEventListener("change", closeWhenWide);

    return () => {
      wide.removeEventListener("change", closeWhenWide);
    };
  }, [open]);

  return (
    <InsideMenu value>
      <DialogPrimitive.Root onOpenChange={setOpen} open={open}>
        {children}
        {/* It slides in and leaves at once. Choosing a section hides the
            page behind it straight away (Next keeps it mounted, hidden), and
            an exit animation that never ends there would keep the closed
            panel mounted: Radix removes it when its animation ends. */}
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0 md:hidden"
            data-slot="dialog-overlay"
            data-testid="dialog-overlay"
          />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-sidebar text-sidebar-foreground shadow-lg outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-left md:hidden"
            data-slot="dialog-content"
            data-testid="admin-menu"
            onClick={(event) => {
              // A section or the language was chosen: the page changes.
              // On the click's way up, after the link's own handler has
              // started the navigation in place (FER-064): closed on the way
              // down, the panel and its link are gone before that handler
              // runs, and the browser loads the whole document again. A
              // link opened in another tab leaves this page, and the panel,
              // as they are.
              if (followedLink(event)) {
                setOpen(false);
              }
            }}
          >
            <DialogPrimitive.Title className="sr-only">
              {admin.shell.menu}
            </DialogPrimitive.Title>
            {/* First in the panel, so it takes focus as the panel opens;
                drawn in the corner, outside the logo's clear space. */}
            <DialogPrimitive.Close asChild>
              <Button
                className="absolute top-3 right-3 z-10"
                size="icon"
                variant="ghost"
              >
                <X aria-hidden="true" />
                <span className="sr-only">{admin.shell.closeMenu}</span>
              </Button>
            </DialogPrimitive.Close>
            {panel}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </InsideMenu>
  );
}

export interface AdminMenuButtonProps {
  className?: string;
}

/**
 * Opens the shell's menu panel. It renders nothing outside `AdminMenu`
 * (a screen rendered on its own, as its tests do), where there is no panel
 * to open.
 */
function AdminMenuButton({ className }: AdminMenuButtonProps) {
  return use(InsideMenu) ? <AdminMenuTrigger className={className} /> : null;
}

function AdminMenuTrigger({ className }: AdminMenuButtonProps) {
  const { admin } = useDictionary();

  return (
    <DialogPrimitive.Trigger asChild>
      <Button
        className={cn("shrink-0", className)}
        data-slot="admin-menu-button"
        data-testid="admin-menu-button"
        size="icon"
        variant="ghost"
      >
        <Menu aria-hidden="true" className="size-6" />
        <span className="sr-only">{admin.shell.menu}</span>
      </Button>
    </DialogPrimitive.Trigger>
  );
}

export { AdminMenu, AdminMenuButton };
