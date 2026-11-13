import { ORPCError } from "@orpc/server";
import { and, desc, eq, sql } from "drizzle-orm";

import type {
  CreatePostValues,
  DeletePostValues,
  GetPostsValues,
} from "@/lib/schemas/post";
import { getGravatarUrl } from "@/lib/utils/get-gravatar-url";
import type { DatabaseClient } from "@/server/db";
import { post } from "@/server/db/schema";

export const POSTS_PER_PAGE = 10;

export async function createPost(
  db: DatabaseClient,
  { name, createdById }: CreatePostValues & { createdById: string }
) {
  const [created] = await db
    .insert(post)
    .values({ name, createdById })
    .returning();

  if (!created) {
    throw new Error("Inserting a post returned no row");
  }

  return created;
}

/**
 * Deletes one of `userId`'s posts. The owner is part of the query, not a check
 * after it: someone else's post and a missing one are the same NOT_FOUND, so
 * the answer never confirms that another user's post exists.
 */
export async function deletePost(
  db: DatabaseClient,
  { id, userId }: DeletePostValues & { userId: string }
) {
  const [deleted] = await db
    .delete(post)
    .where(and(eq(post.id, id), eq(post.createdById, userId)))
    .returning({ id: post.id });

  if (!deleted) {
    throw new ORPCError("NOT_FOUND", { message: "Post not found" });
  }

  return deleted;
}

/** One page of the feed, newest first. */
export async function listPosts(
  db: DatabaseClient,
  { cursor }: GetPostsValues
) {
  // One row past the page tells whether another page follows.
  const rows = await db.query.post.findMany({
    limit: POSTS_PER_PAGE + 1,
    // The id breaks ties between posts created in the same millisecond, and
    // the cursor carries both, so no post is skipped or repeated.
    where: cursor
      ? sql`(${post.createdAt}, ${post.id}) < (${cursor.createdAt}, ${cursor.id})`
      : undefined,
    orderBy: [desc(post.createdAt), desc(post.id)],
    with: {
      createdBy: {
        columns: { id: true, name: true, image: true, email: true },
      },
    },
  });

  const items = rows.slice(0, POSTS_PER_PAGE);
  const last = items.at(-1);
  const nextCursor =
    rows.length > POSTS_PER_PAGE && last
      ? { createdAt: last.createdAt, id: last.id }
      : null;

  return {
    items: items.map(({ createdBy, ...item }) => ({
      ...item,
      createdBy: {
        id: createdBy.id,
        name: createdBy.name,
        image: createdBy.image ?? getGravatarUrl(createdBy.email),
      },
    })),
    nextCursor,
  };
}
