import type { ReactNode } from "react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/app/_components/atoms/avatar";
import { Skeleton } from "@/app/_components/atoms/skeleton";
import { TextSkeleton } from "@/app/_components/atoms/text-skeleton";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils/format";
import { getInitial } from "@/lib/utils/get-initial";

export interface PostCardProps {
  /** The row menu, for a post the viewer may act on. */
  actions?: ReactNode;
  author: { name: string; image: string | null };
  className?: string;
  content: string;
  /** The clock the age is read against (`useNow`), never `Date.now()`. */
  now: number;
  timestamp: Date;
}

function PostCard({
  actions,
  author,
  content,
  now,
  timestamp,
  className,
}: PostCardProps) {
  return (
    <article
      className={cn(
        "flex gap-3 border-b p-4 transition-colors hover:bg-accent/50",
        className
      )}
      data-slot="post-card"
      data-testid="post-card"
    >
      <Avatar>
        {author.image ? (
          <AvatarImage alt={author.name} src={author.image} />
        ) : null}
        <AvatarFallback>{getInitial(author.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold">{author.name}</span>
          <time
            className="shrink-0 text-xs text-muted-foreground"
            dateTime={timestamp.toISOString()}
          >
            {formatRelativeTime(timestamp, now)}
          </time>
        </div>
        <p className="mt-1 text-sm wrap-anywhere">{content}</p>
      </div>
      {actions}
    </article>
  );
}

function PostCardSkeleton() {
  return (
    <div
      className="flex gap-3 border-b p-4"
      data-slot="post-card-skeleton"
      data-testid="post-card-skeleton"
    >
      {/* Avatar: size-10 = 40px, rounded-full, shrink-0 — matches <Avatar> default */}
      <Skeleton className="size-10 shrink-0 rounded-full" />
      {/* Content wrapper: matches PostCard's min-w-0 flex-1 */}
      <div className="min-w-0 flex-1">
        {/* Header row: the card's own text sizes, so the em-sized bars sit
            in the same line boxes as the name and time they stand for. */}
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold">
            <TextSkeleton className="w-24" />
          </span>
          <span className="text-xs">
            <TextSkeleton className="w-12" />
          </span>
        </div>
        {/* Content line 1: mt-1 matches <p className="mt-1 text-sm"> */}
        <Skeleton className="mt-1 h-3.5 w-full" />
        {/* Content line 2: shorter for visual variation */}
        <Skeleton className="mt-1.5 h-3.5 w-3/4" />
      </div>
    </div>
  );
}

export { PostCard, PostCardSkeleton };
