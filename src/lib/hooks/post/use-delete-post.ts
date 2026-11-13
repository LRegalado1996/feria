import {
  type InfiniteData,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { type client, orpc } from "@/lib/orpc/client";

// One page of the feed, as `post.getAll` returns it.
type PostPage = Awaited<ReturnType<typeof client.post.getAll>>;

/**
 * Deletes one of the user's posts. The post leaves the feed at once and comes
 * back if the server refuses; the feed is refetched either way.
 */
export function useDeletePost({ queryKey }: { queryKey: readonly unknown[] }) {
  const queryClient = useQueryClient();

  const deletePost = useMutation({
    ...orpc.post.delete.mutationOptions(),
    // The feed reports a failed delete itself, next to its toast.
    meta: { suppressGlobalErrorReport: true },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey });

      const previousData = queryClient.getQueryData(queryKey);

      queryClient.setQueryData(
        queryKey,
        (old: InfiniteData<PostPage> | undefined) =>
          old && {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.filter((item) => item.id !== id),
            })),
          }
      );

      return { previousData };
    },
    onError: (_error, _input, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  // Resolves once the post is gone and rejects when it was not deleted, so
  // the caller says which happened.
  return {
    isPending: deletePost.isPending,
    mutateAsync: deletePost.mutateAsync,
  };
}
