import { randomUUID } from "node:crypto";

import { call } from "@orpc/server";
import { count, eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { GetPostsValues } from "@/lib/schemas/post";
import { db } from "@/server/db";
import { post, user } from "@/server/db/schema";
import { POSTS_PER_PAGE } from "@/server/services/post";

import { postRouter } from "./post";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// The users this file inserted. Deleting one cascades to its posts, so this
// is the whole cleanup, and it never reaches a row another file owns.
const createdUserIds: string[] = [];

afterEach(async () => {
  await db.delete(user).where(inArray(user.id, createdUserIds.splice(0)));
});

async function insertUser(name: string) {
  const id = randomUUID();
  const [row] = await db
    .insert(user)
    .values({ id, name, email: `${id}@example.test`, emailVerified: true })
    .returning();

  if (!row) {
    throw new Error("Inserting a user returned no row");
  }

  createdUserIds.push(row.id);
  return row;
}

type Person = Awaited<ReturnType<typeof insertUser>>;

function contextFor(person: Person | null) {
  const session = person && {
    user: person,
    session: {
      id: `session-${person.id}`,
      userId: person.id,
      token: `token-${person.id}`,
      expiresAt: new Date("2999-01-01T00:00:00.000Z"),
      createdAt: person.createdAt,
      updatedAt: person.createdAt,
    },
  };

  return { context: { db, headers: new Headers(), session } };
}

/** A signed-in author, the router bound to them, and a reader for their posts. */
async function setup({ signedIn = true } = {}) {
  const author = await insertUser("Author");
  const options = contextFor(signedIn ? author : null);

  return {
    author,
    create: async (name: string) =>
      await call(postRouter.create, { name }, options),
    getAll: async (input: GetPostsValues) =>
      await call(postRouter.getAll, input, options),
    remove: async (id: number) =>
      await call(postRouter.delete, { id }, options),
    postsBy: async (userId: string) =>
      await db.query.post.findMany({ where: eq(post.createdById, userId) }),
  };
}

async function countPosts() {
  const [row] = await db.select({ total: count() }).from(post);
  return row?.total;
}

describe("post.create", () => {
  test("stores the trimmed post as the signed-in author", async () => {
    const { author, create, postsBy } = await setup();

    const created = await create("  Integration post ");

    expect(created).toMatchObject({
      name: "Integration post",
      createdById: author.id,
    });
    expect(await postsBy(author.id)).toEqual([created]);
  });

  test("refuses a signed-out caller and stores nothing", async () => {
    const { create } = await setup({ signedIn: false });
    const before = await countPosts();

    await expect(create("Not stored")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });

    expect(await countPosts()).toBe(before);
  });
});

describe("post.getAll", () => {
  test("leads the feed with the newest post", async () => {
    const { create, getAll } = await setup();
    const older = await create("Older");
    const newer = await create("Newer");

    const { items } = await getAll({});

    const mine = new Set([older.id, newer.id]);
    expect(
      items.filter(({ id }) => mine.has(id)).map(({ name }) => name)
    ).toEqual(["Newer", "Older"]);
  });

  test("pages posts created in the same millisecond without skipping or repeating one", async () => {
    const { author, getAll } = await setup();
    // Later than any real post, so these lead the feed; one page and a bit.
    const createdAt = new Date("2999-01-01T00:00:00.000Z");
    const inserted = await db
      .insert(post)
      .values(
        Array.from({ length: POSTS_PER_PAGE + 2 }, (_, i) => ({
          name: `Same instant ${i}`,
          createdById: author.id,
          createdAt,
        }))
      )
      .returning({ id: post.id });
    // Identity ids follow the VALUES order, so newest-first is the reverse.
    // oxlint-disable-next-line unicorn/no-array-reverse -- reverses the fresh array map() returned; toReversed() is outside the ES2022 lib
    const newestFirst = inserted.map(({ id }) => id).reverse();

    const first = await getAll({});
    const second = await getAll({ cursor: first.nextCursor ?? undefined });

    expect(first.nextCursor).toEqual({
      createdAt,
      id: newestFirst[POSTS_PER_PAGE - 1],
    });
    // The highest id first among equal timestamps, each exactly once.
    expect(
      [...first.items, ...second.items]
        .filter(({ createdById }) => createdById === author.id)
        .map(({ id }) => id)
    ).toEqual(newestFirst);
  });
});

describe("post.delete", () => {
  test("deletes the author's own post, once", async () => {
    const { author, create, postsBy, remove } = await setup();
    const own = await create("Mine to delete");

    await expect(remove(own.id)).resolves.toEqual({ id: own.id });

    expect(await postsBy(author.id)).toEqual([]);
    await expect(remove(own.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Post not found",
    });
  });

  test("refuses someone else's post as NOT_FOUND and leaves it alone", async () => {
    const { remove } = await setup();
    const someoneElse = await insertUser("Someone Else");
    const [others] = await db
      .insert(post)
      .values({ name: "Not mine", createdById: someoneElse.id })
      .returning();

    if (!others) {
      throw new Error("Inserting a post returned no row");
    }

    await expect(remove(others.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Post not found",
    });

    expect(
      await db.query.post.findMany({ where: eq(post.id, others.id) })
    ).toEqual([others]);
  });
});
