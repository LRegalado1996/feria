import type * as React from "react";

import { cn } from "@/lib/utils";

export type TextareaProps = React.ComponentProps<"textarea">;

// With `field-sizing-content`, the textarea's min-content width is its longest
// unbroken token, and a grid or flex ancestor (a dialog body) cannot shrink
// below it: one long URL widened the whole dialog. `wrap-anywhere` counts the
// break opportunities in min-content sizing; `min-w-0` lets the box shrink.
function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "flex field-sizing-content min-h-16 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base wrap-anywhere shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
        className
      )}
      data-slot="textarea"
      {...props}
    />
  );
}

export { Textarea };
