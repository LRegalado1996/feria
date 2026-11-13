import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import {
  createMockContext,
  createUnauthenticatedMockContext,
} from "@/server/test/context";
import { renderQuery } from "@/server/test/render-sql";

import { postRouter } from "./post";

// The router is input → auth → service. These tests cover that wiring; the
// queries are `src/server/services/post.test.ts`'s.

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

vi.mock("@/server/better-auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => null),
    },
  },
}));

const CREATED_AT = new Date("2024-06-15T12:00:00.123Z");

const INVALID_INPUT = {
  code: "BAD_REQUEST",
  message: "Input validation failed",
};

const SIGNED_OUT = { code: "UNAUTHORIZED", message: "Unauthorized" };

function makePost(overrides: { name?: string } = {}) {
  return {
    id: 1,
    name: "Hello",
    createdById: "test-user-id",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

function setup({ signedIn = true } = {}) {
  const { mockCtx } = signedIn
    ? createMockContext()
    : createUnauthenticatedMockContext();
  const options = { context: mockCtx as never };

  return {
    db: mockCtx.db,
    create: async (input: unknown) =>
      await call(postRouter.create, input as never, options),
    getAll: async (input: unknown) =>
      await call(postRouter.getAll, input as never, options),
    remove: async (input: unknown) =>
      await call(postRouter.delete, input as never, options),
  };
}

describe("post.create", () => {
  test("creates the trimmed post as the signed-in user", async () => {
    const { db, create } = setup();
    db.$["insert.returning"].mockResolvedValue([makePost()]);

    await expect(create({ name: "  Hello " })).resolves.toEqual(makePost());

    expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith({
      name: "Hello",
      createdById: "test-user-id",
    });
  });

  test("takes the author from the session, never from the input", async () => {
    const { db, create } = setup();
    db.$["insert.returning"].mockResolvedValue([makePost()]);

    // An extra key a client could send; the schema drops it.
    await create({ name: "Hello", createdById: "someone-else" });

    expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith({
      name: "Hello",
      createdById: "test-user-id",
    });
  });

  test("accepts a name of exactly the maximum length", async () => {
    const { db, create } = setup();
    const name = "x".repeat(280);
    db.$["insert.returning"].mockResolvedValue([makePost({ name })]);

    await expect(create({ name })).resolves.toEqual(makePost({ name }));
  });

  test.each([
    ["blank", "   "],
    ["one character over the maximum", "x".repeat(281)],
  ])("refuses a %s name before touching the database", async (_case, name) => {
    const { db, create } = setup();

    await expect(create({ name })).rejects.toMatchObject(INVALID_INPUT);
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  test("refuses a signed-out caller before touching the database", async () => {
    const { db, create } = setup({ signedIn: false });

    await expect(create({ name: "Hello" })).rejects.toMatchObject(SIGNED_OUT);
    expect(db.$.insert).not.toHaveBeenCalled();
  });
});

describe("post.getAll", () => {
  test("serves a signed-out visitor the first page", async () => {
    const { db, getAll } = setup({ signedIn: false });
    db.query.post.findMany.mockResolvedValue([
      {
        ...makePost(),
        createdBy: {
          id: "test-user-id",
          name: "Test User",
          image: "https://example.com/a.png",
          email: "test@example.com",
        },
      },
    ]);

    await expect(getAll({})).resolves.toEqual({
      items: [
        {
          ...makePost(),
          createdBy: {
            id: "test-user-id",
            name: "Test User",
            image: "https://example.com/a.png",
          },
        },
      ],
      nextCursor: null,
    });
    expect(db.query.post.findMany).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ where: undefined })
    );
  });

  test("pages from the cursor it was given, down to the smallest id", async () => {
    const { db, getAll } = setup();

    await getAll({ cursor: { createdAt: CREATED_AT, id: 1 } });

    const query = db.query.post.findMany.mock.calls[0]?.[0] as {
      where: unknown;
    };
    expect(renderQuery(query.where).params).toEqual([CREATED_AT, 1]);
  });

  test.each([
    ["zero", 0],
    ["a negative", -1],
    ["a fractional", 1.5],
  ])(
    "refuses a cursor with %s id before touching the database",
    async (_case, id) => {
      const { db, getAll } = setup();

      await expect(
        getAll({ cursor: { createdAt: CREATED_AT, id } })
      ).rejects.toMatchObject(INVALID_INPUT);
      expect(db.query.post.findMany).not.toHaveBeenCalled();
    }
  );
});

describe("post.delete", () => {
  test("deletes the post as the signed-in user, never one the input names", async () => {
    const { db, remove } = setup();
    db.$["delete.returning"].mockResolvedValue([{ id: 1 }]);

    await expect(
      remove({ id: 1, createdById: "someone-else" })
    ).resolves.toEqual({ id: 1 });

    expect(renderQuery(db.$["delete.where"].mock.calls[0]?.[0]).params).toEqual(
      [1, "test-user-id"]
    );
  });

  test("answers NOT_FOUND for a post that is not the caller's", async () => {
    const { db, remove } = setup();
    db.$["delete.returning"].mockResolvedValue([]);

    await expect(remove({ id: 7 })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Post not found",
    });
  });

  test("refuses a signed-out caller before touching the database", async () => {
    const { db, remove } = setup({ signedIn: false });

    await expect(remove({ id: 7 })).rejects.toMatchObject(SIGNED_OUT);
    expect(db.$.delete).not.toHaveBeenCalled();
  });

  test.each([
    ["zero", 0],
    ["a negative", -1],
    ["a fractional", 1.5],
  ])("refuses %s id before touching the database", async (_case, id) => {
    const { db, remove } = setup();

    await expect(remove({ id })).rejects.toMatchObject(INVALID_INPUT);
    expect(db.$.delete).not.toHaveBeenCalled();
  });
});
