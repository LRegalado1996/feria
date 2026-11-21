"use client";

import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type * as React from "react";

import { Button } from "@/app/_components/atoms/button";
import { cn } from "@/lib/utils";

function Sheet(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(
  props: React.ComponentProps<typeof DialogPrimitive.Trigger>
) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

/**
 * A modal panel along the window's right edge (FER-019), the admin's side
 * sheet: the whole screen on a phone, 28rem from `sm` up, the height of the
 * window (`dvh`, so a phone's toolbars never cover its foot). A Radix
 * dialog: focus moves in and stays in, the page behind does not scroll,
 * Escape and the dimmed area close it, and focus goes back to what opened
 * it. It slides in and out in 200 ms; its overlay and content carry the
 * `data-slot`s globals.css stills under reduced motion, so it then appears
 * and leaves at once. Lay it out with `SheetHeader`, `SheetBody` (which
 * scrolls on its own) and `SheetFooter`.
 */
function SheetContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className="fixed inset-0 z-50 bg-black/50 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
        data-slot="dialog-overlay"
        data-testid="dialog-overlay"
      />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex h-dvh w-full flex-col bg-background text-foreground shadow-lg duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right sm:max-w-md sm:border-l",
          className
        )}
        data-slot="dialog-content"
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/**
 * The sheet's top: its title (and a line under it) beside the close button,
 * named by `closeLabel`, over a hairline.
 */
function SheetHeader({
  children,
  className,
  closeLabel,
  ...props
}: React.ComponentProps<"div"> & { closeLabel: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 border-b py-3 pr-2 pl-4 md:pl-5",
        className
      )}
      data-slot="sheet-header"
      {...props}
    >
      <div className="grid min-w-0 flex-1 gap-1 py-1.5">{children}</div>
      <DialogPrimitive.Close asChild>
        <Button size="icon-sm" type="button" variant="ghost">
          <XIcon aria-hidden="true" />
          <span className="sr-only">{closeLabel}</span>
        </Button>
      </DialogPrimitive.Close>
    </div>
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-base font-semibold", className)}
      data-slot="sheet-title"
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-xs text-muted-foreground", className)}
      data-slot="sheet-description"
      {...props}
    />
  );
}

/** What the sheet holds, scrolling on its own between the top and foot. */
function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-5",
        className
      )}
      data-slot="sheet-body"
      {...props}
    />
  );
}

/** The sheet's actions, over a hairline, clear of a phone's home bar. */
function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "border-t px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-5",
        className
      )}
      data-slot="sheet-footer"
      {...props}
    />
  );
}

export {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
};
