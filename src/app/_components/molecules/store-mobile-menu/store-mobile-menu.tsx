"use client";

import { Menu, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { type ReactNode, useState } from "react";

import { StoreButton } from "@/app/_components/atoms/store-button";
import { isPlainClick } from "@/lib/cart/paths";

export interface StoreMobileMenuProps {
  /** The menu's content, rendered by the server: the links and the language. */
  children: ReactNode;
  /** Placed on the button that opens the menu. */
  className?: string;
  closeLabel: string;
  label: string;
}

/**
 * The header's menu where its links do not fit (FER-039): a moss panel that
 * covers a phone's screen, or slides in from the left on a tablet, over a
 * scrim. A modal dialog: focus stays inside, Escape or the close button
 * closes it, focus returns to the menu button, and following a link inside
 * closes it too. Escape within a group's open list of categories closes
 * that list first. Rendered in place, in the header.
 */
function StoreMobileMenu({
  children,
  className,
  closeLabel,
  label,
}: StoreMobileMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <DialogPrimitive.Root onOpenChange={setOpen} open={open}>
      <DialogPrimitive.Trigger asChild>
        <StoreButton
          aria-label={label}
          className={className}
          data-slot="store-mobile-menu-trigger"
          size="icon"
          variant="contrast"
        >
          <Menu aria-hidden="true" />
        </StoreButton>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Overlay
        className="fixed inset-0 z-50 bg-store-foreground/50"
        data-slot="dialog-overlay"
        data-testid="dialog-overlay"
      />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className="fixed inset-y-0 left-0 z-50 flex w-full flex-col overflow-y-auto bg-store-contrast text-store-background outline-none sm:max-w-sm"
        data-slot="dialog-content"
        data-testid="store-mobile-menu"
        // Escape inside a group whose categories are open closes that list
        // only (`StoreNavGroup` gives focus back to its button), not the menu.
        onEscapeKeyDown={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest(
              '[data-slot="store-nav-group"][data-state="open"]'
            )
          ) {
            event.preventDefault();
          }
        }}
        // On the click's way up, after the link's own handler has started
        // the navigation in place (FER-064): closed on the way down, the
        // panel and its link are gone before that handler runs, and the
        // browser loads the whole document again. A link opened in another
        // tab leaves this page, and the menu, as they are.
        onClick={(event) => {
          if (
            isPlainClick(event) &&
            event.target instanceof Element &&
            event.target.closest("a")
          ) {
            setOpen(false);
          }
        }}
      >
        <div className="flex min-h-15.5 items-center justify-between border-b border-store-background/15 py-2 pr-1.5 pl-4">
          <DialogPrimitive.Title className="font-display text-sm font-extrabold text-store-accent uppercase">
            {label}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close asChild>
            <StoreButton aria-label={closeLabel} size="icon" variant="contrast">
              <X aria-hidden="true" />
            </StoreButton>
          </DialogPrimitive.Close>
        </div>
        <div className="flex flex-1 flex-col gap-8 px-4 py-6">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Root>
  );
}

export { StoreMobileMenu };
