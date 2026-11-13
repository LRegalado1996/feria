import {
  createPostSchema,
  deletePostSchema,
  getPostsSchema,
} from "@/lib/schemas/post";
import { protectedProcedure, publicProcedure } from "@/server/api/orpc";
import { createPost, deletePost, listPosts } from "@/server/services/post";

export const postRouter = {
  create: protectedProcedure
    .input(createPostSchema)
    .handler(
      async ({ context, input }) =>
        await createPost(context.db, {
          ...input,
          createdById: context.session.user.id,
        })
    )
    .route({
      method: "POST",
      path: "/posts",
      summary: "Create a post",
      tags: ["posts"],
    }),

  delete: protectedProcedure
    .input(deletePostSchema)
    .handler(
      async ({ context, input }) =>
        await deletePost(context.db, {
          ...input,
          userId: context.session.user.id,
        })
    )
    .route({
      method: "DELETE",
      path: "/posts/{id}",
      summary: "Delete one of your own posts",
      tags: ["posts"],
    }),

  getAll: publicProcedure
    .input(getPostsSchema)
    .handler(async ({ context, input }) => await listPosts(context.db, input))
    .route({
      method: "GET",
      path: "/posts",
      summary: "List posts with cursor pagination",
      tags: ["posts"],
    }),
};
