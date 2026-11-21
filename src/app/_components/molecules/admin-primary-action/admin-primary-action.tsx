"use client";

import type { ReactNode } from "react";

import { useAboveKeyboard } from "@/lib/hooks/ui";

export interface AdminPrimaryActionProps {
  children: ReactNode;
}

/**
 * A screen's main action (`molecules/admin-page`'s `primaryAction`): in a bar
 * fixed along the bottom of a phone's screen, under the thumb, and at the end
 * of the top bar from `md` up. On a phone the bar rides above the on-screen
 * keyboard, Safari's on iOS included, and the focused field is kept clear of
 * it (FER-053, `useAboveKeyboard`); at rest it carries no transform.
 */
function AdminPrimaryAction({ children }: AdminPrimaryActionProps) {
  const ref = useAboveKeyboard<HTMLDivElement>();

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-20 border-t border-sidebar-border bg-sidebar px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] max-md:data-[keyboard=open]:-translate-y-(--keyboard-inset) max-md:data-[keyboard=open]:pb-3 md:static md:z-auto md:ml-auto md:border-0 md:bg-transparent md:p-0"
      data-slot="admin-primary-action"
      data-testid="admin-primary-action"
      ref={ref}
    >
      {children}
    </div>
  );
}

export { AdminPrimaryAction };
