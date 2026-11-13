import { z } from "zod";

export const POST_NAME_MAX_LENGTH = 280;

export const createPostSchema = z.object({
  // Trimmed first: `min(1)` alone accepts "   ".
  name: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(POST_NAME_MAX_LENGTH, `Keep it to ${POST_NAME_MAX_LENGTH} characters`),
});

export type CreatePostValues = z.infer<typeof createPostSchema>;

export const getPostsSchema = z.object({
  // The feed's keyset: the last post's `createdAt` and `id`, the whole sort
  // key. Coerced, because the REST surface reads it from the query string.
  cursor: z
    .object({
      createdAt: z.coerce.date(),
      id: z.coerce.number().int().positive(),
    })
    .optional(),
});

export type GetPostsValues = z.infer<typeof getPostsSchema>;

export const deletePostSchema = z.object({
  // Coerced: the REST surface reads it from the path.
  id: z.coerce.number().int().positive(),
});

export type DeletePostValues = z.infer<typeof deletePostSchema>;
