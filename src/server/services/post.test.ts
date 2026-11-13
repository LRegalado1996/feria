import { describe, expect, test } from "vitest";

import { getGravatarUrl } from "@/lib/utils/get-gravatar-url";
import { post } from "@/server/db/schema";
import { createMockDatabase } from "@/server/test/context";
import { renderOrderBy, renderQuery } from "@/server/test/render-sql";

import { createPost, deletePost, listPosts, POSTS_PER_PAGE } from "./post";

const CREATED_AT = new Date("2024-06-15T12:00:00.123Z");

function postRow(id: number, author: { image: string | null }) {
  return {
    id,
    name: `Post ${id}`,
    createdById: "user-1",
    createdAt: new Date(CREATED_AT.getTime() - id),
    updatedAt: CREATED_AT,
    createdBy: {
      id: "user-1",
      name: "Alice",
      image: author.image,
      email: "alice@example.com",
    },
  };
}

/** Rows newest first, ids counting down from 100. */
function postRows(count: number) {
  return Array.from({ length: count }, (_, i) =>
    postRow(100 - i, { image: null })
  );
}

function setup() {
  const db = createMockDatabase();

  return {
    db,
    // The config the service handed `db.query.post.findMany`.
    feedQuery: () =>
      db.query.post.findMany.mock.calls[0]?.[0] as {
        limit: number;
        orderBy: unknown;
        where: unknown;
        with: unknown;
      },
    create: async () =>
      await createPost(db as never, { name: "Hello", createdById: "user-1" }),
    list: async (input: Parameters<typeof listPosts>[1] = {}) =>
      await listPosts(db as never, input),
    remove: async () =>
      await deletePost(db as never, { id: 7, userId: "user-1" }),
  };
}

describe("createPost", () => {
  test("inserts the post under its author and returns the stored row", async () => {
    const { db, create } = setup();
    const stored = {
      id: 1,
      name: "Hello",
      createdById: "user-1",
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    };
    db.$["insert.returning"].mockResolvedValue([stored]);

    await expect(create()).resolves.toBe(stored);

    expect(db.$.insert).toHaveBeenCalledExactlyOnceWith(post);
    expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith({
      name: "Hello",
      createdById: "user-1",
    });
  });

  test("fails loudly when the insert returns no row", async () => {
    const { db, create } = setup();
    db.$["insert.returning"].mockResolvedValue([]);

    await expect(create()).rejects.toThrow("Inserting a post returned no row");
  });
});

describe("listPosts", () => {
  test("reads the first page newest first, the id breaking ties, one row past the page", async () => {
    const { feedQuery, list } = setup();

    await list();

    const query = feedQuery();
    expect(query.where).toBeUndefined();
    expect(renderOrderBy(query.orderBy)).toBe(
      '"post"."createdAt" desc, "post"."id" desc'
    );
    expect(query.limit).toBe(POSTS_PER_PAGE + 1);
  });

  test("continues strictly after the cursor's whole sort key", async () => {
    const { feedQuery, list } = setup();

    await list({ cursor: { createdAt: CREATED_AT, id: 42 } });

    expect(renderQuery(feedQuery().where)).toEqual({
      sql: '("post"."createdAt", "post"."id") < ($1, $2)',
      params: [CREATED_AT, 42],
    });
  });

  test("reads only the author fields the feed shows", async () => {
    const { feedQuery, list } = setup();

    await list();

    expect(feedQuery().with).toEqual({
      createdBy: {
        columns: { id: true, name: true, image: true, email: true },
      },
    });
  });

  test("cuts a full page at the page size and points the cursor at its last post", async () => {
    const { db, list } = setup();
    const rows = postRows(POSTS_PER_PAGE + 1);
    db.query.post.findMany.mockResolvedValue(rows);

    const page = await list();

    expect(page.items.map(({ id }) => id)).toEqual(
      rows.slice(0, POSTS_PER_PAGE).map(({ id }) => id)
    );
    const last = rows[POSTS_PER_PAGE - 1];
    expect(page.nextCursor).toEqual({
      createdAt: last?.createdAt,
      id: last?.id,
    });
  });

  test("ends the feed on a page of exactly the page size, when no row follows it", async () => {
    const { db, list } = setup();
    const rows = postRows(POSTS_PER_PAGE);
    db.query.post.findMany.mockResolvedValue(rows);

    const page = await list();

    expect(page.items.map(({ id }) => id)).toEqual(rows.map(({ id }) => id));
    expect(page.nextCursor).toBeNull();
  });

  test("ends an empty feed", async () => {
    const { list } = setup();

    await expect(list()).resolves.toEqual({ items: [], nextCursor: null });
  });

  test("shows the author's picture, or their Gravatar, and never their email", async () => {
    const { db, list } = setup();
    db.query.post.findMany.mockResolvedValue([
      postRow(2, { image: "https://example.com/alice.png" }),
      postRow(1, { image: null }),
    ]);

    const { items } = await list();

    expect(items.map(({ createdBy }) => createdBy)).toEqual([
      { id: "user-1", name: "Alice", image: "https://example.com/alice.png" },
      {
        id: "user-1",
        name: "Alice",
        image: getGravatarUrl("alice@example.com"),
      },
    ]);
  });
});

describe("deletePost", () => {
  test("deletes the post only where both its id and its author match", async () => {
    const { db, remove } = setup();
    db.$["delete.returning"].mockResolvedValue([{ id: 7 }]);

    await expect(remove()).resolves.toEqual({ id: 7 });

    expect(db.$.delete).toHaveBeenCalledExactlyOnceWith(post);
    expect(renderQuery(db.$["delete.where"].mock.calls[0]?.[0])).toEqual({
      sql: '("post"."id" = $1 and "post"."createdById" = $2)',
      params: [7, "user-1"],
    });
  });

  test("answers NOT_FOUND when no post of the user matched, whoever wrote it", async () => {
    const { db, remove } = setup();
    db.$["delete.returning"].mockResolvedValue([]);

    await expect(remove()).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Post not found",
    });
  });
});
