import { Skeleton } from "@/app/_components/atoms/skeleton";
import { cn } from "@/lib/utils";

export interface TextSkeletonProps {
  /** Width utility for the bar, e.g. `w-24`. */
  className?: string;
}

/**
 * Inline stand-in for text that has not arrived yet. Sized in `em`, so it
 * inherits the line box of the text it replaces and the row keeps its height
 * when the value lands; a block `Skeleton` imposes its own. A `<span>`, so it
 * is valid inside paragraphs, headings and labels.
 */
function TextSkeleton({ className }: TextSkeletonProps) {
  return (
    <Skeleton
      as="span"
      className={cn("inline-block h-[0.8em] w-24 align-middle", className)}
    />
  );
}

export { TextSkeleton };
