"use client";

import { Label as LabelPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export type LabelProps = ComponentProps<typeof LabelPrimitive.Root> & {
  /**
   * Marks a required field with an asterisk, hidden from assistive tech; the
   * schema stays the source of truth for what is required.
   */
  required?: boolean;
};

function Label({ children, className, required, ...props }: LabelProps) {
  return (
    <LabelPrimitive.Root
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      data-slot="label"
      {...props}
    >
      {children}
      {required ? (
        <span
          aria-hidden="true"
          className="text-destructive"
          data-slot="label-required"
        >
          *
        </span>
      ) : null}
    </LabelPrimitive.Root>
  );
}

export { Label };
