"use client";

import { Menu, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { type ReactNode, useState } from "react";

import { cn } from "@/lib/utils";

export interface StoreMobileMenuProps {
  /** The menu's content, rendered by the server: links, search, toggle. */
  children: ReactNode;
  className?: string;
  closeLabel: string;
  label: string;
}

/**
 * The header's menu on a phone: a full-screen panel in the store's colors.
 * It renders in place, not in a portal, so it stays inside the element that
 * carries the store's palette. Following a link inside closes it.
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
      <DialogPrimitive.Trigger
        className={cn(
          "inline-flex size-11 items-center justify-center text-store-foreground hover:bg-store-surface focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground",
          className
        )}
        data-slot="store-mobile-menu-trigger"
      >
        <Menu aria-hidden="true" className="size-6" />
        <span className="sr-only">{label}</span>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Overlay
        className="fixed inset-0 z-50 bg-store-background"
        data-slot="dialog-overlay"
        data-testid="dialog-overlay"
      />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className="fixed inset-0 z-50 flex flex-col gap-8 overflow-y-auto bg-store-background p-4 text-store-foreground outline-none"
        data-slot="dialog-content"
        data-testid="store-mobile-menu"
        onClickCapture={(event) => {
          if (event.target instanceof Element && event.target.closest("a")) {
            setOpen(false);
          }
        }}
      >
        <div className="flex items-center justify-between">
          <DialogPrimitive.Title className="font-display text-2xl leading-none tracking-display uppercase">
            {label}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close className="inline-flex size-11 items-center justify-center hover:bg-store-surface focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground">
            <X aria-hidden="true" className="size-6" />
            <span className="sr-only">{closeLabel}</span>
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Root>
  );
}

export { StoreMobileMenu };
