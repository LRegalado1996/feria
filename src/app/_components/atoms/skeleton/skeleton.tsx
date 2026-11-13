import type * as React from "react";

import { cn } from "@/lib/utils";

export type SkeletonProps = React.HTMLAttributes<HTMLElement> & {
  /**
   * `span` where only phrasing content is valid (inside a `<p>`, a heading or
   * a label): a `<div>` there is invalid HTML, so the browser closes the
   * parent early, which shifts the layout and breaks hydration.
   */
  as?: "div" | "span";
};

function Skeleton({ as: Tag = "div", className, ...props }: SkeletonProps) {
  return (
    <Tag
      className={cn("animate-pulse rounded-md bg-accent", className)}
      data-slot="skeleton"
      {...props}
    />
  );
}

export { Skeleton };
