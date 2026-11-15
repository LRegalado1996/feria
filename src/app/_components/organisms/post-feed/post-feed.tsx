"use client";

import { MessageSquare } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/app/_components/atoms/button";
import { ComposeBox } from "@/app/_components/molecules/compose-box";
import { ConfirmDialog } from "@/app/_components/molecules/confirm-dialog";
import { EmptyState } from "@/app/_components/molecules/empty-state";
import {
  PostCard,
  PostCardSkeleton,
} from "@/app/_components/molecules/post-card";
import { RowActions } from "@/app/_components/molecules/row-actions";
import type { Dictionary } from "@/content";
import { reportError } from "@/lib/errors/client";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { useCreatePost, useDeletePost, useGetPosts } from "@/lib/hooks/post";
import { useNow } from "@/lib/hooks/ui";

export interface PostFeedProps {
  currentUser?: { id: string; name: string; image: string | null };
  /** The instant the server rendered the page at; see `useNow`. */
  renderedAt: number;
}

interface PendingDelete {
  id: number;
  trigger: HTMLButtonElement | null;
}

const EXCERPT_LENGTH = 40;

/** A post's identity in accessible names: its opening words. */
function excerpt(text: string) {
  return text.length > EXCERPT_LENGTH
    ? `${text.slice(0, EXCERPT_LENGTH).trimEnd()}…`
    : text;
}

/**
 * The compose box over the feed. The feed shows exactly one of four states:
 * loading, failed (with a retry), empty, or the posts; a failure is never
 * shown as an empty feed. The viewer's own posts carry a menu to delete them,
 * behind a confirmation.
 */
export function PostFeed({ currentUser, renderedAt }: PostFeedProps) {
  const { common, post: copy } = useDictionary();
  const locale = useLocale();
  const now = useNow(renderedAt);
  const { attachSentinel, ...feed } = useGetPosts();
  const createPost = useCreatePost({ queryKey: feed.queryKey, currentUser });
  const deletePost = useDeletePost({ queryKey: feed.queryKey });
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null
  );
  // The row menu the delete came from; read after the dialog has closed and
  // `pendingDelete` is already gone.
  const returnFocusTo = useRef<HTMLButtonElement | null>(null);

  const handleConfirmDelete = async (id: number) => {
    try {
      await deletePost.mutateAsync({ id });
      toast.success(copy.delete.success);
    } catch (error) {
      // The delete mutation leaves reporting to this catch (its meta), so a
      // failure is reported once.
      reportError(error, { action: "Post.delete" });
      toast.error(copy.delete.failed);
    }

    setPendingDelete(null);
  };

  return (
    <div data-slot="post-feed">
      {currentUser && (
        <ComposeBox
          currentUser={currentUser}
          onSubmit={async (values) => await createPost.mutateAsync(values)}
        />
      )}

      <div data-testid="post-list">
        <FeedBody
          attachSentinel={attachSentinel}
          copy={copy.feed}
          feed={feed}
          locale={locale}
          now={now}
          onDelete={(pending) => {
            returnFocusTo.current = pending.trigger;
            setPendingDelete(pending);
          }}
          retryLabel={common.tryAgain}
          viewerId={currentUser?.id}
        />
      </div>

      <ConfirmDialog
        description={copy.delete.description}
        isPending={deletePost.isPending}
        onCloseAutoFocus={(event) => {
          // Back to the menu the delete came from, while its post is there;
          // a deleted post's menu is gone, and focus falls to the page.
          if (returnFocusTo.current?.isConnected) {
            event.preventDefault();
            returnFocusTo.current.focus();
          }
        }}
        onConfirm={() => {
          if (pendingDelete) {
            void handleConfirmDelete(pendingDelete.id);
          }
        }}
        onOpenChange={(open) => {
          if (!(open || deletePost.isPending)) {
            setPendingDelete(null);
          }
        }}
        open={pendingDelete !== null}
        title={copy.delete.title}
      />
    </div>
  );
}

function FeedBody({
  attachSentinel,
  copy,
  feed,
  locale,
  now,
  onDelete,
  retryLabel,
  viewerId,
}: {
  attachSentinel: ReturnType<typeof useGetPosts>["attachSentinel"];
  copy: Dictionary["post"]["feed"];
  feed: Omit<ReturnType<typeof useGetPosts>, "attachSentinel">;
  locale: ReturnType<typeof useLocale>;
  now: number;
  onDelete: (pending: PendingDelete) => void;
  retryLabel: string;
  viewerId: string | undefined;
}) {
  if (feed.isPending) {
    return (
      <div aria-busy="true" data-testid="feed-skeleton">
        <output className="sr-only">{copy.loading}</output>
        <PostCardSkeleton />
        <PostCardSkeleton />
        <PostCardSkeleton />
      </div>
    );
  }

  if (feed.isError || !feed.posts) {
    return (
      <FeedError
        message={copy.loadFailed}
        onRetry={() => {
          feed.refetch();
        }}
        retryLabel={retryLabel}
        testId="feed-error"
      />
    );
  }

  if (feed.posts.length === 0) {
    return <EmptyState icon={MessageSquare} message={copy.empty} />;
  }

  return (
    <>
      {feed.posts.map((post) => (
        <PostCard
          actions={
            // The viewer's own posts, once saved: an optimistic one has a
            // negative placeholder id the server has never seen.
            viewerId !== undefined &&
            post.createdById === viewerId &&
            post.id > 0 ? (
              <RowActions
                onDelete={(trigger) => {
                  onDelete({ id: post.id, trigger });
                }}
                rowLabel={excerpt(post.name)}
                testId={`post-actions-${post.id}`}
              />
            ) : undefined
          }
          author={{ name: post.createdBy.name, image: post.createdBy.image }}
          content={post.name}
          key={post.id}
          locale={locale}
          now={now}
          timestamp={new Date(post.createdAt)}
        />
      ))}
      {feed.isFetchingNextPage && (
        <div aria-busy="true" data-testid="loading-more">
          <PostCardSkeleton />
          <PostCardSkeleton />
        </div>
      )}
      {feed.isFetchNextPageError && (
        <FeedError
          message={copy.loadMoreFailed}
          onRetry={() => {
            feed.fetchNextPage();
          }}
          retryLabel={retryLabel}
          testId="feed-more-error"
        />
      )}
      <div
        className="h-px"
        data-testid="scroll-sentinel"
        ref={attachSentinel}
      />
    </>
  );
}

function FeedError({
  message,
  onRetry,
  retryLabel,
  testId,
}: {
  message: string;
  onRetry: () => void;
  retryLabel: string;
  testId: string;
}) {
  return (
    <div
      className="flex flex-col items-center gap-3 py-12 text-center"
      data-testid={testId}
      role="alert"
    >
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button onClick={onRetry} size="sm" variant="outline">
        {retryLabel}
      </Button>
    </div>
  );
}
