import {
  type InfiniteData,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { type client, orpc } from "@/lib/orpc/client";

// One page of the feed, as `post.getAll` returns it.
type PostPage = Awaited<ReturnType<typeof client.post.getAll>>;

interface UseCreatePostOptions {
  currentUser?: { name: string; image: string | null };
  queryKey: readonly unknown[];
}

export function useCreatePost({ queryKey, currentUser }: UseCreatePostOptions) {
  const queryClient = useQueryClient();

  const createPost = useMutation({
    ...orpc.post.create.mutationOptions(),
    // The compose box reports a failed post itself, next to its toast.
    meta: { suppressGlobalErrorReport: true },
    onMutate: async (newPost) => {
      await queryClient.cancelQueries({ queryKey });

      const previousData = queryClient.getQueryData(queryKey);

      queryClient.setQueryData(
        queryKey,
        (old: InfiniteData<PostPage> | undefined) => {
          if (!old) {
            return old;
          }

          const optimisticPost = {
            // Negative, so it can never collide with a real identity id.
            id: -Date.now(),
            name: newPost.name,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdById: "optimistic",
            createdBy: {
              id: "optimistic",
              name: currentUser?.name ?? "User",
              image: currentUser?.image ?? "",
            },
          };

          const firstPage = old.pages[0];
          if (!firstPage) {
            return old;
          }

          return {
            ...old,
            pages: [
              {
                ...firstPage,
                items: [optimisticPost, ...firstPage.items],
              },
              ...old.pages.slice(1),
            ],
          };
        }
      );

      return { previousData };
    },
    onError: (_err, _newPost, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  // Resolves once the post is saved and rejects when it was not, so the form
  // clears only on success.
  return { mutateAsync: createPost.mutateAsync };
}
